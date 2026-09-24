// @vitest-environment jsdom
/**
 * Renders every Analytics Center section with server functions mocked to
 * return real-shaped data (numbers taken from the production run), to catch
 * runtime errors and to pin the honesty rules: unmeasurable values show as
 * "Not tracked" / "No data" / "Not connected", never as a fake zero.
 * Uses React's own act/createRoot (no extra test-library dependency).
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AdvertisingData,
  CartData,
  ClicksData,
  CustomDesignData,
  FunnelData,
  Metrics,
  OverviewData,
  PeriodInfo,
  ProductsData,
  ReportData,
  TrafficData,
} from "@/lib/analytics-center.types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks (browsers have it).
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const period: PeriodInfo = {
  key: "30d",
  start: "2026-08-26T21:00:00.000Z",
  end: "2026-09-24T21:00:00.000Z",
  prevStart: "2026-07-27T21:00:00.000Z",
  prevEnd: "2026-08-26T21:00:00.000Z",
  days: 29,
};
const metrics = (over: Partial<Metrics> = {}): Metrics => ({
  visitors: 320,
  sessions: 502,
  pageViews: 1735,
  productViews: 368,
  clicks: 0,
  addToCartSessions: 42,
  addToCartItems: 134,
  viewCartSessions: 0,
  checkoutStarts: 8,
  orders: 8,
  revenue: 11124,
  revenueNet: 7084,
  cancelledOrders: 3,
  newVisitors: 320,
  returningVisitors: 0,
  conversionRate: 0.025,
  aov: 1390.5,
  ...over,
});
const day = (d: string, over = {}) => ({
  day: d,
  visitors: 0,
  sessions: 0,
  pageViews: 0,
  addToCartSessions: 0,
  orders: 0,
  revenue: 0,
  ...over,
});

const fns = vi.hoisted(() => ({
  overview: vi.fn(),
  traffic: vi.fn(),
  products: vi.fn(),
  clicks: vi.fn(),
  funnel: vi.fn(),
  cart: vi.fn(),
  campaigns: vi.fn(),
  advertising: vi.fn(),
  custom: vi.fn(),
  report: vi.fn(),
  narrative: vi.fn(),
}));
vi.mock("@/lib/analytics-center.functions", () => ({
  getAnalyticsOverviewCenter: fns.overview,
  getAnalyticsTraffic: fns.traffic,
  getAnalyticsProducts: fns.products,
  getAnalyticsClicks: fns.clicks,
  getAnalyticsFunnel: fns.funnel,
  getAnalyticsCart: fns.cart,
  getAnalyticsCampaigns: fns.campaigns,
  getAnalyticsAdvertising: fns.advertising,
  getAnalyticsCustomDesign: fns.custom,
  getAnalyticsReport: fns.report,
  getAnalyticsReportNarrative: fns.narrative,
  exportAnalyticsDataset: vi.fn(),
}));

import { OverviewSection } from "./OverviewSection";
import { TrafficSection } from "./TrafficSection";
import { ProductsSection } from "./ProductsSection";
import { ClicksSection } from "./ClicksSection";
import { FunnelSection } from "./FunnelSection";
import { CartSection } from "./CartSection";
import { CampaignsSection } from "./CampaignsSection";
import { AdvertisingSection } from "./AdvertisingSection";
import { CustomDesignSection } from "./CustomDesignSection";
import { ReportsSection } from "./ReportsSection";

let root: Root | null = null;
let container: HTMLElement;

async function mount(ui: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(ui);
  });
}

/** Waits (inside act) until the rendered text matches, and returns it. */
async function settle(pattern: RegExp | string, timeout = 4000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    const t = container.textContent ?? "";
    if (typeof pattern === "string" ? t.includes(pattern) : pattern.test(t)) return t;
  }
  throw new Error(
    `Timed out waiting for ${pattern}. Rendered: ${(container.textContent ?? "").slice(0, 400)}`,
  );
}
const count = (text: string, s: string) => text.split(s).length - 1;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  Object.values(fns).forEach((f) => f.mockReset());
});

const input = { range: "30d" as const };

