// Backup Center — server-only logic. Admin-only callers (see
// backup-center.functions.ts) and the protected cron route use this module.
//
// Long work is a small state machine advanced in short steps (each step is one
// or two provider calls), so no request ever blocks for minutes and the
// storefront is never involved. Every step is idempotent and claimed with a
// conditional UPDATE, so two admin tabs polling at once cannot double-run it.
import { createHash } from "node:crypto";
import { neon, NeonDbError } from "@neondatabase/serverless";
import { sql } from "@/lib/neon.server";
import pkg from "../../package.json";
import {
  BACKUP_BRANCH_PREFIX,
  BACKUP_TIMEOUT_MS,
  DEFAULT_BACKUP_SETTINGS,
  REQUIRED_TABLES,
  TEST_BRANCH_PREFIX,
  TEST_TIMEOUT_MS,
  allOk,
  backupBranchName,
  buildRecoveryMetadata,
  createNeonClient,
  evaluateRestore,
  findBackupTagForCommit,
  findSourceBranchId,
  isBackupDue,
  isVerifyDue,
  leaksSecret,
  normalizeSettings,
  readNeonConfig,
  selectPrunable,
  suggestedTagName,
  urlForHost,
  verifyBackupBranch,
  type BackupSettings,
  type Check,
  type NeonClient,
  type SchemaFingerprint,
  type TableCounts,
} from "@/lib/backup-center.core";

declare const __BUILD_ID__: string | undefined;

const SETTINGS_KEY = "backup_center_settings";
const DEFAULT_REPO = "brwazwneon-dotcom/brwaz-poster-boutique";

/** Environment variable NAMES the app needs (never values). Server-side only. */
export const EXPECTED_ENV_NAMES = [
  "NEON_DATABASE_URL",
  "ADMIN_SESSION_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "GEMINI_API_KEY_1",
  "META_PIXEL_ACCESS_TOKEN",
  "META_MARKETING_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
  "GITHUB_TOKEN",
  "CRON_SECRET",
] as const;

export type RunRow = {
  id: string;
  kind: string;
  status: string;
  version: string | null;
  reference: string | null;
  size_bytes: number | string | null;
  verification: string;
  restore_test: string;
  parent_run_id: string | null;
  step: string | null;
  summary: Record<string, unknown>;
  error: string | null;
  triggered_by: string | null;
  created_at: string | Date;
  completed_at: string | Date | null;
  expires_at: string | Date | null;
};

/** Shape of backup_runs.summary for database runs (counts and check results only). */
type RunSummary = {
  sourceBranchId?: string;
  baselineCounts?: Partial<TableCounts>;
  baselineSchema?: SchemaFingerprint;
  backupChecks?: Check[];
  test?: { startedAt: string; childBranchId?: string; childHost?: string };
  restore?: unknown;
  cleanupPending?: string;
  [key: string]: unknown;
};

export const isMissingTable = (e: unknown) => e instanceof NeonDbError && e.code === "42P01";

function safeMessage(e: unknown): string {
  // Never surface raw provider/driver text (can contain hosts or ids).
  if (e instanceof Error && e.message.startsWith("Neon API")) return e.message;
  if (e instanceof Error && e.message.startsWith("GitHub API")) return e.message;
  return "Unexpected error";
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function loadSettings(): Promise<BackupSettings> {
  try {
    const rows =
      (await sql()`select value from site_settings where key = ${SETTINGS_KEY}`) as Array<{
        value: unknown;
      }>;
    return rows.length ? normalizeSettings(rows[0].value) : { ...DEFAULT_BACKUP_SETTINGS };
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS };
  }
}

