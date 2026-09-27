// Reads the synced Meta tables (Neon) and the website's own attribution, and
// hands both to the pure join in meta-ads-report.core.ts. Analytics pages read
// Neon only — nothing here calls Meta.
import {
  N,
  attributeCheckouts,
  cairoDay,
  loadCheckouts,
  loadSessions,
  makeCtx,
  periodInfo,
  query,
  touchOf,
} from "@/lib/analytics-core.server";
import type { AnalyticsRange } from "@/lib/store-time";
import type { ExportResult, TouchModel } from "@/lib/analytics-center.types";
import type { MetaAdsReport, MetaAdsStatusView, MetaDashboardTiles } from "@/lib/meta-ads.types";
import { getSyncStatus, metaAdsTablesApplied } from "@/lib/meta-ads-sync.server";
import { buildDashboardTiles } from "@/lib/meta-ads-dashboard.core";
import {
  buildMetaAdsReport,
  createMatcher,
  type AdInput,
  type AdsetInput,
  type CampaignInput,
  type InsightInput,
} from "@/lib/meta-ads-report.core";

const EXPORT_ROW_LIMIT = 10_000;

type Entities = { campaigns: CampaignInput[]; adsets: AdsetInput[]; ads: AdInput[] };

async function loadEntities(): Promise<Entities> {
  const [c, s, a] = await Promise.all([
    query<{
      meta_campaign_id: string;
      name: string | null;
      status: string | null;
      objective: string | null;
    }>(
      `select meta_campaign_id, name, coalesce(effective_status, status) status, objective from meta_campaigns`,
    ),
    query<{
      meta_adset_id: string;
      meta_campaign_id: string | null;
      name: string | null;
      status: string | null;
    }>(
      `select meta_adset_id, meta_campaign_id, name, coalesce(effective_status, status) status from meta_adsets`,
    ),
    query<{
      meta_ad_id: string;
      meta_adset_id: string | null;
      meta_campaign_id: string | null;
      name: string | null;
      status: string | null;
    }>(
      `select meta_ad_id, meta_adset_id, meta_campaign_id, name, coalesce(effective_status, status) status from meta_ads`,
    ),
  ]);
  return {
    campaigns: c.map((r) => ({
      id: r.meta_campaign_id,
      name: r.name,
      status: r.status,
      objective: r.objective,
    })),
    adsets: s.map((r) => ({
      id: r.meta_adset_id,
      campaignId: r.meta_campaign_id,
      name: r.name,
      status: r.status,
    })),
    ads: a.map((r) => ({
      id: r.meta_ad_id,
      adsetId: r.meta_adset_id,
      campaignId: r.meta_campaign_id,
      name: r.name,
      status: r.status,
    })),
  };
}

async function loadInsights(
  from: string,
  to: string,
): Promise<{ rows: InsightInput[]; through: string | null }> {
  const rows = await query<{
    date: string;
    meta_ad_id: string;
    meta_adset_id: string | null;
    meta_campaign_id: string | null;
    spend: string;
    impressions: string;
    clicks: string;
    link_clicks: string | null;
    purchases: string | null;
    purchase_value: string | null;
    currency: string | null;
  }>(
    `select to_char(date, 'YYYY-MM-DD') date, meta_ad_id, meta_adset_id, meta_campaign_id,
            spend, impressions, clicks, link_clicks, purchases, purchase_value, currency
     from meta_ad_insights_daily where date >= $1::date and date <= $2::date`,
    [from, to],
  );
  const opt = (v: string | null) => (v === null || v === undefined ? null : N(v));
  let through: string | null = null;
  const out = rows.map((r) => {
    if (!through || r.date > through) through = r.date;
    return {
      date: r.date,
      adId: r.meta_ad_id,
      adsetId: r.meta_adset_id,
      campaignId: r.meta_campaign_id,
      spend: N(r.spend),
      impressions: N(r.impressions),
      clicks: N(r.clicks),
      linkClicks: opt(r.link_clicks),
      purchases: opt(r.purchases),
      purchaseValue: opt(r.purchase_value),
      currency: r.currency,
    };
  });
  return { rows: out, through };
}

const isCancelled = (status: string) => ["cancelled", "returned"].includes(status.toLowerCase());

