// Backup Center — pure logic + the Neon API client (all I/O injected, unit-tested).
//
// Why Neon branches: the production database is Neon Postgres, which has a
// native, instant, copy-on-write snapshot (a "branch"). A backup is a branch;
// a restore TEST is a temporary child branch of that backup with a read-only
// compute, queried and then deleted. Nothing is ever restored over production,
// no customer data leaves the database provider, and nothing large is stored in
// our own tables (only metadata and counts).

export const BACKUP_BRANCH_PREFIX = "brw-backup-";
export const TEST_BRANCH_PREFIX = "brw-restoretest-";
export const NEON_API_BASE = "https://console.neon.tech/api/v2";

export const RETENTION_MIN_KEEP = 3;
export const RETENTION_MAX_KEEP = 30;
export const RETENTION_DEFAULT_KEEP = 7;
/** Give up on a restore test (and delete its temporary branch) after this long. */
export const TEST_TIMEOUT_MS = 3 * 60 * 1000;
/** Give up waiting for a new backup branch to become ready after this long. */
export const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

/** Tables that must exist (and hold rows) in a restored copy. Fixed whitelist. */
export const REQUIRED_TABLES = [
  "posters",
  "categories",
  "orders",
  "site_settings",
  "admin_users",
] as const;
/** Tables that must be non-empty after a restore. */
export const NON_EMPTY_TABLES = ["posters", "categories", "site_settings", "admin_users"] as const;

export type TableCounts = Record<(typeof REQUIRED_TABLES)[number], number>;

export type SchemaFingerprint = { tables: number; columns: number };

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export type BackupSettings = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  retentionKeep: number;
  weeklyVerify: boolean;
};

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: false,
  frequency: "daily",
  retentionKeep: RETENTION_DEFAULT_KEEP,
  weeklyVerify: true,
};

export function normalizeSettings(raw: unknown): BackupSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keep = Number(r.retentionKeep);
  return {
    enabled: r.enabled === true,
    frequency: r.frequency === "weekly" ? "weekly" : "daily",
    retentionKeep: Number.isFinite(keep)
      ? Math.min(RETENTION_MAX_KEEP, Math.max(RETENTION_MIN_KEEP, Math.round(keep)))
      : RETENTION_DEFAULT_KEEP,
    weeklyVerify: r.weeklyVerify !== false,
  };
}