export async function saveSettings(input: unknown): Promise<BackupSettings> {
  const s = normalizeSettings(input);
  await sql()`
    insert into site_settings (key, value) values (${SETTINGS_KEY}, ${JSON.stringify(s)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return s;
}

// ---------------------------------------------------------------------------
// Provider access
// ---------------------------------------------------------------------------
function neonClient(): { client: NeonClient; databaseUrl: string } | null {
  const cfg = readNeonConfig(process.env);
  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!cfg || !databaseUrl) return null;
  return { client: createNeonClient(cfg), databaseUrl };
}

export function integrationStatus() {
  return {
    neon: !!readNeonConfig(process.env) && !!process.env.NEON_DATABASE_URL,
    github: !!process.env.GITHUB_TOKEN,
    cron: !!process.env.CRON_SECRET,
  };
}

type Queryable = ReturnType<typeof sql>;

async function readCounts(db: Queryable): Promise<TableCounts> {
  // Fixed, non-user-controlled table names (REQUIRED_TABLES) — counts only.
  const rows = (await db`
    select
      (select count(*)::int from posters) as posters,
      (select count(*)::int from categories) as categories,
      (select count(*)::int from orders) as orders,
      (select count(*)::int from site_settings) as site_settings,
      (select count(*)::int from admin_users) as admin_users
  `) as TableCounts[];
  return rows[0];
}

async function readSchema(
  db: Queryable,
): Promise<{ fingerprint: SchemaFingerprint; tables: string[] }> {
  const fp = (await db`
    select count(distinct table_name)::int as tables, count(*)::int as columns
    from information_schema.columns where table_schema = 'public'
  `) as SchemaFingerprint[];
  const t = (await db`
    select table_name from information_schema.tables where table_schema = 'public'
  `) as Array<{ table_name: string }>;
  return { fingerprint: fp[0], tables: t.map((r) => r.table_name) };
}

async function updateRun(id: string, patch: Record<string, unknown>): Promise<void> {
  // Whitelisted columns only.
  const allowed = [
    "status",
    "version",
    "reference",
    "size_bytes",
    "verification",
    "restore_test",
    "step",
    "summary",
    "error",
    "completed_at",
    "expires_at",
  ];
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) throw new Error(`bad column ${k}`);
    const val = k === "summary" ? JSON.stringify(v) : v;
    // One statement per column keeps the template parameterised and simple.
    switch (k) {
      case "status":
        await sql()`update backup_runs set status = ${val as string} where id = ${id}`;
        break;
      case "version":
        await sql()`update backup_runs set version = ${val as string | null} where id = ${id}`;
        break;
      case "reference":
        await sql()`update backup_runs set reference = ${val as string | null} where id = ${id}`;
        break;
      case "size_bytes":
        await sql()`update backup_runs set size_bytes = ${val as number | null} where id = ${id}`;
        break;
      case "verification":
        await sql()`update backup_runs set verification = ${val as string} where id = ${id}`;
        break;
      case "restore_test":
        await sql()`update backup_runs set restore_test = ${val as string} where id = ${id}`;
        break;
      case "step":
        await sql()`update backup_runs set step = ${val as string | null} where id = ${id}`;
        break;
      case "summary":
        await sql()`update backup_runs set summary = ${val as string}::jsonb where id = ${id}`;
        break;
      case "error":
        await sql()`update backup_runs set error = ${val as string | null} where id = ${id}`;
        break;
      case "completed_at":
        await sql()`update backup_runs set completed_at = ${val as string | null}::timestamptz where id = ${id}`;
        break;
      case "expires_at":
        await sql()`update backup_runs set expires_at = ${val as string | null}::timestamptz where id = ${id}`;
        break;
    }
  }
}

/** Atomically move a run from one step to another; false when someone else already did. */
async function claimStep(id: string, from: string, to: string): Promise<boolean> {
  const rows = await sql()`
    update backup_runs set step = ${to} where id = ${id} and step = ${from} returning id
  `;
  return rows.length === 1;
}

async function getRun(id: string): Promise<RunRow | null> {
  const rows = (await sql()`select * from backup_runs where id = ${id}`) as RunRow[];
  return rows[0] ?? null;
}

export async function listRuns(limit = 30): Promise<RunRow[]> {
  const rows = (await sql()`
    select * from backup_runs order by created_at desc limit ${limit}
  `) as RunRow[];
  // The recovery snapshot can be several KB; the list only needs its checksum.
  return rows.map((r) => {
    const { metadata: _drop, ...rest } = (r.summary ?? {}) as Record<string, unknown>;
    void _drop;
    return { ...r, summary: rest };
  });
}

async function insertRun(input: {
  kind: string;
  status: string;
  version?: string | null;
  reference?: string | null;
  step?: string | null;
  summary?: Record<string, unknown>;
  triggeredBy: string;
}): Promise<string> {
  const rows = (await sql()`
    insert into backup_runs (kind, status, version, reference, step, summary, triggered_by)
    values (${input.kind}, ${input.status}, ${input.version ?? null}, ${input.reference ?? null},
            ${input.step ?? null}, ${JSON.stringify(input.summary ?? {})}::jsonb, ${input.triggeredBy})
    returning id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Database backup (Neon branch)
// ---------------------------------------------------------------------------
export type StartResult =
  { ok: true; runId: string } | { ok: false; reason: string; message: string };

export async function startDatabaseBackup(triggeredBy: "admin" | "schedule"): Promise<StartResult> {
  const n = neonClient();
  if (!n) {
    return {
      ok: false,
      reason: "neon_not_configured",
      message:
        "Database backups need NEON_API_KEY and NEON_PROJECT_ID in the Vercel environment (Neon console > Account > API keys).",
    };
  }
  const running = (await sql()`
    select id from backup_runs
    where kind = 'database' and (status = 'running' or restore_test = 'running')
      and created_at > now() - interval '1 hour'
    limit 1
  `) as Array<{ id: string }>;
  if (running.length) {
    return {
      ok: false,
      reason: "already_running",
      message: "A database backup is already in progress.",
    };
  }
  const name = backupBranchName(new Date());
  let runId: string | null = null;
  try {
    const endpoints = await n.client.listEndpoints();
    const sourceBranchId = findSourceBranchId(n.databaseUrl, endpoints);
    if (!sourceBranchId) {
      return {
        ok: false,
        reason: "source_not_found",
        message: "Could not match the production database to a Neon branch. Check NEON_PROJECT_ID.",
      };
    }
    const db = neon(n.databaseUrl);
    const [counts, schema] = [await readCounts(db), await readSchema(db)];
    runId = await insertRun({
      kind: "database",
      status: "running",
      reference: name,
      step: "branch_creating",
      summary: { baselineCounts: counts, baselineSchema: schema.fingerprint, sourceBranchId },
      triggeredBy,
    });
    const created = await n.client.createBranch({
      name,
      parentId: sourceBranchId,
      readOnlyEndpoint: false,
    });
    await updateRun(runId, { version: created.branch.id, step: "branch_wait" });
    return { ok: true, runId };
  } catch (e) {
    if (runId) {
      await updateRun(runId, {
        status: "failed",
        step: null,
        error: safeMessage(e),
        completed_at: new Date().toISOString(),
      }).catch(() => undefined);
    }
    return { ok: false, reason: "error", message: safeMessage(e) };
  }
}

export async function startRestoreTest(
  runId: string | null,
  triggeredBy: "admin" | "schedule",
): Promise<StartResult> {
  void triggeredBy;
  if (!neonClient()) {
    return { ok: false, reason: "neon_not_configured", message: "Neon is not configured." };
  }
  const target = runId
    ? await getRun(runId)
    : ((
        (await sql()`
          select * from backup_runs
          where kind = 'database' and status = 'completed' and verification = 'verified'
            and reference like ${BACKUP_BRANCH_PREFIX + "%"}
          order by created_at desc limit 1
        `) as RunRow[]
      )[0] ?? null);
  if (!target || target.kind !== "database" || target.status !== "completed" || !target.version) {
    return {
      ok: false,
      reason: "no_backup",
      message: "There is no completed database backup to test.",
    };
  }
  if (target.restore_test === "running") {
    return { ok: false, reason: "already_running", message: "A restore test is already running." };
  }
  await updateRun(target.id, {
    restore_test: "running",
    step: "test_create_child",
    summary: { ...target.summary, test: { startedAt: new Date().toISOString() } },
  });
  return { ok: true, runId: target.id };
}

async function failBackup(run: RunRow, n: { client: NeonClient } | null, message: string) {
  // Remove the half-made branch we created ourselves (prefix-checked).
  if (n && run.version && run.reference?.startsWith(BACKUP_BRANCH_PREFIX)) {
    await n.client.deleteBranch(run.version).catch(() => undefined);
  }
  await updateRun(run.id, {
    status: "failed",
    step: null,
    error: message,
    completed_at: new Date().toISOString(),
  });
}

async function pruneOldBackups(n: { client: NeonClient }): Promise<number> {
  const settings = await loadSettings();
  const rows = (await sql()`
    select id, status, verification, reference, version, created_at from backup_runs
    where kind = 'database' order by created_at desc limit 200
  `) as Array<RunRow>;
  const prunable = selectPrunable(
    rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).getTime(),
      status: r.status,
      verification: r.verification,
      reference: r.reference,
    })),
    settings.retentionKeep,
  );
  let removed = 0;
  for (const p of prunable) {
    const run = rows.find((r) => r.id === p.id);
    if (!run?.version) continue;
    try {
      await n.client.deleteBranch(run.version);
      await updateRun(run.id, { status: "expired", expires_at: new Date().toISOString() });
      removed += 1;
    } catch {
      /* keep the record; try again next time */
    }
  }
  return removed;
}

