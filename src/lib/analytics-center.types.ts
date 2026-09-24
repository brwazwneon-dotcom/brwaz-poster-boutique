/**
 * Shapes returned by the Analytics Center server functions. Pure types —
 * imported by both the server aggregations and the admin UI.
 *
 * Every number here is computed server-side from Neon. A value that cannot be
 * measured is `null` (rendered as "No data" / "Not tracked yet" / "Not
 * connected"), never a fake zero.
 */
import type { AnalyticsRangeKey } from "./store-time";

export type RangeInput = {
  range: AnalyticsRangeKey;
  /** Cairo calendar dates (YYYY-MM-DD), inclusive — only for range "custom". */
  from?: string;
  to?: string;
};

export type TouchModel = "first" | "last";

export type PeriodInfo = {
  key: AnalyticsRangeKey;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  days: number;
};

export type Metrics = {
  visitors: number;
  sessions: number;
  pageViews: number;
  productViews: number;
  /** null = no click event of any kind was recorded in the period (not tracked, not "zero"). */
  clicks: number | null;
  addToCartSessions: number;
  addToCartItems: number;
  viewCartSessions: number;
  checkoutStarts: number;
  orders: number;
  revenue: number;
  /** Revenue excluding cancelled/returned checkouts. */
  revenueNet: number;
  cancelledOrders: number;
  newVisitors: number;
  returningVisitors: number;
  /** orders ÷ visitors (same definition as the Executive Dashboard). */
  conversionRate: number | null;
  aov: number | null;
};

export type SeriesPoint = {
  day: string; // YYYY-MM-DD (Cairo)
  visitors: number;
  sessions: number;
  pageViews: number;
  addToCartSessions: number;
  orders: number;
  revenue: number;
};

export type DataNotes = {
  /** Historical visits/sessions excluded as development/QA traffic. */
  devExcludedVisits: number;
  devExcludedSessions: number;
  /** When each newer event type first appeared (null = never recorded yet). */
  trackingStarted: Record<string, string | null>;
  attributionMigrationApplied: boolean;
};

export type OverviewData = {
  period: PeriodInfo;
  current: Metrics;
  previous: Metrics;
  series: SeriesPoint[];
  notes: DataNotes;
};

export type TrafficRow = {
  source: string;
  medium: string | null;
  campaign: string | null;
  visitors: number;
  sessions: number;
  pageViews: number;
  productViews: number;
  addToCart: number;
  viewCart: number;
  checkout: number;
  orders: number;
  revenue: number;
  /** orders ÷ sessions for this row. */
  conversionRate: number | null;
};

export type CountRow = { key: string; sessions: number };

export type TrafficData = {
  period: PeriodInfo;
  model: TouchModel;
  rows: TrafficRow[];
  newVisitors: number;
  returningVisitors: number;
  devices: CountRow[];
  browsers: CountRow[];
  operatingSystems: CountRow[];
  landingPages: CountRow[];
  exitPages: CountRow[];
  attributionQuality: {
    sessions: number;
    stamped: number;
    legacy: number;
    ordersFromOrderUtm: number;
    ordersFromSession: number;
    ordersUnattributed: number;
    /** Legacy sessions whose entry referrer was our own site (true origin unknown). */
    legacyInternalReferrer: number;
  };
};

export type ProductSortKey =
  | "views"
  | "unique_views"
  | "clicks"
  | "cart_adds"
  | "wishlists"
  | "purchases"
  | "revenue"
  | "conversion"
  | "title";

export type ProductRow = {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  category: string | null;
  views: number;
  uniqueViews: number;
  clicks: number;
  cartAdds: number;
  wishlists: number;
  purchases: number;
  revenue: number;
  /** purchases ÷ views. */
  conversionRate: number | null;
};

export type ProductsData = {
  period: PeriodInfo;
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: ProductSortKey;
  dir: "asc" | "desc";
  /** false until the select_item event has been recorded (then per-product clicks are real). */
  clicksTracked: boolean;
  top: {
    views: ProductRow[];
    clicks: ProductRow[];
    cartAdds: ProductRow[];
    purchases: ProductRow[];
  };
  limitations: string[];
};

