import { describe, expect, it, vi } from "vitest";

// The real sync function is mocked here: these tests are about the cron wrapper (auth, window,
// status mapping, no leaks). The sync itself is covered by meta-ads-sync.server.test.ts.
vi.mock("@/lib/meta-ads-sync.server", () => ({ syncMetaAds: vi.fn() }));

import { META_CRON_DAYS, metaCronRange, runMetaCronSync } from "./cron-meta-sync.server";
import type { SyncResult } from "./meta-ads-sync.server";

const SECRET = "cron-secret-for-tests-1234567890";
const TOKEN = "EAAB-super-secret-meta-token-value";
const env = { CRON_SECRET: SECRET };
const authed = () =>
  new Request("https://x.test/api/cron-meta-sync", {
    headers: { authorization: `Bearer ${SECRET}` },
  });
const NOW = new Date("2026-10-07T04:30:12Z");

const result = (o: Partial<SyncResult> = {}): SyncResult => ({
  ok: true,
  status: "success",
  runId: "run-1",
  dateFrom: "2026-10-01",
  dateTo: "2026-10-07",
  campaigns: 47,
  adsets: 59,
  ads: 81,
  insightRows: 40,
  message: null,
  errorKind: null,
  ...o,
});

describe("window", () => {
  it("is the last 7 calendar days including today", () => {
    expect(META_CRON_DAYS).toBe(7);
    expect(metaCronRange(NOW)).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });
  it("crosses month and year boundaries and leap days correctly", () => {
    expect(metaCronRange(new Date("2026-10-03T04:30:00Z"))).toEqual({
      from: "2026-09-27",
      to: "2026-10-03",
    });
    expect(metaCronRange(new Date("2027-01-02T04:30:00Z"))).toEqual({
      from: "2026-12-27",
      to: "2027-01-02",
    });
    expect(metaCronRange(new Date("2028-03-02T04:30:00Z"))).toEqual({
      from: "2028-02-25",
      to: "2028-03-02",
    });
  });
  it("is always inside the sync function's own limits (valid and <= 93 days)", () => {
    const r = metaCronRange(NOW);
    expect(r.from <= r.to).toBe(true);
    expect((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 + 1).toBeLessThanOrEqual(93);
  });
});

describe("authentication", () => {
  it("without CRON_SECRET: 503 and Meta is never called", async () => {
    const sync = vi.fn();
    const res = await runMetaCronSync(authed(), { env: {}, sync });
    expect(res.status).toBe(503);
    expect(sync).not.toHaveBeenCalled();
  });
  it("missing or wrong secret: 401 and Meta is never called", async () => {
    const sync = vi.fn();
    const none = await runMetaCronSync(new Request("https://x.test/"), { env, sync });
    const wrong = await runMetaCronSync(
      new Request("https://x.test/", { headers: { authorization: "Bearer wrong" } }),
      { env, sync },
    );
    expect(none.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });
});

describe("running the sync", () => {
  it("calls the existing sync once, trigger 'cron', with the 7-day window; 200 with counts only", async () => {
    const sync = vi.fn().mockResolvedValue(result());
    const res = await runMetaCronSync(authed(), { env, sync, now: () => NOW });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-07", trigger: "cron" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "success", campaigns: 47, insightRows: 40 });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("a partial run (time/page limit) is still a 2xx so the cron is not marked failed", async () => {
    const sync = vi.fn().mockResolvedValue(
      result({
        ok: false,
        status: "partial",
        message: "Stopped early (time or page limit); run the sync again to continue",
      }),
    );
    const res = await runMetaCronSync(authed(), { env, sync, now: () => NOW });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("partial");
  });

  it("another sync already running (meta_sync_runs lock): skipped with 200, not an error", async () => {
    const sync = vi.fn().mockResolvedValue(
      result({
        ok: false,
        status: "failed",
        errorKind: "busy",
        message: "Another sync is already running",
        campaigns: 0,
        adsets: 0,
        ads: 0,
        insightRows: 0,
      }),
    );
    const res = await runMetaCronSync(authed(), { env, sync, now: () => NOW });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: "busy" });
  });

  it("Meta auth/permission/server failures return 502 so Vercel shows the cron as failed", async () => {
    for (const errorKind of ["auth", "permission", "rate_limit", "server", "network", "internal"]) {
      const sync = vi.fn().mockResolvedValue(
        result({
          ok: false,
          status: "failed",
          errorKind,
          message: "Meta says no",
          campaigns: 0,
          adsets: 0,
          ads: 0,
          insightRows: 0,
        }),
      );
      const res = await runMetaCronSync(authed(), { env, sync, now: () => NOW });
      expect(res.status, errorKind).toBe(502);
      expect((await res.json()).ok).toBe(false);
    }
  });

  it("not configured / migration missing return 503 (visible, not retried blindly)", async () => {
    for (const errorKind of ["not_configured", "migration_missing"]) {
      const sync = vi
        .fn()
        .mockResolvedValue(result({ ok: false, status: "failed", errorKind, message: "x" }));
      const res = await runMetaCronSync(authed(), { env, sync, now: () => NOW });
      expect(res.status, errorKind).toBe(503);
    }
  });

  it("an unexpected throw becomes a generic 500 with no detail and no secret", async () => {
    const sync = vi.fn().mockRejectedValue(new Error(`boom ${TOKEN} ${SECRET}`));
    const res = await runMetaCronSync(authed(), { env, sync, now: () => NOW });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toEqual({ ok: false, error: "failed" });
  });
});