async function advanceDatabaseRun(run: RunRow): Promise<void> {
  const n = neonClient();
  if (!n) return;
  const summary = run.summary as RunSummary;
  const age = Date.now() - new Date(run.created_at).getTime();

  // 1. wait for the backup branch, verify the artifact
  if (run.status === "running" && run.step === "branch_wait" && run.version) {
    let branch = null;
    try {
      branch = await n.client.getBranch(run.version);
    } catch (e) {
      if (age > BACKUP_TIMEOUT_MS) return failBackup(run, n, safeMessage(e));
      return;
    }
    if (branch.current_state !== "ready") {
      if (age > BACKUP_TIMEOUT_MS)
        return failBackup(run, n, "Backup branch did not become ready in time.");
      return;
    }
    const checks = verifyBackupBranch(branch, {
      id: run.version,
      name: run.reference ?? "",
      sourceBranchId: String(summary.sourceBranchId ?? ""),
    });
    const ok = allOk(checks);
    await updateRun(run.id, {
      status: "completed",
      verification: ok ? "verified" : "failed",
      size_bytes: branch.logical_size ?? null,
      completed_at: new Date().toISOString(),
      // Verified artifact -> go straight on to the isolated restore test.
      restore_test: ok ? "running" : "not_tested",
      step: ok ? "test_create_child" : null,
      summary: { ...summary, backupChecks: checks, test: { startedAt: new Date().toISOString() } },
    });
    if (ok) await pruneOldBackups(n).catch(() => undefined);
    return;
  }

  // 2. restore test: temporary read-only child branch of the backup
  if (run.restore_test === "running" && run.step === "test_create_child" && run.version) {
    if (!(await claimStep(run.id, "test_create_child", "test_creating"))) return;
    try {
      const child = await n.client.createBranch({
        name: `${TEST_BRANCH_PREFIX}${run.id.slice(0, 8)}-${Date.now().toString(36)}`,
        parentId: run.version,
        readOnlyEndpoint: true,
      });
      const host = child.endpoints[0]?.host;
      if (!host) throw new Error("Neon API: restore test endpoint missing");
      await updateRun(run.id, {
        step: "test_wait",
        summary: {
          ...summary,
          test: {
            startedAt: summary.test?.startedAt ?? new Date().toISOString(),
            childBranchId: child.branch.id,
            childHost: host,
          },
        },
      });
    } catch (e) {
      await updateRun(run.id, {
        restore_test: "failed",
        step: null,
        summary: {
          ...summary,
          restore: { at: new Date().toISOString(), ok: false, reason: safeMessage(e), checks: [] },
        },
      });
    }
    return;
  }

  if (run.restore_test === "running" && run.step === "test_wait") {
    const test = summary.test as { startedAt: string; childBranchId: string; childHost: string };
    const started = new Date(test.startedAt).getTime();
    let checks: Check[] | null = null;
    let counts: Partial<TableCounts> = {};
    let reason: string | null = null;
    try {
      const db = neon(urlForHost(n.databaseUrl, test.childHost));
      await db`select 1`;
      const [restoredCounts, schema] = [await readCounts(db), await readSchema(db)];
      counts = restoredCounts;
      checks = evaluateRestore({
        tablesInRestore: schema.tables,
        restoredCounts,
        baselineCounts: summary.baselineCounts ?? {},
        baselineSchema: summary.baselineSchema ?? { tables: 0, columns: 0 },
        restoredSchema: schema.fingerprint,
      });
    } catch (e) {
      // The temporary compute may still be starting: keep waiting until timeout.
      if (Date.now() - started < TEST_TIMEOUT_MS) return;
      reason = e instanceof NeonDbError ? "Could not read the restored copy." : safeMessage(e);
    }
    if (!(await claimStep(run.id, "test_wait", "test_cleanup"))) return;
    const ok = !!checks && allOk(checks);
    await updateRun(run.id, {
      restore_test: ok ? "passed" : "failed",
      summary: {
        ...summary,
        restore: {
          at: new Date().toISOString(),
          ok,
          reason: ok ? null : (reason ?? "One or more checks failed"),
          checks: checks ?? [],
          restoredCounts: counts,
        },
      },
    });
    return;
  }

  // 3. always delete the temporary branch
  if (run.step === "test_cleanup") {
    const test = summary.test as { childBranchId?: string } | undefined;
    if (test?.childBranchId) {
      try {
        await n.client.deleteBranch(test.childBranchId);
      } catch {
        await updateRun(run.id, { summary: { ...summary, cleanupPending: test.childBranchId } });
        return; // retried on the next poll
      }
    }
    const { cleanupPending: _c, ...rest } = summary;
    void _c;
    await updateRun(run.id, { step: null, summary: rest });
  }
}

