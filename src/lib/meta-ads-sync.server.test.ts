import { describe, expect, it, vi } from "vitest";
import {
  REQUIRED_TABLES,
  getSyncStatus,
  resolveSyncRange,
  syncMetaAds,
  type SyncDeps,
} from "./meta-ads-sync.server";

vi.mock("@/lib/neon.server", () => ({
  sql: () => {
    throw new Error("the sync tests must inject their own db");
  },
}));

const TOKEN = "EAAB-sync-token-1234567890abcdefghijk";
const ENV = { META_MARKETING_ACCESS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: "act_276172695816769" };
const NOW = new Date("2026-09-26T12:00:00Z");
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

type Call = { text: string; params: unknown[] };

/** A scripted database: records every statement and answers the few reads the sync makes. */
function fakeDb(opts: { tables?: number; running?: boolean; failOn?: RegExp } = {}) {
  const calls: Call[] = [];
  const db = vi.fn(async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (opts.failOn?.test(text)) throw new Error(`db failure with ${TOKEN}`);
    if (/information_schema\.tables/.test(text))
      return [{ n: opts.tables ?? REQUIRED_TABLES.length }];
    if (/from meta_sync_runs\s+where status = 'running'/.test(text))
      return opts.running ? [{ "?column?": 1 }] : [];
    if (/insert into meta_sync_runs/.test(text)) return [{ id: "run-1" }];
    return [];
  });
  return { db, calls };
}

/** Meta answers by URL. */
function fakeMeta(
  over: Partial<Record<"campaigns" | "adsets" | "ads" | "insights", () => Response>> = {},
) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    const pick = (k: keyof typeof over, fallback: unknown) =>
      over[k] ? over[k]!() : json(fallback);
    if (u.includes("/insights"))
      return pick("insights", {
        data: [
          {
            date_start: "2026-09-20",
            ad_id: "A1",
            adset_id: "S1",
            campaign_id: "C1",
            campaign_name: "Camp",
            adset_name: "Set",
            ad_name: "Ad",
            spend: "12.5",
            impressions: "1000",
            clicks: "10",
            account_currency: "EGP",
          },
        ],
      });
    if (u.includes("/adsets"))
      return pick("adsets", { data: [{ id: "S1", campaign_id: "C1", name: "Set" }] });
    if (u.includes("/ads"))
      return pick("ads", { data: [{ id: "A1", adset_id: "S1", campaign_id: "C1", name: "Ad" }] });
    return pick("campaigns", { data: [{ id: "C1", name: "Camp", status: "ACTIVE" }] });
  });
}

const deps = (db: ReturnType<typeof fakeDb>["db"], fetchImpl: unknown): SyncDeps => ({
  db,
  env: ENV,
  now: () => NOW,
  graph: { fetchImpl: fetchImpl as typeof fetch, sleep: async () => {}, retries: 0 },
});

describe("date range", () => {
  it("defaults to the last 30 days ending today", () => {
    expect(resolveSyncRange({}, NOW)).toEqual({ from: "2026-08-28", to: "2026-09-26" });
  });
  it("accepts a valid range and refuses reversed, malformed or oversized ones", () => {
    expect(resolveSyncRange({ from: "2026-09-01", to: "2026-09-10" }, NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
    });
    expect(() => resolveSyncRange({ from: "2026-09-10", to: "2026-09-01" }, NOW)).toThrow();
    expect(() => resolveSyncRange({ from: "2026-01-01", to: "2026-09-26" }, NOW)).toThrow(
      /limited/,
    );
  });
});