export type MetaAdsReportResult = { status: MetaAdsStatusView; report: MetaAdsReport | null };

/** The synced Meta numbers joined to website traffic and orders for one period. */
export async function getMetaAdsReport(
  range: AnalyticsRange,
  model: TouchModel,
): Promise<MetaAdsReportResult> {
  const status = await getSyncStatus();
  if (!status.migrationApplied) return { status, report: null };

  const from = cairoDay(range.start);
  const to = cairoDay(new Date(range.end.getTime() - 1));
  const ctx = await makeCtx(range);
  const [entities, insights, sessions, checkouts] = await Promise.all([
    loadEntities(),
    loadInsights(from, to),
    loadSessions(ctx),
    loadCheckouts(ctx),
  ]);
  const attributed = await attributeCheckouts(ctx, checkouts, model);

  const report = buildMetaAdsReport({
    period: periodInfo(range),
    model,
    insights: insights.rows,
    campaigns: entities.campaigns,
    adsets: entities.adsets,
    ads: entities.ads,
    sessions: sessions.map((s) => {
      const t = touchOf(s, model);
      return {
        visitorId: s.visitor_id,
        source: t.source,
        medium: t.medium,
        campaign: t.campaign,
        content: t.content,
        carted: !!s.carted,
        checkout: !!s.checkout,
      };
    }),
    checkouts: attributed.map((c) => ({
      status: c.status,
      revenue: N(c.revenue),
      source: c.touch?.source ?? "unattributed",
      medium: c.touch?.medium ?? null,
      campaign: c.touch?.campaign ?? null,
      content: c.touch?.content ?? null,
    })),
    storeOrders: checkouts.filter((c) => !isCancelled(c.status)).length,
    storeRevenueNet: checkouts
      .filter((c) => !isCancelled(c.status))
      .reduce((s, c) => s + N(c.revenue), 0),
    dataThrough: insights.through,
  });
  return { status, report };
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

type Row = Record<string, string | number | null>;
const r2 = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));

/**
 * meta_ads         one row per ad (with campaign and ad set), platform + website numbers.
 * meta_ads_orders  one row per checkout with its first-touch and last-touch Meta
 *                  campaign / ad. Order numbers only — no customer data.
 */
