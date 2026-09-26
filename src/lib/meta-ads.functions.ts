import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { resolveAnalyticsRange, type AnalyticsRangeKey } from "@/lib/store-time";
import type { RangeInput, TouchModel } from "@/lib/analytics-center.types";
import type { MetaAdsExportDataset, MetaSyncOutcome } from "@/lib/meta-ads.types";

/**
 * Meta Ads endpoints for the Analytics Center. EVERY one is admin-only (the
 * same middleware as the rest of the admin): a visitor cannot trigger a sync,
 * read campaign data, choose an ad account, or reach Meta through this site.
 * The ad account and token come from server configuration, never from input.
 * Meta being down never throws here — outcomes are returned as data.
 */

const RANGE_KEYS: readonly AnalyticsRangeKey[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "this_month",
  "last_month",
  "custom",
];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type ReportInput = RangeInput & { model: TouchModel };
type ExportInput = ReportInput & { dataset: MetaAdsExportDataset };
type SyncInput = { from?: string; to?: string };

function parseRange(data: unknown): RangeInput {
  const d = (data ?? {}) as Partial<RangeInput>;
  const range = RANGE_KEYS.includes(d.range as AnalyticsRangeKey)
    ? (d.range as AnalyticsRangeKey)
    : "30d";
  return {
    range,
    from: typeof d.from === "string" && ISO_DAY.test(d.from) ? d.from : undefined,
    to: typeof d.to === "string" && ISO_DAY.test(d.to) ? d.to : undefined,
  };
}
const parseReport = (data: unknown): ReportInput => ({
  ...parseRange(data),
  model: (data as { model?: unknown } | undefined)?.model === "first" ? "first" : "last",
});
const rangeOf = (i: RangeInput) => resolveAnalyticsRange(i.range, { from: i.from, to: i.to });
const admin = () => [requireAdminSessionNeon] as const;

export const getMetaAdsStatus = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .handler(async () => {
    const { getSyncStatus } = await import("@/lib/meta-ads-sync.server");
    return getSyncStatus();
  });

export const getMetaAdsReport = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseReport)
  .handler(async ({ data }) => {
    const { getMetaAdsReport: build } = await import("@/lib/meta-ads-report.server");
    return build(rangeOf(data), data.model);
  });

/** POST: it calls Meta and writes to the database. Dates are the only input. */
export const syncMetaAdsNow = createServerFn({ method: "POST" })
  .middleware([...admin()])
  .validator((data: unknown): SyncInput => {
    const d = (data ?? {}) as Partial<SyncInput>;
    return {
      from: typeof d.from === "string" && ISO_DAY.test(d.from) ? d.from : undefined,
      to: typeof d.to === "string" && ISO_DAY.test(d.to) ? d.to : undefined,
    };
  })
  .handler(async ({ data }): Promise<MetaSyncOutcome> => {
    const { syncMetaAds } = await import("@/lib/meta-ads-sync.server");
    const r = await syncMetaAds({ ...data, trigger: "manual" });
    return {
      ok: r.ok,
      status: r.status,
      dateFrom: r.dateFrom,
      dateTo: r.dateTo,
      campaigns: r.campaigns,
      adsets: r.adsets,
      ads: r.ads,
      insightRows: r.insightRows,
      message: r.message,
      errorKind: r.errorKind,
    };
  });

export const exportMetaAds = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator((data: unknown): ExportInput => {
    const d = (data ?? {}) as Partial<ExportInput>;
    const dataset: MetaAdsExportDataset = d.dataset === "meta_ads_orders" ? d.dataset : "meta_ads";
    return { ...parseReport(data), dataset };
  })
  .handler(async ({ data }) => {
    const { buildMetaAdsExport } = await import("@/lib/meta-ads-report.server");
    return buildMetaAdsExport(data.dataset, rangeOf(data), data.model);
  });