// ---------------------------------------------------------------------------
// Neon API client
// ---------------------------------------------------------------------------
export type NeonConfig = {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type NeonBranch = {
  id: string;
  name: string;
  parent_id?: string | null;
  primary?: boolean;
  default?: boolean;
  current_state?: string;
  logical_size?: number | null;
  created_at?: string;
};

export type NeonEndpoint = {
  id: string;
  host: string;
  branch_id: string;
  type?: string;
  current_state?: string;
};

export class NeonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function readNeonConfig(env: Record<string, string | undefined>): NeonConfig | null {
  const apiKey = env.NEON_API_KEY?.trim();
  const projectId = env.NEON_PROJECT_ID?.trim();
  return apiKey && projectId ? { apiKey, projectId } : null;
}

export function createNeonClient(cfg: NeonConfig) {
  const base = cfg.baseUrl ?? NEON_API_BASE;
  const f = cfg.fetchImpl ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await f(`${base}/projects/${encodeURIComponent(cfg.projectId)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // Never echo the response body: it can contain internal ids/URLs.
      throw new NeonApiError(
        `Neon API ${method} ${path.split("?")[0]} failed (${res.status})`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  return {
    async listBranches(): Promise<NeonBranch[]> {
      return (await call<{ branches: NeonBranch[] }>("GET", "/branches")).branches ?? [];
    },
    async listEndpoints(): Promise<NeonEndpoint[]> {
      return (await call<{ endpoints: NeonEndpoint[] }>("GET", "/endpoints")).endpoints ?? [];
    },
    async getBranch(id: string): Promise<NeonBranch> {
      return (await call<{ branch: NeonBranch }>("GET", `/branches/${encodeURIComponent(id)}`))
        .branch;
    },
    /** A pure snapshot (no compute) when `readOnlyEndpoint` is false. */
    async createBranch(opts: {
      name: string;
      parentId: string;
      readOnlyEndpoint: boolean;
    }): Promise<{ branch: NeonBranch; endpoints: NeonEndpoint[] }> {
      const out = await call<{ branch: NeonBranch; endpoints?: NeonEndpoint[] }>(
        "POST",
        "/branches",
        {
          branch: { name: opts.name, parent_id: opts.parentId },
          ...(opts.readOnlyEndpoint ? { endpoints: [{ type: "read_only" }] } : {}),
        },
      );
      return { branch: out.branch, endpoints: out.endpoints ?? [] };
    },
    async deleteBranch(id: string): Promise<void> {
      await call("DELETE", `/branches/${encodeURIComponent(id)}`);
    },
  };
}

export type NeonClient = ReturnType<typeof createNeonClient>;

/** The Neon branch our production database URL points at (matched by endpoint host). */
export function findSourceBranchId(databaseUrl: string, endpoints: NeonEndpoint[]): string | null {
  let host = "";
  try {
    host = new URL(databaseUrl).hostname.replace("-pooler", "");
  } catch {
    return null;
  }
  return endpoints.find((e) => e.host.replace("-pooler", "") === host)?.branch_id ?? null;
}

/** The production URL with its host swapped for another endpoint (same role/db/password). */
export function urlForHost(databaseUrl: string, host: string): string {
  const u = new URL(databaseUrl);
  u.hostname = host;
  return u.toString();
}

export function backupBranchName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${BACKUP_BRANCH_PREFIX}${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(
    now.getUTCHours(),
  )}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

// ---------------------------------------------------------------------------
// Verification (artifact-level and restore-test checks)
// ---------------------------------------------------------------------------
export type Check = { id: string; label: string; ok: boolean; detail?: string };

/** Is the backup artifact (the branch) there, ready, and the one we created? */
export function verifyBackupBranch(
  branch: NeonBranch | null,
  expected: { id: string; name: string; sourceBranchId: string },
): Check[] {
  const exists = !!branch && branch.id === expected.id;
  return [
    { id: "exists", label: "Backup exists at the provider", ok: exists },
    {
      id: "ready",
      label: "Backup is readable (branch ready)",
      ok: exists && branch!.current_state === "ready",
      detail: branch?.current_state,
    },
    {
      id: "name",
      label: "Backup name matches",
      ok: exists && branch!.name === expected.name,
    },
    {
      id: "parent",
      label: "Backup was taken from the production branch",
      ok: exists && branch!.parent_id === expected.sourceBranchId,
    },
  ];
}

function tolerance(n: number): number {
  return Math.max(5, Math.ceil(n * 0.05));
}

/**
 * Compare a restored copy with what production looked like when the backup
 * was taken. Only counts are compared and reported — never row contents.
 */
export function evaluateRestore(input: {
  tablesInRestore: string[];
  restoredCounts: Partial<TableCounts>;
  baselineCounts: Partial<TableCounts>;
  baselineSchema: SchemaFingerprint;
  restoredSchema: SchemaFingerprint;
}): Check[] {
  const checks: Check[] = [];
  const have = new Set(input.tablesInRestore);
  const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
  checks.push({
    id: "tables",
    label: "Required tables present",
    ok: missing.length === 0,
    detail: missing.length
      ? `missing: ${missing.join(", ")}`
      : `${REQUIRED_TABLES.length} of ${REQUIRED_TABLES.length}`,
  });
  checks.push({
    id: "schema",
    label: "Schema matches production",
    ok:
      input.restoredSchema.tables >= input.baselineSchema.tables &&
      input.restoredSchema.columns >= input.baselineSchema.columns,
    detail: `${input.restoredSchema.tables} tables / ${input.restoredSchema.columns} columns (production: ${input.baselineSchema.tables} / ${input.baselineSchema.columns})`,
  });
  const empty = NON_EMPTY_TABLES.filter((t) => !((input.restoredCounts[t] ?? 0) > 0));
  checks.push({
    id: "data",
    label: "Critical data present",
    ok: empty.length === 0,
    detail: empty.length
      ? `empty: ${empty.join(", ")}`
      : "posters, categories, settings, admin accounts",
  });
  const drift = REQUIRED_TABLES.filter((t) => {
    const a = input.restoredCounts[t];
    const b = input.baselineCounts[t];
    return typeof a !== "number" || typeof b !== "number" || Math.abs(a - b) > tolerance(b);
  });
  checks.push({
    id: "counts",
    label: "Row counts match production at backup time",
    ok: drift.length === 0,
    detail: drift.length ? `differs: ${drift.join(", ")}` : "within tolerance",
  });
  return checks;
}

export const allOk = (checks: Check[]): boolean => checks.length > 0 && checks.every((c) => c.ok);

// ---------------------------------------------------------------------------
// Retention: which old DB backups may be removed?
// ---------------------------------------------------------------------------
export type RetentionCandidate = {
  id: string;
  createdAt: number;
  status: string;
  verification: string;
  reference: string | null;
};

/**
 * Only backups beyond `keep` (never fewer than RETENTION_MIN_KEEP), oldest
 * first. Only completed backups whose name carries our prefix are eligible, and
 * the newest verified backup is always protected.
 */
export function selectPrunable(
  runs: RetentionCandidate[],
  keepInput: number,
): RetentionCandidate[] {
  const keep = Math.max(RETENTION_MIN_KEEP, Math.min(RETENTION_MAX_KEEP, Math.round(keepInput)));
  const live = runs
    .filter((r) => r.status === "completed" && r.reference?.startsWith(BACKUP_BRANCH_PREFIX))
    .sort((a, b) => b.createdAt - a.createdAt);
  const protectedId = live.find((r) => r.verification === "verified")?.id;
  return live
    .slice(keep)
    .filter((r) => r.id !== protectedId)
    .reverse();
}

// ---------------------------------------------------------------------------
// Scheduling decision (used by the daily cron)
// ---------------------------------------------------------------------------
export function isBackupDue(
  settings: BackupSettings,
  lastBackupAt: number | null,
  now: number,
): boolean {
  if (!settings.enabled) return false;
  if (lastBackupAt === null) return true;
  const gap = settings.frequency === "weekly" ? 7 : 1;
  // 2h slack so a cron that fires a little early still runs.
  return now - lastBackupAt >= gap * 24 * 3600 * 1000 - 2 * 3600 * 1000;
}

export function isVerifyDue(
  settings: BackupSettings,
  lastTestAt: number | null,
  now: number,
): boolean {
  if (!settings.enabled || !settings.weeklyVerify) return false;
  if (lastTestAt === null) return true;
  return now - lastTestAt >= 7 * 24 * 3600 * 1000 - 2 * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Recovery metadata (Type C): safe facts only, plus a checksum.
// ---------------------------------------------------------------------------
export type RecoveryMetadata = {
  createdAt: string;
  production: {
    commit: string | null;
    branch: string | null;
    deploymentId: string | null;
    buildId: string | null;
  };
  runtime: { node: string; platform: string };
  packageJson: {
    name?: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  } | null;
  lockfile: string;
  databaseProvider: { provider: "neon"; endpointHostId: string | null; projectId: string | null };
  schema: SchemaFingerprint | null;
  environment: { expectedNames: Array<{ name: string; present: boolean }> };
  backupReferences: { latestDatabaseBackup: string | null; latestSourceTag: string | null };
  instructions: string[];
};

export const RECOVERY_INSTRUCTIONS = [
  "Source: clone the GitHub repository and check out the commit listed above (or the backup tag).",
  "Install: npm ci (the lockfile in Git at that commit is the exact dependency set; it is not in this snapshot).",
  "Secrets: set the environment variable NAMES listed above from your password manager / Vercel project settings. Values are never stored here.",
  "Database: restore from the Neon backup branch named in backupReferences (Neon console > Branches), or use point-in-time restore.",
  "Deploy: vercel link, then vercel deploy --prod from a clean checkout of that commit.",
];

export function endpointHostId(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname.split(".")[0].replace("-pooler", "") || null;
  } catch {
    return null;
  }
}

export function buildRecoveryMetadata(input: {
  now: Date;
  env: Record<string, string | undefined>;
  /** Variable NAMES the app needs. Kept server-side (backup-center.server.ts), never values. */
  expectedEnvNames: readonly string[];
  packageJson: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;
  buildId: string | null;
  schema: SchemaFingerprint | null;
  latestDatabaseBackup: string | null;
  latestSourceTag: string | null;
  nodeVersion: string;
  platform: string;
}): RecoveryMetadata {
  const e = input.env;
  return {
    createdAt: input.now.toISOString(),
    production: {
      commit: e.VERCEL_GIT_COMMIT_SHA ?? null,
      branch: e.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentId: e.VERCEL_DEPLOYMENT_ID ?? null,
      buildId: input.buildId,
    },
    runtime: { node: input.nodeVersion, platform: input.platform },
    packageJson: input.packageJson
      ? {
          name: input.packageJson.name,
          dependencies: input.packageJson.dependencies ?? {},
          devDependencies: input.packageJson.devDependencies ?? {},
        }
      : null,
    lockfile:
      "package-lock.json is not shipped to production; it is stored in Git at the commit above.",
    databaseProvider: {
      provider: "neon",
      endpointHostId: endpointHostId(e.NEON_DATABASE_URL),
      projectId: e.NEON_PROJECT_ID ?? null,
    },
    schema: input.schema,
    environment: {
      expectedNames: input.expectedEnvNames.map((name) => ({ name, present: !!e[name] })),
    },
    backupReferences: {
      latestDatabaseBackup: input.latestDatabaseBackup,
      latestSourceTag: input.latestSourceTag,
    },
    instructions: RECOVERY_INSTRUCTIONS,
  };
}

/** True when any env VALUE (12+ chars) appears in the serialized metadata. */
export function leaksSecret(serialized: string, env: Record<string, string | undefined>): boolean {
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 12) continue;
    if (!/(KEY|TOKEN|SECRET|PASSWORD|URL|PRIVATE)/i.test(name)) continue;
    if (serialized.includes(value)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Source backup (Type B): is there a Git tag on the live commit?
// ---------------------------------------------------------------------------
export function suggestedTagName(now: Date, commit: string | null): string {
  const d = now.toISOString().slice(0, 10);
  return `backup-${d}-${(commit ?? "unknown").slice(0, 7)}`;
}

type GitHubRef = { ref: string; object: { sha: string; type: string } };

/**
 * Looks for any `backup-*` tag that points at `commit`. Read-only. Needs a
 * token with read access to the repository (GITHUB_TOKEN); without it the
 * result is "not verified", never a guess.
 */
export async function findBackupTagForCommit(opts: {
  repo: string;
  commit: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ tag: string | null; commitExists: boolean }> {
  const f = opts.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const get = async (path: string) => {
    const res = await f(`https://api.github.com/repos/${opts.repo}${path}`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${path.split("/")[1] ?? ""} failed (${res.status})`);
    return res.json();
  };
  const commitExists = await get(`/commits/${opts.commit}`).then(
    () => true,
    () => false,
  );
  if (!commitExists) return { tag: null, commitExists: false };
  const refs = (await get("/git/matching-refs/tags/backup-")) as GitHubRef[];
  for (const r of refs.slice(-30)) {
    let sha = r.object.sha;
    if (r.object.type === "tag") {
      const t = (await get(`/git/tags/${sha}`)) as { object: { sha: string } };
      sha = t.object.sha;
    }
    if (sha === opts.commit) return { tag: r.ref.replace("refs/tags/", ""), commitExists: true };
  }
  return { tag: null, commitExists: true };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
export type DisplayState =
  | "running"
  | "completed"
  | "verified"
  | "verification_failed"
  | "restore_passed"
  | "restore_failed"
  | "failed"
  | "expired";

export function displayState(run: {
  status: string;
  verification: string;
  restore_test: string;
}): DisplayState {
  if (run.status === "expired") return "expired";
  if (run.status === "failed") return "failed";
  if (run.status === "running" || run.restore_test === "running") return "running";
  if (run.restore_test === "failed") return "restore_failed";
  if (run.restore_test === "passed") return "restore_passed";
  if (run.verification === "failed") return "verification_failed";
  if (run.verification === "verified") return "verified";
  return "completed";
}