export async function buildMetaAdsExport(
  dataset: "meta_ads" | "meta_ads_orders",
  range: AnalyticsRange,
  model: TouchModel,
): Promise<ExportResult> {
  const stamp = `${cairoDay(range.start)}_${cairoDay(new Date(range.end.getTime() - 1))}`;
  const finish = (name: string, rows: Row[]): ExportResult => ({
    filename: `brwazwneon-${name}-${stamp}`,
    rows: rows.slice(0, EXPORT_ROW_LIMIT),
    truncated: rows.length > EXPORT_ROW_LIMIT,
  });
  if (!(await metaAdsTablesApplied())) return finish(dataset, []);

  if (dataset === "meta_ads") {
    const { report } = await getMetaAdsReport(range, model);
    const rows: Row[] = [];
    for (const c of report?.campaigns ?? []) {
      for (const s of c.adsets) {
        for (const a of s.ads) {
          rows.push({
            campaign_id: c.id,
            campaign: c.name,
            ad_set_id: s.id || null,
            ad_set: s.id ? s.name : null,
            ad_id: a.id,
            ad: a.name,
            status: a.status,
            spend: r2(a.platform.spend),
            impressions: a.platform.impressions,
            clicks: a.platform.clicks,
            link_clicks: a.platform.linkClicks,
            ctr_pct: r2(a.platform.ctr),
            cpc: r2(a.platform.cpc),
            cpm: r2(a.platform.cpm),
            meta_purchases: a.platform.metaPurchases,
            meta_purchase_value: r2(a.platform.metaPurchaseValue),
            site_sessions: a.site.sessions,
            site_add_to_cart: a.site.addToCart,
            site_checkout: a.site.checkout,
            site_orders: a.site.orders,
            site_revenue_net_egp: r2(a.site.revenueNet),
            site_revenue_confirmed_egp: r2(a.site.revenueConfirmed),
            site_revenue_delivered_egp: r2(a.site.revenueDelivered),
            cpa: r2(a.cpa),
            roas: r2(a.roas),
          });
        }
      }
      if (c.siteWithoutAd.sessions > 0 || c.siteWithoutAd.ordersAll > 0) {
        rows.push({
          campaign_id: c.id,
          campaign: c.name,
          ad_set_id: null,
          ad_set: null,
          ad_id: null,
          ad: "(site traffic with no ad id)",
          status: null,
          spend: 0,
          impressions: 0,
          clicks: 0,
          link_clicks: null,
          ctr_pct: null,
          cpc: null,
          cpm: null,
          meta_purchases: null,
          meta_purchase_value: null,
          site_sessions: c.siteWithoutAd.sessions,
          site_add_to_cart: c.siteWithoutAd.addToCart,
          site_checkout: c.siteWithoutAd.checkout,
          site_orders: c.siteWithoutAd.orders,
          site_revenue_net_egp: r2(c.siteWithoutAd.revenueNet),
          site_revenue_confirmed_egp: r2(c.siteWithoutAd.revenueConfirmed),
          site_revenue_delivered_egp: r2(c.siteWithoutAd.revenueDelivered),
          cpa: null,
          roas: null,
        });
      }
    }
    return finish("meta-ads", rows);
  }

  const ctx = await makeCtx(range);
  const [entities, checkouts] = await Promise.all([loadEntities(), loadCheckouts(ctx)]);
  const [first, last] = await Promise.all([
    attributeCheckouts(ctx, checkouts, "first"),
    attributeCheckouts(ctx, checkouts, "last"),
  ]);
  const matcher = createMatcher(entities.campaigns, entities.ads);
  const campName = new Map(entities.campaigns.map((c) => [c.id, c.name]));
  const adName = new Map(entities.ads.map((a) => [a.id, a.name]));
  const describe = (t: (typeof first)[number]["touch"], p: "first" | "last"): Row => {
    const a = t ? matcher.assign(t) : null;
    return {
      [`${p}_touch_source`]: t?.source ?? "unattributed",
      [`${p}_touch_campaign_id`]: a?.campaignId ?? null,
      [`${p}_touch_campaign`]: a?.campaignId ? (campName.get(a.campaignId) ?? null) : null,
      [`${p}_touch_ad_id`]: a?.adId ?? null,
      [`${p}_touch_ad`]: a?.adId ? (adName.get(a.adId) ?? null) : null,
      [`${p}_touch_matched_by`]: a ? a.by : null,
    };
  };
  const rows: Row[] = checkouts.map((c, i) => ({
    order_number: c.order_number,
    order_day: cairoDay(new Date(c.created_at)),
    status: c.status,
    revenue_egp: N(c.revenue),
    ...describe(first[i]?.touch ?? null, "first"),
    ...describe(last[i]?.touch ?? null, "last"),
  }));
  return finish("meta-ads-orders", rows);
}

/**
 * The four Executive Dashboard marketing tiles. Never throws: if anything here
 * fails the dashboard still loads and the tiles say "unavailable".
 */
export async function getMetaDashboardTiles(range: AnalyticsRange): Promise<MetaDashboardTiles> {
  const empty: MetaDashboardTiles = {
    state: "unavailable",
    stale: false,
    lastSuccessAt: null,
    dataThrough: null,
    missing: [],
    currencyMismatch: false,
    spend: null,
    orders: null,
    revenueNet: null,
    cpa: null,
    roas: null,
    unmatchedOrders: 0,
  };
  try {
    const status = await getSyncStatus();
    if (!status.migrationApplied || !status.lastSuccess) {
      return buildDashboardTiles({ status, covered: false, report: null });
    }
    const from = cairoDay(range.start);
    const today = cairoDay(new Date());
    const lastDay = cairoDay(new Date(range.end.getTime() - 1));
    const to = lastDay < today ? lastDay : today;
    const covered =
      (
        await query(
          `select 1 from meta_sync_runs
           where status = 'success' and date_from <= $1::date and date_to >= $2::date limit 1`,
          [from, to],
        )
      ).length > 0;
    if (!covered) return buildDashboardTiles({ status, covered: false, report: null });
    const { report } = await getMetaAdsReport(range, "last");
    return buildDashboardTiles({ status, covered, report });
  } catch {
    return empty;
  }
}