/** Advance every in-flight run by one step. Safe to call from several pollers. */
export async function advanceRuns(): Promise<{ advanced: number }> {
  const runs = (await sql()`
    select * from backup_runs
    where (status = 'running' or restore_test = 'running' or step = 'test_cleanup')
      and kind = 'database' and created_at > now() - interval '1 day'
    order by created_at asc
  `) as RunRow[];
  for (const r of runs) {
    try {
      await advanceDatabaseRun(r);
    } catch {
      /* next poll retries */
    }
  }
  // Anything stuck for over an hour without finishing is reported, not left "running" forever.
  await sql()`
    update backup_runs set status = 'failed', step = null,
      error = 'Timed out while running', completed_at = now()
    where kind = 'database' and status = 'running' and created_at < now() - interval '1 hour'
  `;
  await sql()`
    update backup_runs set restore_test = 'failed', step = null
    where kind = 'database' and restore_test = 'running' and created_at < now() - interval '1 hour'
      and step is distinct from 'test_cleanup'
  `;
  return { advanced: runs.length };
}

// ---------------------------------------------------------------------------
// Recovery metadata (Type C)
// ---------------------------------------------------------------------------
export async function recordMetadataBackup(triggeredBy: "admin" | "schedule"): Promise<string> {
  const latestDb = (await sql()`
    select reference from backup_runs
    where kind = 'database' and status = 'completed' order by created_at desc limit 1
  `) as Array<{ reference: string | null }>;
  const latestTag = (await sql()`
    select reference from backup_runs
    where kind = 'source' and verification = 'verified' order by created_at desc limit 1
  `) as Array<{ reference: string | null }>;
  let schema: SchemaFingerprint | null = null;
  try {
    schema = (await readSchema(sql())).fingerprint;
  } catch {
    schema = null;
  }
  const meta = buildRecoveryMetadata({
    now: new Date(),
    env: process.env,
    expectedEnvNames: EXPECTED_ENV_NAMES,
    packageJson: pkg as never,
    buildId: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : null,
    schema,
    latestDatabaseBackup: latestDb[0]?.reference ?? null,
    latestSourceTag: latestTag[0]?.reference ?? null,
    nodeVersion: process.version,
    platform: process.platform,
  });
  const serialized = JSON.stringify(meta);
  const checksum = createHash("sha256").update(serialized).digest("hex");
  // Verify: it re-reads, re-hashes identically, has the key sections, holds no secret value.
  let readable = false;
  try {
    const back = JSON.parse(serialized) as Record<string, unknown>;
    readable = ["production", "environment", "instructions", "databaseProvider"].every(
      (k) => k in back,
    );
  } catch {
    readable = false;
  }
  const checks: Check[] = [
    { id: "readable", label: "Snapshot is readable and complete", ok: readable },
    {
      id: "checksum",
      label: "Checksum is valid",
      ok: createHash("sha256").update(serialized).digest("hex") === checksum,
    },
    {
      id: "secrets",
      label: "Contains no secret values",
      ok: !leaksSecret(serialized, process.env),
    },
  ];
  const ok = allOk(checks);
  const id = await insertRun({
    kind: "metadata",
    status: "completed",
    version: meta.production.commit,
    reference: meta.production.deploymentId,
    // Metadata only; the full JSON is kept in `summary.metadata` (a few KB).
    summary: { checksum, bytes: serialized.length, checks, metadata: meta },
    triggeredBy,
  });
  await updateRun(id, {
    verification: ok ? "verified" : "failed",
    size_bytes: serialized.length,
    completed_at: new Date().toISOString(),
  });
  return id;
}

