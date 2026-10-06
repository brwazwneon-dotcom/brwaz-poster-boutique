import { describe, expect, it, vi } from "vitest";
import {
  BACKUP_BRANCH_PREFIX,
  NeonApiError,
  allOk,
  backupBranchName,
  buildRecoveryMetadata,
  createNeonClient,
  displayState,
  evaluateRestore,
  findBackupTagForCommit,
  findSourceBranchId,
  isBackupDue,
  isVerifyDue,
  leaksSecret,
  normalizeSettings,
  readNeonConfig,
  selectPrunable,
  urlForHost,
  verifyBackupBranch,
  type TableCounts,
} from "./backup-center.core";

const EXPECTED_ENV_NAMES = ["NEON_DATABASE_URL", "ADMIN_SESSION_SECRET", "GITHUB_TOKEN"] as const;

const URL_PROD =
  "postgresql://role:pw@ep-cool-123-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require";

const counts = (o: Partial<TableCounts> = {}): TableCounts => ({
  posters: 1826,
  categories: 20,
  orders: 120,
  site_settings: 60,
  admin_users: 1,
  ...o,
});

describe("Neon API client", () => {
  it("creates a pure snapshot branch (no compute) and sends the bearer key", async () => {
    const f = vi.fn(async () =>
      Response.json(
        { branch: { id: "br-1", name: "n", current_state: "init" }, endpoints: [] },
        { status: 201 },
      ),
    );
    const c = createNeonClient({ apiKey: "KEY", projectId: "proj-1", fetchImpl: f as never });
    const out = await c.createBranch({
      name: "brw-backup-x",
      parentId: "br-main",
      readOnlyEndpoint: false,
    });
    expect(out.branch.id).toBe("br-1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://console.neon.tech/api/v2/projects/proj-1/branches");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer KEY");
    expect(JSON.parse(String(init.body))).toEqual({
      branch: { name: "brw-backup-x", parent_id: "br-main" },
    });
  });

  it("asks for a READ-ONLY compute for restore tests", async () => {
    const f = vi.fn(async () =>
      Response.json(
        {
          branch: { id: "br-2", name: "t" },
          endpoints: [{ id: "ep-1", host: "ep-1.x.neon.tech", branch_id: "br-2" }],
        },
        { status: 201 },
      ),
    );
    const c = createNeonClient({ apiKey: "K", projectId: "p", fetchImpl: f as never });
    const out = await c.createBranch({ name: "t", parentId: "br-1", readOnlyEndpoint: true });
    expect(
      JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).endpoints,
    ).toEqual([{ type: "read_only" }]);
    expect(out.endpoints[0].host).toBe("ep-1.x.neon.tech");
  });

  it("errors never echo the response body (which can hold internal ids)", async () => {
    const f = vi.fn(
      async () => new Response("SECRET-INTERNAL-DETAIL host=ep-secret", { status: 403 }),
    );
    const c = createNeonClient({ apiKey: "K", projectId: "p", fetchImpl: f as never });
    const err = await c.getBranch("br-1").catch((e) => e);
    expect(err).toBeInstanceOf(NeonApiError);
    expect(String(err.message)).toContain("403");
    expect(String(err.message)).not.toContain("SECRET-INTERNAL-DETAIL");
  });

  it("is configured only when both NEON_API_KEY and NEON_PROJECT_ID exist", () => {
    expect(readNeonConfig({})).toBeNull();
    expect(readNeonConfig({ NEON_API_KEY: "k" })).toBeNull();
    expect(readNeonConfig({ NEON_API_KEY: "k", NEON_PROJECT_ID: "p" })).toEqual({
      apiKey: "k",
      projectId: "p",
    });
  });

  it("finds the production branch from the endpoint host and builds the child URL", () => {
    const endpoints = [
      { id: "e1", host: "ep-other-1.c-4.us-east-2.aws.neon.tech", branch_id: "br-other" },
      { id: "e2", host: "ep-cool-123.c-4.us-east-2.aws.neon.tech", branch_id: "br-prod" },
    ];
    expect(findSourceBranchId(URL_PROD, endpoints)).toBe("br-prod");
    expect(findSourceBranchId("not a url", endpoints)).toBeNull();
    const child = urlForHost(URL_PROD, "ep-child-9.c-4.us-east-2.aws.neon.tech");
    expect(new URL(child).hostname).toBe("ep-child-9.c-4.us-east-2.aws.neon.tech");
    expect(new URL(child).username).toBe("role");
  });

  it("names backup branches with the fixed prefix", () => {
    expect(backupBranchName(new Date("2026-10-06T03:04:05Z"))).toBe(
      `${BACKUP_BRANCH_PREFIX}20261006-030405`,
    );
  });
});

