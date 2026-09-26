// Shapes shared between the Meta Ads server code and the Analytics Center UI.
// Types only: safe to import from the browser.
import type { PeriodInfo, TouchModel } from "@/lib/analytics-center.types";

/** What the WEBSITE measured for traffic and orders that carry a Meta ad id. */
export type SiteMetrics = {
  sessions: number;
  visitors: number;
  addToCart: number;
  checkout: number;
  /** Checkouts excluding cancelled / returned. */
  orders: number;
  /** Every checkout, cancelled or not. */
  ordersAll: number;
  cancelled: number;
  /** Revenue of every checkout (cancelled included). */
  revenueGross: number;
  /** Revenue excluding cancelled / returned. The figure CPA and ROAS use. */
  revenueNet: number;
  /** Net revenue of orders the customer has confirmed (confirmed / shipped / delivered). */
  revenueConfirmed: number;
  /** Net revenue of delivered orders. */
  revenueDelivered: number;
};

export type PlatformMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  /** Percent, recomputed from the summed clicks and impressions. */
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  /** Purchases Meta itself attributes (pixel + CAPI). Not the same thing as site orders. */
  metaPurchases: number | null;
  metaPurchaseValue: number | null;
};

export type MetaAdsRowBase = {
  id: string;
  name: string;
  status: string | null;
  platform: PlatformMetrics;
  site: SiteMetrics;
  /** spend / net orders; null when there are no orders or no spend. */
  cpa: number | null;
  /** net revenue / spend; null when spend is zero (never Infinity). */
  roas: number | null;
};

export type MetaAdRow = MetaAdsRowBase & {
  adsetId: string | null;
  campaignId: string | null;
};

export type MetaAdsetRow = MetaAdsRowBase & {
  campaignId: string | null;
  ads: MetaAdRow[];
};

export type MetaCampaignRow = MetaAdsRowBase & {
  objective: string | null;
  adsets: MetaAdsetRow[];
  /**
   * Site traffic/orders whose UTM names this campaign but carries no ad id
   * (so no ad set or ad can be assigned). Kept, never dropped.
   */
  siteWithoutAd: SiteMetrics;
};

export type MetaAdsReport = {
  period: PeriodInfo;
  model: TouchModel;
  currency: string | null;
  /** True when Meta reported a currency other than EGP; CPA / ROAS are then withheld. */
  currencyMismatch: boolean;
  totals: {
    platform: PlatformMetrics;
    /** Site traffic/orders matched to a Meta campaign by id or (unique) name. */
    matched: SiteMetrics;
    /** Site traffic/orders tagged as paid Facebook/Instagram that match no synced campaign. */
    unmatchedMeta: SiteMetrics;
    /** Every non-test checkout in the period, from any source, for scale. */
    storeOrders: number;
    storeRevenueNet: number;
    cpa: number | null;
    roas: number | null;
  };
  campaigns: MetaCampaignRow[];
  /** How the site rows were tied to Meta rows: exact ids vs. a unique name. */
  matching: { byId: number; byName: number };
  dataThrough: string | null;
  notes: string[];
};

export type MetaAdsStatusView = {
  configured: boolean;
  missing: string[];
  invalid: string[];
  migrationApplied: boolean;
  apiVersion: string | null;
  lastAttempt: {
    status: "running" | "success" | "partial" | "failed";
    startedAt: string;
    finishedAt: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    rows: number;
    message: string | null;
    errorKind: string | null;
  } | null;
  lastSuccess: { finishedAt: string; dateFrom: string | null; dateTo: string | null } | null;
};

export type MetaSyncOutcome = {
  ok: boolean;
  status: "running" | "success" | "partial" | "failed";
  dateFrom: string;
  dateTo: string;
  campaigns: number;
  adsets: number;
  ads: number;
  insightRows: number;
  message: string | null;
  errorKind: string | null;
};

export type MetaAdsExportDataset = "meta_ads" | "meta_ads_orders";