export async function getRecoveryMetadata(
  runId: string,
): Promise<{ json: string; checksum: string } | null> {
  const run = await getRun(runId);
  const meta = (run?.summary as Record<string, unknown> | undefined)?.metadata;
  if (!run || run.kind !== "metadata" || !meta) return null;
  const json = JSON.stringify(meta, null, 2);
  return { json, checksum: String((run.summary as Record<string, unknown>).checksum ?? "") };
}

// ---------------------------------------------------------------------------
// Source backup (Type B): Git/GitHub is the source of truth
// ---------------------------------------------------------------------------
export function productionSourceInfo() {
  const repo =
    process.env.GITHUB_REPOSITORY ||
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : DEFAULT_REPO);
  return {
    repo,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    buildId: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : null,
  };
}

export async function recordSourceBackup(triggeredBy: "admin" | "schedule"): Promise<string> {
  const info = productionSourceInfo();
  const suggested = suggestedTagName(new Date(), info.commit);
  let tag: string | null = null;
  let verification: "verified" | "failed" | "not_verified" = "not_verified";
  let note = "";
  if (!info.commit) {
    note = "This deployment carries no Git commit information, so the source cannot be checked.";
  } else if (!process.env.GITHUB_TOKEN) {
    note =
      "Add a read-only GITHUB_TOKEN to verify the tag on GitHub. Until then this is not verified.";
  } else {
    try {
      const found = await findBackupTagForCommit({
        repo: info.repo,
        commit: info.commit,
        token: process.env.GITHUB_TOKEN,
      });
      tag = found.tag;
      if (!found.commitExists) {
        verification = "failed";
        note = "The live commit was not found on GitHub.";
      } else if (tag) {
        verification = "verified";
        note = `Tag ${tag} points at the live commit on GitHub.`;
      } else {
        note = `No backup tag points at the live commit. Create one: git tag -a ${suggested} ${info.commit.slice(0, 7)} && git push origin ${suggested}`;
      }
    } catch (e) {
      note = safeMessage(e);
    }
  }
  const id = await insertRun({
    kind: "source",
    status: "completed",
    version: info.commit,
    reference: tag ?? suggested,
    summary: {
      repo: info.repo,
      branch: info.branch,
      deploymentId: info.deploymentId,
      buildId: info.buildId,
      tag,
      suggestedTag: suggested,
      note,
    },
    triggeredBy,
  });
  await updateRun(id, { verification, completed_at: new Date().toISOString() });
  return id;
}

