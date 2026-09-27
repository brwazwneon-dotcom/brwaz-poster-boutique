import { describe, expect, it } from "vitest";
import { buildDashboardTiles, STALE_AFTER_MS } from "./meta-ads-dashboard.core";
import type { MetaAdsReport, MetaAdsStatusView, SiteMetrics } from "./meta-ads.types";

const NOW = new Date("2026-09-27T12:00:00Z");
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const status = (o: Partial<MetaAdsStatusView> = {}): MetaAdsStatusView => ({
  configured: true,
  missing: [],
  invalid: [],
  migrationApplied: true,
  apiVersion: "v25.0",
  lastAttempt: null,
  lastSuccess: { finishedAt: iso(-3_600_000), dateFrom: "2026-08-28", dateTo: "2026-09-27" },
  ...o,
});

const site = (o: Partial<SiteMetrics> = {}): SiteMetrics => ({
  sessions: 0,
  visitors: 0,
  addToCart: 0,
  checkout: 0,
  orders: 0,
  ordersAll: 0,
  cancelled: 0,
  revenueGross: 0,
  revenueNet: 0,
  revenueConfirmed: 0,
  revenueDelivered: 0,
  ...o,
});

const report = (
  over: Partial<MetaAdsReport["totals"]> = {},
  currencyMismatch = false,
): MetaAdsReport =>
  ({
    period: {} as never,
    model: "last",
    currency: "EGP",
    currencyMismatch,
    totals: {
      platform: { spend: 607.29 } as never,
      matched: site({ orders: 5, ordersAll: 5, revenueNet: 7084 }),
      unmatchedMeta: site({ ordersAll: 1 }),
      storeOrders: 9,
      storeRevenueNet: 12000,
      cpa: 121.458,
      roas: 11.66,
      ...over,
    },
    campaigns: [],
    matching: { byId: 0, byName: 0 },
    dataThrough: "2026-09-27",
    notes: [],
  }) as MetaAdsReport;

const build = (o: Parameters<typeof buildDashboardTiles>[0]) =>
  buildDashboardTiles({ now: NOW, ...o });

describe("dashboard marketing tiles — why a number is absent", () => {
  it("not configured, never synced: names the missing variables (never values)", () => {
    const t = build({
      status: status({
        configured: false,
        missing: ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
        lastSuccess: null,
      }),
      covered: false,
      report: null,
    });
    expect(t.state).toBe("not_configured");
    expect(t.missing).toEqual(["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"]);
    expect([t.spend, t.orders, t.cpa, t.roas]).toEqual([null, null, null, null]);
  });

  it("migration missing beats everything else", () => {
    expect(
      build({
        status: status({ migrationApplied: false, lastSuccess: null }),
        covered: false,
        report: null,
      }).state,
    ).toBe("migration_missing");
  });

  it("configured but never synced", () => {
    expect(
      build({ status: status({ lastSuccess: null }), covered: false, report: null }).state,
    ).toBe("never_synced");
  });

  it("synced, but not for this period: no numbers, no fake zeros", () => {
    const t = build({ status: status(), covered: false, report: null });
    expect(t.state).toBe("not_covered");
    expect(t.spend).toBeNull();
    expect(t.lastSuccessAt).not.toBeNull();
  });

  it("previously synced data stays visible even if the credentials were later removed", () => {
    const t = build({
      status: status({ configured: false, missing: ["META_MARKETING_ACCESS_TOKEN"] }),
      covered: true,
      report: report(),
    });
    expect(t.state).toBe("ok");
    expect(t.spend).toBe(607.29);
  });
});

describe("dashboard marketing tiles — real numbers", () => {
  it("passes through exactly what the report computed", () => {
    const t = build({ status: status(), covered: true, report: report() });
    expect(t).toMatchObject({
      state: "ok",
      stale: false,
      spend: 607.29,
      orders: 5,
      revenueNet: 7084,
      cpa: 121.458,
      roas: 11.66,
      unmatchedOrders: 1,
      dataThrough: "2026-09-27",
    });
  });

  it("keeps null ratios null (zero spend / zero orders) — never Infinity or 0", () => {
    const t = build({ status: status(), covered: true, report: report({ cpa: null, roas: null }) });
    expect(t.cpa).toBeNull();
    expect(t.roas).toBeNull();
  });

  it("older than 12 hours is flagged stale, not hidden", () => {
    const old = status({
      lastSuccess: { finishedAt: iso(-(STALE_AFTER_MS + 60_000)), dateFrom: null, dateTo: null },
    });
    expect(build({ status: old, covered: true, report: report() })).toMatchObject({
      state: "ok",
      stale: true,
      spend: 607.29,
    });
  });

  it("a failed sync attempt after the last success makes the data stale", () => {
    const s = status({
      lastAttempt: {
        status: "failed",
        startedAt: iso(-60_000),
        finishedAt: iso(-50_000),
        dateFrom: null,
        dateTo: null,
        rows: 0,
        message: null,
        errorKind: "rate_limit",
      },
    });
    expect(build({ status: s, covered: true, report: report() }).stale).toBe(true);
  });

  it("a failed attempt OLDER than the last success does not", () => {
    const s = status({
      lastAttempt: {
        status: "failed",
        startedAt: iso(-7_200_000),
        finishedAt: iso(-7_100_000),
        dateFrom: null,
        dateTo: null,
        rows: 0,
        message: null,
        errorKind: "auth",
      },
    });
    expect(build({ status: s, covered: true, report: report() }).stale).toBe(false);
  });

  it("carries the currency warning so the tile can explain a withheld ratio", () => {
    const t = build({
      status: status(),
      covered: true,
      report: report({ cpa: null, roas: null }, true),
    });
    expect(t.currencyMismatch).toBe(true);
  });
});