describe("syncMetaAds — guards", () => {
  it("does nothing and names the missing variables when not configured", async () => {
    const { db, calls } = fakeDb();
    const fetchImpl = fakeMeta();
    const r = await syncMetaAds({}, { ...deps(db, fetchImpl), env: {} });
    expect(r).toMatchObject({ ok: false, status: "failed", errorKind: "not_configured" });
    expect(r.message).toMatch(/META_MARKETING_ACCESS_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("reports a missing migration instead of failing", async () => {
    const { db } = fakeDb({ tables: 2 });
    const fetchImpl = fakeMeta();
    const r = await syncMetaAds({}, deps(db, fetchImpl));
    expect(r.errorKind).toBe("migration_missing");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to start while another sync is running", async () => {
    const { db } = fakeDb({ running: true });
    const fetchImpl = fakeMeta();
    const r = await syncMetaAds({}, deps(db, fetchImpl));
    expect(r.errorKind).toBe("busy");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("an invalid range fails cleanly without touching Meta or the database", async () => {
    const { db, calls } = fakeDb();
    const r = await syncMetaAds({ from: "2026-09-10", to: "2026-09-01" }, deps(db, fakeMeta()));
    expect(r).toMatchObject({ ok: false, errorKind: "bad_request" });
    expect(calls).toHaveLength(0);
  });
});

describe("syncMetaAds — a good run", () => {
  it("writes campaigns, ad sets, ads and insights, and records a successful run", async () => {
    const { db, calls } = fakeDb();
    const r = await syncMetaAds({ trigger: "manual" }, deps(db, fakeMeta()));
    expect(r).toMatchObject({
      ok: true,
      status: "success",
      campaigns: 1,
      adsets: 1,
      ads: 1,
      insightRows: 1,
      runId: "run-1",
      message: null,
    });
    const text = calls.map((c) => c.text).join("\n");
    for (const t of ["meta_campaigns", "meta_adsets", "meta_ads", "meta_ad_insights_daily"])
      expect(text).toContain(`insert into ${t}`);
    const final = calls.at(-1)!;
    expect(final.text).toMatch(/update meta_sync_runs/);
    expect(final.params.slice(0, 3)).toEqual(["run-1", "success", 1]);
  });

  it("every write is an upsert keyed on Meta's ids (safe to repeat)", async () => {
    const { db, calls } = fakeDb();
    await syncMetaAds({}, deps(db, fakeMeta()));
    const writes = calls.filter((c) =>
      /^\s*insert into meta_(campaigns|adsets|ads|ad_insights)/.test(c.text),
    );
    expect(writes.length).toBeGreaterThanOrEqual(4);
    for (const w of writes)
      expect(w.text).toMatch(/on conflict \((meta_\w+_id|date, meta_ad_id)\) do update/);
  });

  it("running twice sends identical statements and payloads", async () => {
    const a = fakeDb();
    const b = fakeDb();
    await syncMetaAds({}, deps(a.db, fakeMeta()));
    await syncMetaAds({}, deps(b.db, fakeMeta()));
    const strip = (calls: Call[]) =>
      calls.filter((c) => !/meta_sync_runs/.test(c.text)).map((c) => [c.text, c.params]);
    expect(strip(a.calls)).toEqual(strip(b.calls));
  });

  it("the ad account id and range come from configuration and input, not from Meta rows", async () => {
    const { db, calls } = fakeDb();
    const fetchImpl = fakeMeta();
    await syncMetaAds({ from: "2026-09-01", to: "2026-09-05" }, deps(db, fetchImpl));
    const insightsUrl = new URL(
      String(fetchImpl.mock.calls.find((c) => String(c[0]).includes("/insights"))![0]),
    );
    expect(insightsUrl.pathname).toContain("act_276172695816769");
    expect(JSON.parse(insightsUrl.searchParams.get("time_range")!)).toEqual({
      since: "2026-09-01",
      until: "2026-09-05",
    });
    const write = calls.find((c) => /insert into meta_campaigns/.test(c.text))!;
    expect(write.params[1]).toBe("276172695816769");
  });

  it("backfills a name from insights without overwriting a known one", async () => {
    const { db, calls } = fakeDb();
    await syncMetaAds({}, deps(db, fakeMeta()));
    const fill = calls.find((c) =>
      /insert into meta_campaigns \(meta_campaign_id, account_id, name\)/.test(c.text),
    )!;
    expect(fill.text).toMatch(/coalesce\(meta_campaigns\.name, excluded\.name\)/);
  });
});

describe("syncMetaAds — Meta failures never escape", () => {
  it("auth failure: fails, stores a scrubbed reason, writes nothing else", async () => {
    const { db, calls } = fakeDb();
    const fetchImpl = fakeMeta({
      campaigns: () =>
        json({ error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } }, 401),
    });
    const r = await syncMetaAds({}, deps(db, fetchImpl));
    expect(r).toMatchObject({ ok: false, status: "failed", errorKind: "auth" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
    expect(calls.some((c) => /insert into meta_ad_insights_daily/.test(c.text))).toBe(false);
    expect(calls.at(-1)!.text).toMatch(/update meta_sync_runs/);
  });

  it.each([
    [403, { error: { message: "no", code: 200 } }, "permission"],
    [429, { error: { message: "slow", code: 4 } }, "rate_limit"],
    [500, { error: { message: "down" } }, "server"],
    [400, { error: { message: "bad", code: 100 } }, "bad_request"],
  ])("HTTP %i is recorded as %s", async (status, body, kind) => {
    const { db } = fakeDb();
    const r = await syncMetaAds(
      {},
      deps(db, fakeMeta({ campaigns: () => json(body, status as number) })),
    );
    expect(r.ok).toBe(false);
    expect(r.errorKind).toBe(kind);
  });

  it("insights failing after entities were saved is a partial run, entities kept", async () => {
    const { db } = fakeDb();
    const r = await syncMetaAds(
      {},
      deps(db, fakeMeta({ insights: () => json({ error: { message: "x", code: 4 } }, 429) })),
    );
    expect(r).toMatchObject({
      status: "partial",
      campaigns: 1,
      adsets: 1,
      ads: 1,
      insightRows: 0,
      errorKind: "rate_limit",
    });
  });

  it("malformed insight rows are skipped and counted, the rest are saved", async () => {
    const { db } = fakeDb();
    const r = await syncMetaAds(
      {},
      deps(
        db,
        fakeMeta({
          insights: () =>
            json({
              data: [
                { date_start: "2026-09-20", ad_id: "A1", spend: "1" },
                { spend: "9" },
                { date_start: "bad", ad_id: "A2" },
              ],
            }),
        }),
      ),
    );
    expect(r.status).toBe("partial");
    expect(r.insightRows).toBe(1);
    expect(r.message).toMatch(/2 insight row/);
  });

  it("an empty account is a successful, empty sync", async () => {
    const { db } = fakeDb();
    const empty = () => json({ data: [] });
    const r = await syncMetaAds(
      {},
      deps(db, fakeMeta({ campaigns: empty, adsets: empty, ads: empty, insights: empty })),
    );
    expect(r).toMatchObject({ ok: true, status: "success", campaigns: 0, insightRows: 0 });
  });

  it("a database failure is caught, scrubbed and recorded — never thrown", async () => {
    const { db } = fakeDb({ failOn: /insert into meta_adsets/ });
    const r = await syncMetaAds({}, deps(db, fakeMeta()));
    expect(r).toMatchObject({ ok: false, status: "failed", errorKind: "internal" });
    expect(r.message).not.toContain(TOKEN);
  });
});

describe("getSyncStatus", () => {
  it("names missing configuration without values and skips the run tables when unmigrated", async () => {
    const { db } = fakeDb({ tables: 0 });
    const s = await getSyncStatus({ db, env: {} });
    expect(s).toMatchObject({
      configured: false,
      migrationApplied: false,
      lastAttempt: null,
      lastSuccess: null,
    });
    expect(s.missing).toEqual(["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"]);
  });

  it("reports the last attempt and the last success", async () => {
    const db = vi.fn(async (text: string) => {
      if (/information_schema/.test(text)) return [{ n: REQUIRED_TABLES.length }];
      if (/order by started_at desc/.test(text))
        return [
          {
            status: "failed",
            started_at: "2026-09-26T10:00:00Z",
            finished_at: "2026-09-26T10:00:05Z",
            date_from: "2026-08-28",
            date_to: "2026-09-26",
            rows: 0,
            error_message: "Invalid token",
            error_kind: "auth",
          },
        ];
      return [
        { finished_at: "2026-09-25T09:00:00Z", date_from: "2026-08-27", date_to: "2026-09-25" },
      ];
    });
    const s = await getSyncStatus({ db, env: ENV });
    expect(s.configured).toBe(true);
    expect(s.lastAttempt).toMatchObject({
      status: "failed",
      errorKind: "auth",
      message: "Invalid token",
    });
    expect(s.lastSuccess).toMatchObject({ dateFrom: "2026-08-27", dateTo: "2026-09-25" });
    expect(JSON.stringify(s)).not.toContain(TOKEN);
  });

  it("never throws if the database errors", async () => {
    const db = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(getSyncStatus({ db, env: ENV })).resolves.toMatchObject({
      configured: true,
      migrationApplied: false,
    });
  });
});