// ---------------------------------------------------------------------------
// Scheduled run (daily cron) — safe default: does nothing until enabled.
// ---------------------------------------------------------------------------
export async function runScheduled(): Promise<Record<string, unknown>> {
  const settings = await loadSettings();
  if (!settings.enabled) return { skipped: "disabled" };
  await advanceRuns();
  const last = (await sql()`
    select max(created_at) as t from backup_runs where kind = 'database' and status in ('running','completed')
  `) as Array<{ t: string | null }>;
  const lastTest = (await sql()`
    select max(completed_at) as t from backup_runs
    where kind = 'database' and restore_test in ('passed','failed')
  `) as Array<{ t: string | null }>;
  const now = Date.now();
  const out: Record<string, unknown> = {};
  if (isBackupDue(settings, last[0]?.t ? new Date(last[0].t).getTime() : null, now)) {
    out.database = await startDatabaseBackup("schedule");
    out.metadata = await recordMetadataBackup("schedule").catch(() => null);
    out.source = await recordSourceBackup("schedule").catch(() => null);
  } else if (
    isVerifyDue(settings, lastTest[0]?.t ? new Date(lastTest[0].t).getTime() : null, now)
  ) {
    out.restoreTest = await startRestoreTest(null, "schedule");
  }
  // Give the first steps a moment (a few short polls), the rest continues on the next poll.
  for (let i = 0; i < 4; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    await advanceRuns();
  }
  return out;
}

export const REQUIRED_TABLE_NAMES = REQUIRED_TABLES;