describe("Analytics Center sections render real-shaped data without errors", () => {
  it("Overview: KPIs with previous-period comparison, notes about untracked events", async () => {
    const data: OverviewData = {
      period,
      current: metrics(),
      previous: metrics({ visitors: 200, orders: 4, revenue: 5000, conversionRate: 0.02 }),
      series: [
        day("2026-09-12", { visitors: 1, sessions: 1, pageViews: 1 }),
        day("2026-09-13", {
          visitors: 9,
          sessions: 10,
          pageViews: 37,
          addToCartSessions: 1,
          orders: 1,
          revenue: 1000,
        }),
      ],
      notes: {
        devExcludedVisits: 304,
        devExcludedSessions: 24,
        trackingStarted: { view_cart: null, select_item: null, whatsapp_click: null },
        attributionMigrationApplied: true,
      },
    };
    fns.overview.mockResolvedValue(data);
    await mount(<OverviewSection input={input} />);
    const t = await settle("Visitors");
    expect(t).toContain("320");
    expect(t).toContain("11,124 EGP");
    expect(t).toContain("2.5%");
    expect(t).toContain("▲ 60%"); // 320 vs 200
    expect(t).toContain("was 200"); // previous absolute value shown
    expect(t).toMatch(/304 page views from 24 sessions/);
    expect(t).toContain("Not recorded yet");
    expect(t).toContain("Revenue excluding cancelled/returned:");
  });

  it("Overview with no traffic shows the empty state, not zeros dressed up as data", async () => {
    fns.overview.mockResolvedValue({
      period,
      current: metrics({
        visitors: 0,
        sessions: 0,
        pageViews: 0,
        orders: 0,
        revenue: 0,
        conversionRate: null,
        aov: null,
      }),
      previous: metrics({ visitors: 0 }),
      series: [day("2026-09-12")],
      notes: {
        devExcludedVisits: 0,
        devExcludedSessions: 0,
        trackingStarted: {},
        attributionMigrationApplied: true,
      },
    } satisfies OverviewData);
    await mount(<OverviewSection input={input} />);
    await settle("No data available for this period");
  });

  it("Overview surfaces a server error with a Retry button", async () => {
    fns.overview.mockRejectedValue(new Error("Error connecting to database: fetch failed"));
    await mount(<OverviewSection input={input} />);
    const t = await settle("Couldn't load this report");
    expect(t).toContain("Retry");
  });

  it("Traffic: sources table and attribution-quality notices", async () => {
    const data: TrafficData = {
      period,
      model: "last",
      rows: [
        {
          source: "instagram",
          medium: "paid_social",
          campaign: "eid",
          visitors: 117,
          sessions: 172,
          pageViews: 622,
          productViews: 125,
          addToCart: 20,
          viewCart: 0,
          checkout: 3,
          orders: 2,
          revenue: 3664,
          conversionRate: 0.0116,
        },
        {
          source: "direct",
          medium: null,
          campaign: null,
          visitors: 110,
          sessions: 173,
          pageViews: 526,
          productViews: 122,
          addToCart: 7,
          viewCart: 0,
          checkout: 3,
          orders: 3,
          revenue: 4040,
          conversionRate: 0.0173,
        },
      ],
      newVisitors: 300,
      returningVisitors: 20,
      devices: [{ key: "mobile", sessions: 351 }],
      browsers: [{ key: "Chrome", sessions: 300 }],
      operatingSystems: [{ key: "Android", sessions: 200 }],
      landingPages: [{ key: "/", sessions: 345 }],
      exitPages: [{ key: "/cart", sessions: 32 }],
      attributionQuality: {
        sessions: 503,
        stamped: 0,
        legacy: 503,
        ordersFromOrderUtm: 1,
        ordersFromSession: 7,
        ordersUnattributed: 0,
        legacyInternalReferrer: 78,
      },
    };
    fns.traffic.mockResolvedValue(data);
    await mount(<TrafficSection input={input} model="last" />);
    const t = await settle("Traffic sources");
    expect(t).toMatch(/503 of 503 sessions were recorded before/);
    expect(t).toMatch(/78 of them entered from our own site/);
    expect(t).toContain("Country and city are not shown");
    expect(t).toContain("last-touch attribution");
  });

  it("Products: sortable table, top lists, and the 'not a quality ranking' statement", async () => {
    const row = (title: string, over = {}) => ({
      id: title,
      title,
      slug: null,
      imageUrl: null,
      category: "Movies",
      views: 7,
      uniqueViews: 5,
      clicks: 0,
      cartAdds: 3,
      wishlists: 0,
      purchases: 1,
      revenue: 233,
      conversionRate: 0.14,
      ...over,
    });
    const data: ProductsData = {
      period,
      rows: [row("Joker (19)"), row("Batman (8)", { views: 6 })],
      total: 2,
      page: 1,
      pageSize: 25,
      sort: "views",
      dir: "desc",
      clicksTracked: false,
      top: {
        views: [row("Joker (19)")],
        clicks: [],
        cartAdds: [row("Joker (19)")],
        purchases: [row("Joker (19)")],
      },
      limitations: ["Checkout is recorded per session, not per product."],
    };
    fns.products.mockResolvedValue(data);
    await mount(<ProductsSection input={input} />);
    const t = await settle("Joker (19)");
    expect(t).toContain("nothing here is a quality ranking");
    expect(t).toContain("Most clicked");
    expect(t).toContain("14.0%");
    // select_item is not recorded yet: per-product clicks must not read as 0.
    const cells = [...document.querySelectorAll("tbody tr:first-child td")].map((c) =>
      (c.textContent ?? "").trim(),
    );
    expect(cells).toContain("—");
  });

  it("Clicks: event types never recorded read 'Not recorded yet', not 0", async () => {
    const data: ClicksData = {
      period,
      totalClicks: null,
      rows: [
        { key: "select_item", label: "Product clicks", events: 0, sessions: 0, firstSeen: null },
        {
          key: "cart_add",
          label: "Add to cart",
          events: 134,
          sessions: 42,
          firstSeen: "2026-09-12T15:03:16.072Z",
        },
      ],
      searches: { total: 39, zeroResult: 19 },
      topSearches: [{ label: "bmw", n: 5 }],
      zeroResultSearches: [],
      topBanners: [],
      topOffers: [],
      topCategories: [],
      limitations: [],
    };
    fns.clicks.mockResolvedValue(data);
    await mount(<ClicksSection input={input} />);
    const t = await settle("Product clicks");
    expect(t).toContain("Not recorded yet");
    expect(t).toContain("134");
    expect(t).toMatch(/—\s*Total clicks/);
  });

  it("Funnel: an unmeasurable step is 'Not tracked' with its reason; ad clicks are 'Not connected'", async () => {
    const data: FunnelData = {
      period,
      paidSessions: 0,
      limitations: ["Ad clicks are not connected."],
      steps: [
        { key: "sessions", label: "Sessions", count: 503, pctOfFirst: 1, dropFromPrevious: null },
        {
          key: "view_cart",
          label: "View cart",
          count: null,
          pctOfFirst: null,
          dropFromPrevious: null,
          note: "Cart views have not been tracked yet for this period.",
        },
        { key: "purchase", label: "Purchase", count: 8, pctOfFirst: 0.016, dropFromPrevious: 0.81 },
      ],
    };
    fns.funnel.mockResolvedValue(data);
    await mount(<FunnelSection input={input} model="last" />);
    const t = await settle("Visit → purchase");
    expect(t).toContain("Not tracked");
    expect(t).toContain("Cart views have not been tracked yet");
    expect(t).toContain("Not connected — needs ad-platform APIs");
    expect(t).toContain("81.0% drop-off");
  });

  it("Cart: average cart value reads 'Not tracked yet' when there is no cart-view data", async () => {
    fns.funnel.mockResolvedValue({
      period,
      paidSessions: 0,
      limitations: [],
      steps: [
        { key: "sessions", label: "Sessions", count: 10, pctOfFirst: 1, dropFromPrevious: null },
      ],
    } satisfies FunnelData);
    const data: CartData = {
      period,
      cartSessions: 42,
      itemsAdded: 134,
      viewCartSessions: 0,
      checkoutStarts: 8,
      orders: 8,
      cartAbandonment: 0.81,
      checkoutAbandonment: 0,
      averageCartValue: null,
      averageCartValueSamples: 0,
      abandonedProducts: [{ id: "p1", title: "Messi", imageUrl: null, adds: 4 }],
      cartSizes: [{ label: "4", checkouts: 3 }],
      orderTypes: [{ type: "regular", label: "Regular posters", checkouts: 7, revenue: 8885 }],
      notes: ["Cart abandonment = 1 - orders / carts."],
    };
    fns.cart.mockResolvedValue(data);
    await mount(<CartSection input={input} />);
    const t = await settle("Cart numbers");
    expect(t).toContain("Not tracked yet");
    expect(t).toContain("81%");
    expect(t).toContain("Cart funnel");
  });

  it("Campaigns: shows the ad-set / ad-level limitation", async () => {
    fns.campaigns.mockResolvedValue({
      period,
      model: "last",
      rows: [
        {
          campaign: "52575575055376",
          source: "instagram",
          medium: "paid",
          content: null,
          sessions: 0,
          visitors: 0,
          productViews: 0,
          addToCart: 0,
          checkout: 0,
          orders: 1,
          revenue: 1000,
        },
      ],
      limitations: ["Ad set and ad level are not captured, so they cannot be shown."],
    });
    await mount(<CampaignsSection input={input} model="last" />);
    const t = await settle("52575575055376");
    expect(t).toContain("What this data can and can't tell you");
    expect(t).toContain("1,000 EGP");
  });

  it("Advertising: every ad-platform metric reads as not connected — nothing is fabricated", async () => {
    const data: AdvertisingData = {
      period,
      platforms: (["meta", "tiktok", "google"] as const).map((key) => ({
        key,
        label: key,
        apiStatus: "not_connected" as const,
        apiNeeds: "API access needed",
        paidSessions: 0,
        orders: key === "meta" ? 1 : 0,
        revenue: key === "meta" ? 1000 : 0,
        tracking: [{ label: "Pixel", status: "connected" as const, detail: "on" }],
      })),
      manualExpenses: { total: 0, entries: 0, note: "Manually logged in Finance." },
      blended: null,
    };
    fns.advertising.mockResolvedValue(data);
    await mount(<AdvertisingSection input={input} />);
    const t = await settle("Ads API not connected");
    expect(count(t, "Ads API not connected")).toBe(3);
    expect(count(t, "Spend: —")).toBe(3);
    expect(count(t, "ROAS: —")).toBe(3);
    expect(t).toContain("No ad expenses logged in Finance for this period");
    expect(t).not.toContain("Blended ROAS");
  });

  it("Custom design: steps not yet tracked are 'Not tracked'; purchases come from orders", async () => {
    const data: CustomDesignData = {
      period,
      steps: [
        { key: "page", label: "Visited Custom Design page", count: 39 },
        {
          key: "custom_design_start",
          label: "Started (chose an image)",
          count: null,
          note: "Not tracked yet for this period.",
        },
        { key: "purchase", label: "Purchased", count: 1, note: "Counted from orders." },
      ],
      purchases: { checkouts: 1, items: 1, revenue: 249 },
      allTime: { checkouts: 1, revenue: 249 },
      notes: ["The uploaded image itself is never stored in analytics."],
    };
    fns.custom.mockResolvedValue(data);
    await mount(<CustomDesignSection input={input} />);
    const t = await settle("Custom design funnel");
    expect(t).toContain("Not tracked");
    expect(t).toContain("249 EGP");
  });
});

