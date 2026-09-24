import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { resolveAnalyticsRange, type AnalyticsRangeKey } from "@/lib/store-time";
import { getCampaigns, getFunnel, getOverview, getTraffic } from "@/lib/analytics-core.server";
import {
  getAdvertising,
  getCart,
  getClicks,
  getCustomDesign,
  getProducts,
} from "@/lib/analytics-more.server";
import { buildExport, buildNarrative, buildReport } from "@/lib/analytics-report.server";
import type {
  ExportDataset,
  ProductSortKey,
  RangeInput,
  ReportPeriodKind,
  TouchModel,
} from "@/lib/analytics-center.types";

/**
 * Marketing & Analytics Center endpoints. Every one is admin-only (the same
 * requireAdminSessionNeon middleware as the rest of the admin) and returns
 * server-aggregated summaries — never raw event rows.
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

type WithModel = RangeInput & { model: TouchModel };

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

function parseWithModel(data: unknown): WithModel {
  const model = (data as { model?: unknown } | undefined)?.model === "first" ? "first" : "last";
  return { ...parseRange(data), model };
}

const rangeOf = (i: RangeInput) => resolveAnalyticsRange(i.range, { from: i.from, to: i.to });

const admin = () => [requireAdminSessionNeon] as const;

export const getAnalyticsOverviewCenter = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseRange)
  .handler(async ({ data }) => getOverview(rangeOf(data)));

export const getAnalyticsTraffic = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseWithModel)
  .handler(async ({ data }) => getTraffic(rangeOf(data), data.model));

export const getAnalyticsFunnel = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseWithModel)
  .handler(async ({ data }) => getFunnel(rangeOf(data), data.model));

export const getAnalyticsCampaigns = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseWithModel)
  .handler(async ({ data }) => getCampaigns(rangeOf(data), data.model));

export const getAnalyticsCart = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseRange)
  .handler(async ({ data }) => getCart(rangeOf(data)));

export const getAnalyticsClicks = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseRange)
  .handler(async ({ data }) => getClicks(rangeOf(data)));

export const getAnalyticsAdvertising = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseRange)
  .handler(async ({ data }) => getAdvertising(rangeOf(data)));

export const getAnalyticsCustomDesign = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseRange)
  .handler(async ({ data }) => getCustomDesign(rangeOf(data)));

type ProductsInput = RangeInput & {
  sort?: ProductSortKey;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  q?: string;
};

export const getAnalyticsProducts = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator((data: unknown): ProductsInput => {
    const d = (data ?? {}) as Partial<ProductsInput>;
    return {
      ...parseRange(data),
      sort: d.sort,
      dir: d.dir === "asc" ? "asc" : "desc",
      page: typeof d.page === "number" ? d.page : 1,
      pageSize: typeof d.pageSize === "number" ? d.pageSize : 25,
      q: typeof d.q === "string" ? d.q : "",
    };
  })
  .handler(async ({ data }) =>
    getProducts(rangeOf(data), {
      sort: data.sort,
      dir: data.dir,
      page: data.page,
      pageSize: data.pageSize,
      q: data.q,
    }),
  );

type ReportInput = { kind: ReportPeriodKind; date?: string };

const parseReport = (data: unknown): ReportInput => {
  const d = (data ?? {}) as Partial<ReportInput>;
  const kind: ReportPeriodKind = d.kind === "weekly" || d.kind === "monthly" ? d.kind : "daily";
  return { kind, date: typeof d.date === "string" && ISO_DAY.test(d.date) ? d.date : undefined };
};

/** The deterministic, number-only report. */
export const getAnalyticsReport = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator(parseReport)
  .handler(async ({ data }) => buildReport(data.kind, data.date));

/**
 * AI interpretation of the report. The numbers are always recomputed here on
 * the server (never accepted from the browser), and any figure in the AI's
 * text that is not in the measured report is returned in `unverifiedNumbers`.
 * POST because it spends AI quota.
 */
export const getAnalyticsReportNarrative = createServerFn({ method: "POST" })
  .middleware([...admin()])
  .validator(parseReport)
  .handler(async ({ data }) => buildNarrative(await buildReport(data.kind, data.date)));

type ExportInput = WithModel & { dataset: ExportDataset };
const DATASETS: readonly ExportDataset[] = [
  "traffic",
  "products",
  "campaigns",
  "cart",
  "revenue",
  "orders",
];

export const exportAnalyticsDataset = createServerFn({ method: "GET" })
  .middleware([...admin()])
  .validator((data: unknown): ExportInput => {
    const d = (data ?? {}) as Partial<ExportInput>;
    const dataset = DATASETS.includes(d.dataset as ExportDataset)
      ? (d.dataset as ExportDataset)
      : "traffic";
    return { ...parseWithModel(data), dataset };
  })
  .handler(async ({ data }) => buildExport(data.dataset, rangeOf(data), data.model));