export type ClickRow = {
  key: string;
  label: string;
  events: number;
  sessions: number;
  /** null = this event type has never been recorded. */
  firstSeen: string | null;
};

export type LabelCount = { label: string; n: number };

export type ClicksData = {
  period: PeriodInfo;
  /** null = none of the click event types has ever been recorded. */
  totalClicks: number | null;
  rows: ClickRow[];
  searches: { total: number; zeroResult: number };
  topSearches: LabelCount[];
  zeroResultSearches: LabelCount[];
  topBanners: LabelCount[];
  topOffers: LabelCount[];
  topCategories: LabelCount[];
  limitations: string[];
};

export type FunnelStep = {
  key: string;
  label: string;
  /** null = not measurable for this period (see note). */
  count: number | null;
  pctOfFirst: number | null;
  dropFromPrevious: number | null;
  note?: string;
};

export type FunnelData = {
  period: PeriodInfo;
  steps: FunnelStep[];
  paidSessions: number;
  limitations: string[];
};

export type CartData = {
  period: PeriodInfo;
  cartSessions: number;
  itemsAdded: number;
  viewCartSessions: number;
  checkoutStarts: number;
  orders: number;
  cartAbandonment: number | null;
  checkoutAbandonment: number | null;
  averageCartValue: number | null;
  averageCartValueSamples: number;
  abandonedProducts: { id: string; title: string; imageUrl: string | null; adds: number }[];
  cartSizes: { label: string; checkouts: number }[];
  orderTypes: { type: string; label: string; checkouts: number; revenue: number }[];
  notes: string[];
};

export type CampaignRow = {
  campaign: string;
  source: string;
  medium: string | null;
  content: string | null;
  sessions: number;
  visitors: number;
  productViews: number;
  addToCart: number;
  checkout: number;
  orders: number;
  revenue: number;
};

export type CampaignsData = {
  period: PeriodInfo;
  model: TouchModel;
  rows: CampaignRow[];
  limitations: string[];
};

export type ConnectionStatus = "connected" | "not_connected" | "partial";

export type AdvertisingData = {
  period: PeriodInfo;
  platforms: {
    key: "meta" | "tiktok" | "google";
    label: string;
    apiStatus: ConnectionStatus;
    apiNeeds: string;
    tracking: { label: string; status: ConnectionStatus; detail: string }[];
    /** From UTM-tagged paid traffic — measured, not ad-platform reported. */
    paidSessions: number;
    orders: number;
    revenue: number;
  }[];
  manualExpenses: {
    total: number;
    entries: number;
    note: string;
  };
  blended: { spend: number; revenue: number; roas: number | null; note: string } | null;
};

export type CustomDesignStep = { key: string; label: string; count: number | null; note?: string };

export type CustomDesignData = {
  period: PeriodInfo;
  steps: CustomDesignStep[];
  purchases: { checkouts: number; items: number; revenue: number };
  allTime: { checkouts: number; revenue: number };
  notes: string[];
};

export type ReportPeriodKind = "daily" | "weekly" | "monthly";

export type ReportData = {
  kind: ReportPeriodKind;
  period: PeriodInfo;
  overview: OverviewData;
  traffic: TrafficData;
  funnel: FunnelData;
  products: ProductsData;
  campaigns: CampaignsData;
  advertising: AdvertisingData;
  /** Facts computed from the numbers above — no interpretation. */
  observations: string[];
  /** Explicitly labelled possibilities to investigate; never stated as causes. */
  hypotheses: string[];
  text: string;
};

export type ReportNarrative = {
  text: string;
  provider: string;
  /** Numbers in the narrative that do not appear in the measured report. */
  unverifiedNumbers: string[];
};

export type ExportDataset = "traffic" | "products" | "campaigns" | "cart" | "revenue" | "orders";

export type ExportResult = {
  filename: string;
  rows: Record<string, string | number | null>[];
  truncated: boolean;
};