describe("Reports: the AI summary is optional, grounded and fails gracefully", () => {
  const reportText = "BRWAZWNEON MARKETING REPORT\n- Visitors: 75\n- Orders: 1";
  const report = {
    kind: "daily",
    period: { ...period, key: "custom", days: 1 },
    text: reportText,
  } as unknown as ReportData;

  const clickAi = async () => {
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Write AI summary|Regenerate/.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
  };

  it("renders the measured report first and calls the AI only on demand", async () => {
    fns.report.mockResolvedValue(report);
    await mount(<ReportsSection />);
    const t = await settle("BRWAZWNEON MARKETING REPORT");
    expect(t).toContain("Write AI summary");
    expect(fns.narrative).not.toHaveBeenCalled();
  });

  it("shows the narrative with its provider and flags figures that are not in the report", async () => {
    fns.report.mockResolvedValue(report);
    fns.narrative.mockResolvedValue({
      text: "Visitors were 75 and one order came in, about 40% of a target.",
      provider: "gemini:k1",
      unverifiedNumbers: ["40"],
    });
    await mount(<ReportsSection />);
    await settle("BRWAZWNEON MARKETING REPORT");
    await clickAi();
    const t = await settle("Check before using");
    expect(t).toContain("gemini:k1");
    expect(t).toContain("generated from the numbers above");
    expect(t).toMatch(/not in the measured report[\s\S]*40/);
    expect(fns.narrative).toHaveBeenCalledTimes(1);
  });

  it("a provider failure leaves the measured report intact and says the summary failed", async () => {
    fns.report.mockResolvedValue(report);
    fns.narrative.mockRejectedValue(new Error("All Gemini keys are unavailable."));
    await mount(<ReportsSection />);
    await settle("BRWAZWNEON MARKETING REPORT");
    await clickAi();
    const t = await settle("Couldn't write the AI summary");
    expect(t).toContain("All Gemini keys are unavailable.");
    expect(t).not.toContain("Couldn't load this report");
    expect(t).toContain("- Visitors: 75");
  });
});