describe("verification", () => {
  const expected = { id: "br-1", name: "brw-backup-1", sourceBranchId: "br-prod" };
  it("a ready branch with the right name and parent verifies", () => {
    const checks = verifyBackupBranch(
      { id: "br-1", name: "brw-backup-1", parent_id: "br-prod", current_state: "ready" },
      expected,
    );
    expect(allOk(checks)).toBe(true);
  });
  it("a missing, unready or wrongly parented branch never verifies", () => {
    expect(allOk(verifyBackupBranch(null, expected))).toBe(false);
    expect(
      allOk(
        verifyBackupBranch(
          { id: "br-1", name: "brw-backup-1", parent_id: "br-prod", current_state: "init" },
          expected,
        ),
      ),
    ).toBe(false);
    expect(
      allOk(
        verifyBackupBranch(
          { id: "br-1", name: "brw-backup-1", parent_id: "other", current_state: "ready" },
          expected,
        ),
      ),
    ).toBe(false);
  });

  const base = {
    tablesInRestore: ["posters", "categories", "orders", "site_settings", "admin_users", "extra"],
    restoredCounts: counts(),
    baselineCounts: counts(),
    baselineSchema: { tables: 30, columns: 400 },
    restoredSchema: { tables: 30, columns: 400 },
  };
  it("passes when tables, schema, data and counts agree", () => {
    expect(allOk(evaluateRestore(base))).toBe(true);
  });
  it("fails when a required table is missing", () => {
    const c = evaluateRestore({ ...base, tablesInRestore: ["posters", "categories"] });
    expect(allOk(c)).toBe(false);
    expect(c.find((x) => x.id === "tables")?.detail).toContain("orders");
  });
  it("fails when critical tables are empty or counts drift a lot", () => {
    expect(allOk(evaluateRestore({ ...base, restoredCounts: counts({ posters: 0 }) }))).toBe(false);
    expect(allOk(evaluateRestore({ ...base, restoredCounts: counts({ orders: 10 }) }))).toBe(false);
    // small natural growth between baseline and snapshot is fine
    expect(allOk(evaluateRestore({ ...base, restoredCounts: counts({ orders: 122 }) }))).toBe(true);
  });
  it("fails when the schema is smaller than production's", () => {
    expect(allOk(evaluateRestore({ ...base, restoredSchema: { tables: 20, columns: 100 } }))).toBe(
      false,
    );
  });
});

describe("retention", () => {
  const mk = (i: number, extra: Partial<Parameters<typeof selectPrunable>[0][number]> = {}) => ({
    id: `r${i}`,
    createdAt: 1000 - i,
    status: "completed",
    verification: "verified",
    reference: `${BACKUP_BRANCH_PREFIX}${i}`,
    ...extra,
  });
  it("removes only backups beyond the keep count, oldest first", () => {
    const runs = Array.from({ length: 10 }, (_, i) => mk(i));
    expect(selectPrunable(runs, 7).map((r) => r.id)).toEqual(["r9", "r8", "r7"]);
  });
  it("never keeps fewer than 3, whatever is asked", () => {
    const runs = Array.from({ length: 5 }, (_, i) => mk(i));
    expect(selectPrunable(runs, 0).map((r) => r.id)).toEqual(["r4", "r3"]);
  });
  it("only touches completed backups with our branch prefix", () => {
    const runs = [
      ...Array.from({ length: 4 }, (_, i) => mk(i)),
      mk(8, { reference: "main" }),
      mk(9, { status: "failed" }),
    ];
    const ids = selectPrunable(runs, 3).map((r) => r.id);
    expect(ids).toEqual(["r3"]);
  });
  it("protects the newest verified backup even when it is old", () => {
    const runs = [
      mk(0, { verification: "failed" }),
      mk(1, { verification: "failed" }),
      mk(2, { verification: "failed" }),
      mk(3, { verification: "failed" }),
      mk(4, { verification: "verified" }),
    ];
    expect(selectPrunable(runs, 3).map((r) => r.id)).not.toContain("r4");
  });
});

describe("scheduling and settings", () => {
  const s = { ...normalizeSettings({ enabled: true }) };
  const DAY = 24 * 3600 * 1000;
  it("does nothing until enabled", () => {
    expect(isBackupDue(normalizeSettings({}), null, Date.now())).toBe(false);
    expect(isVerifyDue(normalizeSettings({}), null, Date.now())).toBe(false);
  });
  it("daily and weekly cadence", () => {
    const now = 100 * DAY;
    expect(isBackupDue(s, null, now)).toBe(true);
    expect(isBackupDue(s, now - 5 * 3600 * 1000, now)).toBe(false);
    expect(isBackupDue(s, now - DAY, now)).toBe(true);
    const weekly = normalizeSettings({ enabled: true, frequency: "weekly" });
    expect(isBackupDue(weekly, now - 3 * DAY, now)).toBe(false);
    expect(isBackupDue(weekly, now - 7 * DAY, now)).toBe(true);
    expect(isVerifyDue(s, now - 3 * DAY, now)).toBe(false);
    expect(isVerifyDue(s, now - 7 * DAY, now)).toBe(true);
  });
  it("clamps retention between 3 and 30", () => {
    expect(normalizeSettings({ retentionKeep: 1 }).retentionKeep).toBe(3);
    expect(normalizeSettings({ retentionKeep: 999 }).retentionKeep).toBe(30);
    expect(normalizeSettings({ retentionKeep: "x" }).retentionKeep).toBe(7);
    expect(normalizeSettings(null)).toMatchObject({
      enabled: false,
      frequency: "daily",
      weeklyVerify: true,
    });
  });
});

