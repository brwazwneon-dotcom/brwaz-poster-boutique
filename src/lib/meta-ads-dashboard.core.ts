// Decides what the Executive Dashboard's marketing tiles may show. Pure: the
// state names exactly why a number is absent, and a number is only ever one
// that the Meta Ads report computed — never a placeholder, never a guess.
import type { MetaAdsReport, MetaAdsStatusView, MetaDashboardTiles } from "@/lib/meta-ads.types";

export const STALE_AFTER_MS = 12 * 3_600_000;

export function buildDashboardTiles(input: {
  status: MetaAdsStatusView;
  /** A successful sync covered the whole period asked for. */
  covered: boolean;
  report: MetaAdsReport | null;
  now?: Date;
}): MetaDashboardTiles {
  const { status, report } = input;
  const now = (input.now ?? new Date()).getTime();
  const base: MetaDashboardTiles = {
    state: "not_configured",
    stale: false,
    lastSuccessAt: status.lastSuccess?.finishedAt ?? null,
    dataThrough: report?.dataThrough ?? null,
    missing: status.configured ? [] : [...status.missing, ...status.invalid],
    currencyMismatch: false,
    spend: null,
    orders: null,
    revenueNet: null,
    cpa: null,
    roas: null,
    unmatchedOrders: 0,
  };
  if (!status.migrationApplied) return { ...base, state: "migration_missing" };
  if (!status.lastSuccess)
    return { ...base, state: status.configured ? "never_synced" : "not_configured" };
  if (!input.covered || !report) return { ...base, state: "not_covered" };

  const last = status.lastAttempt;
  const failedSince =
    !!last &&
    last.status === "failed" &&
    new Date(last.startedAt).getTime() > new Date(status.lastSuccess.finishedAt).getTime();
  const stale =
    now - new Date(status.lastSuccess.finishedAt).getTime() > STALE_AFTER_MS || failedSince;
  const t = report.totals;
  return {
    ...base,
    state: "ok",
    stale,
    currencyMismatch: report.currencyMismatch,
    spend: t.platform.spend,
    orders: t.matched.orders,
    revenueNet: t.matched.revenueNet,
    cpa: t.cpa,
    roas: t.roas,
    unmatchedOrders: t.unmatchedMeta.ordersAll,
  };
}