describe("recovery metadata", () => {
  const env = {
    NEON_DATABASE_URL: "postgresql://role:SuperSecretPassword123@ep-cool-123.neon.tech/db",
    ADMIN_SESSION_SECRET: "another-very-secret-value",
    CLOUDINARY_API_SECRET: "cloud-secret-value-123",
    VERCEL_GIT_COMMIT_SHA: "bd78ddc611ac91125ef43895ca3532a7fb3fefcf",
    VERCEL_GIT_COMMIT_REF: "fix/order-item-images",
    VERCEL_DEPLOYMENT_ID: "dpl_123",
  };
  const meta = buildRecoveryMetadata({
    now: new Date("2026-10-06T00:00:00Z"),
    env,
    expectedEnvNames: EXPECTED_ENV_NAMES,
    packageJson: { name: "x", dependencies: { react: "^19" } },
    buildId: "brwaz-1",
    schema: { tables: 30, columns: 400 },
    latestDatabaseBackup: "brw-backup-1",
    latestSourceTag: null,
    nodeVersion: "v22",
    platform: "linux",
  });
  it("records names and presence, never values", () => {
    const text = JSON.stringify(meta);
    expect(meta.production.commit).toBe(env.VERCEL_GIT_COMMIT_SHA);
    expect(meta.databaseProvider.endpointHostId).toBe("ep-cool-123");
    expect(meta.environment.expectedNames.map((e) => e.name)).toEqual([...EXPECTED_ENV_NAMES]);
    expect(
      meta.environment.expectedNames.find((e) => e.name === "ADMIN_SESSION_SECRET")?.present,
    ).toBe(true);
    expect(meta.environment.expectedNames.find((e) => e.name === "GITHUB_TOKEN")?.present).toBe(
      false,
    );
    expect(leaksSecret(text, env)).toBe(false);
    expect(text).not.toContain("SuperSecretPassword123");
  });
  it("the leak detector really catches a secret value", () => {
    expect(leaksSecret(`oops ${env.ADMIN_SESSION_SECRET} oops`, env)).toBe(true);
    expect(leaksSecret("only names here: ADMIN_SESSION_SECRET", env)).toBe(false);
  });
});

describe("GitHub tag lookup (read-only)", () => {
  function gh(routes: Record<string, unknown>) {
    return vi.fn(async (url: string) => {
      const key = Object.keys(routes).find((k) => url.endsWith(k));
      return key ? Response.json(routes[key]) : new Response("no", { status: 404 });
    });
  }
  it("finds an annotated backup tag that points at the commit", async () => {
    const f = gh({
      "/commits/abc": { sha: "abc" },
      "/git/matching-refs/tags/backup-": [
        { ref: "refs/tags/backup-old", object: { sha: "old", type: "commit" } },
        { ref: "refs/tags/backup-before-windows", object: { sha: "tagobj", type: "tag" } },
      ],
      "/git/tags/tagobj": { object: { sha: "abc" } },
    });
    const r = await findBackupTagForCommit({
      repo: "o/r",
      commit: "abc",
      token: "t",
      fetchImpl: f as never,
    });
    expect(r).toEqual({ tag: "backup-before-windows", commitExists: true });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: "Bearer t",
    });
  });
  it("reports no tag (not a guess) when none matches, and a missing commit", async () => {
    const none = gh({ "/commits/abc": {}, "/git/matching-refs/tags/backup-": [] });
    expect(
      await findBackupTagForCommit({
        repo: "o/r",
        commit: "abc",
        token: "t",
        fetchImpl: none as never,
      }),
    ).toEqual({ tag: null, commitExists: true });
    const missing = gh({});
    expect(
      await findBackupTagForCommit({
        repo: "o/r",
        commit: "abc",
        token: "t",
        fetchImpl: missing as never,
      }),
    ).toEqual({ tag: null, commitExists: false });
  });
});

describe("display state never over-claims", () => {
  it("only says verified/passed when the fields say so", () => {
    expect(
      displayState({
        status: "completed",
        verification: "not_verified",
        restore_test: "not_tested",
      }),
    ).toBe("completed");
    expect(
      displayState({ status: "completed", verification: "verified", restore_test: "not_tested" }),
    ).toBe("verified");
    expect(
      displayState({ status: "completed", verification: "verified", restore_test: "passed" }),
    ).toBe("restore_passed");
    expect(
      displayState({ status: "completed", verification: "verified", restore_test: "failed" }),
    ).toBe("restore_failed");
    expect(
      displayState({ status: "completed", verification: "failed", restore_test: "not_tested" }),
    ).toBe("verification_failed");
    expect(
      displayState({ status: "running", verification: "not_verified", restore_test: "not_tested" }),
    ).toBe("running");
    expect(
      displayState({ status: "completed", verification: "verified", restore_test: "running" }),
    ).toBe("running");
    expect(
      displayState({ status: "expired", verification: "verified", restore_test: "passed" }),
    ).toBe("expired");
  });
});
