import { describe, expect, it } from "vitest";
import {
  buildMetaAdsReport,
  createMatcher,
  type ReportInput,
  type SiteCheckoutInput,
  type SiteSessionInput,
} from "./meta-ads-report.core";

const PERIOD = {
  key: "30d" as const,
  start: "2026-08-27T00:00:00.000Z",
  end: "2026-09-26T00:00:00.000Z",
  prevStart: "2026-07-28T00:00:00.000Z",
  prevEnd: "2026-08-27T00:00:00.000Z",
  days: 30,
};

// Ids taken from the real account (verified against Ads Manager).
const CAMP = "52575575055376";
const AD = "52575869248376";

const base = (over: Partial<ReportInput> = {}): ReportInput => ({
  period: PERIOD,
  model: "last",
  insights: [
    {
      date: "2026-09-20",
      adId: AD,
      adsetId: "S1",
      campaignId: CAMP,
      spend: 700,
      impressions: 10_000,
      clicks: 200,
      linkClicks: 150,
      purchases: 5,
      purchaseValue: 2500,
      currency: "EGP",
    },
    {
      date: "2026-09-21",
      adId: AD,
      adsetId: "S1",
      campaignId: CAMP,
      spend: 300,
      impressions: 5_000,
      clicks: 100,
      linkClicks: 50,
      purchases: 1,
      purchaseValue: 500,
      currency: "EGP",
    },
  ],
  campaigns: [{ id: CAMP, name: "IG | Sales | Offers", status: "PAUSED", objective: "SALES" }],
  adsets: [{ id: "S1", campaignId: CAMP, name: "Egypt 18-45", status: "PAUSED" }],
  ads: [{ id: AD, adsetId: "S1", campaignId: CAMP, name: "Video ad", status: "PAUSED" }],
  sessions: [],
  checkouts: [],
  storeOrders: 0,
  storeRevenueNet: 0,
  dataThrough: "2026-09-21",
  ...over,
});

const session = (over: Partial<SiteSessionInput> = {}): SiteSessionInput => ({
  visitorId: "v1",
  source: "instagram",
  medium: "paid",
  campaign: CAMP,
  content: AD,
  carted: false,
  checkout: false,
  ...over,
});
const checkout = (over: Partial<SiteCheckoutInput> = {}): SiteCheckoutInput => ({
  status: "confirmed",
  revenue: 1000,
  source: "instagram",
  medium: "paid",
  campaign: CAMP,
  content: AD,
  ...over,
});

describe("matching website traffic to Meta rows", () => {
  const m = createMatcher(
    [
      { id: CAMP, name: "Football Sep" },
      { id: "C2", name: "Anime" },
      { id: "C3", name: "Anime" },
    ],
    [{ id: AD, campaignId: CAMP, name: "Ad One" }],
  );

  it("matches by exact ids, from any source", () => {
    expect(m.assign({ source: "instagram", medium: "paid", campaign: CAMP, content: AD })).toEqual({
      campaignId: CAMP,
      adId: AD,
      by: "id",
    });
    expect(
      m.assign({ source: "other", medium: null, campaign: CAMP, content: null }),
    ).toMatchObject({
      campaignId: CAMP,
      adId: null,
    });
  });

  it("derives the campaign from the ad when only the ad id is present", () => {
    expect(
      m.assign({ source: "facebook", medium: "paid", campaign: null, content: AD }),
    ).toMatchObject({
      campaignId: CAMP,
      adId: AD,
    });
  });

  it("matches by a unique name, but only for Facebook/Instagram traffic", () => {
    expect(
      m.assign({ source: "facebook", medium: "paid", campaign: "football sep", content: null }),
    ).toEqual({
      campaignId: CAMP,
      adId: null,
      by: "name",
    });
    expect(
      m.assign({ source: "tiktok", medium: "paid", campaign: "Football Sep", content: null }),
    ).toBeNull();
  });

  it("never matches an ambiguous name", () => {
    expect(
      m.assign({ source: "instagram", medium: "paid", campaign: "Anime", content: null }),
    ).toBeNull();
  });

  it("trusts the campaign in the link when it disagrees with the ad's own campaign", () => {
    const a = m.assign({ source: "instagram", medium: "paid", campaign: "C2", content: AD });
    expect(a).toEqual({ campaignId: "C2", adId: null, by: "id" });
  });

  it("does not match unknown ids or direct traffic", () => {
    expect(
      m.assign({ source: "instagram", medium: "paid", campaign: "999", content: "888" }),
    ).toBeNull();
    expect(m.assign({ source: "direct", medium: null, campaign: null, content: null })).toBeNull();
  });
});

describe("spend, clicks and platform ratios", () => {
  it("sums days and recomputes CTR / CPC / CPM from the totals", () => {
    const r = buildMetaAdsReport(base());
    const c = r.campaigns[0];
    expect(c.platform.spend).toBe(1000);
    expect(c.platform.impressions).toBe(15_000);
    expect(c.platform.clicks).toBe(300);
    expect(c.platform.linkClicks).toBe(200);
    expect(c.platform.ctr).toBeCloseTo(2, 5);
    expect(c.platform.cpc).toBeCloseTo(1000 / 300, 5);
    expect(c.platform.cpm).toBeCloseTo(1000 / 15, 5);
    expect(c.platform.metaPurchases).toBe(6);
    expect(c.platform.metaPurchaseValue).toBe(3000);
  });

  it("builds campaign → ad set → ad", () => {
    const r = buildMetaAdsReport(base());
    expect(r.campaigns[0].name).toBe("IG | Sales | Offers");
    expect(r.campaigns[0].adsets[0].name).toBe("Egypt 18-45");
    expect(r.campaigns[0].adsets[0].ads[0]).toMatchObject({ id: AD, name: "Video ad" });
    expect(r.campaigns[0].adsets[0].platform.spend).toBe(1000);
  });

  it("keeps an ad that exists only in insights (deleted / archived)", () => {
    const r = buildMetaAdsReport(base({ campaigns: [], adsets: [], ads: [] }));
    expect(r.campaigns).toHaveLength(1);
    expect(r.campaigns[0].name).toBe(`Campaign ${CAMP}`);
    expect(r.campaigns[0].adsets[0].ads[0].name).toBe(`Ad ${AD}`);
  });
});

describe("orders, revenue, CPA and ROAS", () => {
  it("credits orders and revenue to the ad, and computes CPA and ROAS on net revenue", () => {
    const r = buildMetaAdsReport(
      base({
        sessions: [
          session({ visitorId: "v1", carted: true, checkout: true }),
          session({ visitorId: "v2" }),
        ],
        checkouts: [
          checkout({ revenue: 1000, status: "confirmed" }),
          checkout({ revenue: 1500, status: "delivered" }),
          checkout({ revenue: 800, status: "cancelled" }),
        ],
      }),
    );
    const ad = r.campaigns[0].adsets[0].ads[0];
    expect(ad.site).toMatchObject({
      sessions: 2,
      visitors: 2,
      addToCart: 1,
      checkout: 1,
      orders: 2,
      ordersAll: 3,
      cancelled: 1,
      revenueGross: 3300,
      revenueNet: 2500,
      revenueConfirmed: 2500,
      revenueDelivered: 1500,
    });
    expect(ad.cpa).toBe(500); // 1000 spend / 2 net orders
    expect(ad.roas).toBe(2.5); // 2500 / 1000
    expect(r.totals.cpa).toBe(500);
    expect(r.totals.roas).toBe(2.5);
    expect(r.campaigns[0].site.orders).toBe(2);
  });

  it("does not treat every order as delivered revenue", () => {
    const r = buildMetaAdsReport(
      base({
        checkouts: [
          checkout({ status: "processing", revenue: 700 }),
          checkout({ status: "confirmed", revenue: 300 }),
        ],
      }),
    );
    const s = r.campaigns[0].site;
    expect(s.revenueNet).toBe(1000);
    expect(s.revenueConfirmed).toBe(300);
    expect(s.revenueDelivered).toBe(0);
  });

  it("returns null, never Infinity, when spend or orders are zero", () => {
    const noSpend = buildMetaAdsReport(
      base({
        insights: [
          {
            date: "2026-09-20",
            adId: AD,
            adsetId: "S1",
            campaignId: CAMP,
            spend: 0,
            impressions: 100,
            clicks: 1,
            linkClicks: null,
            purchases: null,
            purchaseValue: null,
            currency: "EGP",
          },
        ],
        checkouts: [checkout()],
      }),
    );
    expect(noSpend.campaigns[0].roas).toBeNull();
    expect(noSpend.totals.roas).toBeNull();
    const noOrders = buildMetaAdsReport(base());
    expect(noOrders.campaigns[0].cpa).toBeNull();
    expect(noOrders.campaigns[0].roas).toBe(0);
  });

  it("counts a visitor once per ad even with several sessions", () => {
    const r = buildMetaAdsReport(
      base({ sessions: [session(), session(), session({ visitorId: "v9" })] }),
    );
    expect(r.campaigns[0].site.sessions).toBe(3);
    expect(r.campaigns[0].site.visitors).toBe(2);
  });
});

describe("attribution edge cases", () => {
  it("keeps campaign-only traffic (no ad id) on the campaign, not lost", () => {
    const r = buildMetaAdsReport(
      base({
        sessions: [session({ content: null })],
        checkouts: [checkout({ content: null, revenue: 400 })],
      }),
    );
    const c = r.campaigns[0];
    expect(c.siteWithoutAd).toMatchObject({ sessions: 1, orders: 1, revenueNet: 400 });
    expect(c.site.orders).toBe(1);
    expect(c.adsets[0].ads[0].site.orders).toBe(0);
  });

  it("reports paid Facebook/Instagram traffic that matches nothing as unmatched", () => {
    const r = buildMetaAdsReport(
      base({
        sessions: [session({ campaign: "999", content: "888" })],
        checkouts: [checkout({ campaign: "999", content: "888", revenue: 250 })],
      }),
    );
    expect(r.totals.unmatchedMeta).toMatchObject({ sessions: 1, ordersAll: 1, revenueNet: 250 });
    expect(r.totals.matched.orders).toBe(0);
  });

  it("ignores organic / direct / other-platform traffic entirely", () => {
    const r = buildMetaAdsReport(
      base({
        sessions: [
          session({ source: "direct", medium: null, campaign: null, content: null }),
          session({ source: "google", medium: "cpc", campaign: "brand", content: null }),
          session({ source: "instagram", medium: "social", campaign: null, content: null }),
        ],
        checkouts: [checkout({ source: "organic", medium: null, campaign: null, content: null })],
      }),
    );
    expect(r.totals.matched.sessions).toBe(0);
    expect(r.totals.unmatchedMeta.sessions).toBe(0);
    expect(r.totals.unmatchedMeta.ordersAll).toBe(0);
  });

  it("a checkout with no attribution at all is simply not a Meta row", () => {
    const r = buildMetaAdsReport(
      base({
        checkouts: [
          checkout({ source: "unattributed", medium: null, campaign: null, content: null }),
        ],
        storeOrders: 1,
        storeRevenueNet: 1000,
      }),
    );
    expect(r.totals.matched.orders).toBe(0);
    expect(r.totals.storeOrders).toBe(1);
    expect(r.totals.storeRevenueNet).toBe(1000);
  });

  it("a missing ad id never assigns an ad set or ad", () => {
    const r = buildMetaAdsReport(base({ checkouts: [checkout({ content: null })] }));
    expect(r.campaigns[0].adsets[0].site.orders).toBe(0);
  });

  it("first-touch model is labelled in the notes", () => {
    expect(buildMetaAdsReport(base({ model: "first" })).notes.join(" ")).toMatch(/First-touch/);
    expect(buildMetaAdsReport(base()).notes.join(" ")).not.toMatch(/First-touch/);
  });
});

describe("currency and empty data", () => {
  it("withholds CPA and ROAS when Meta reports a currency other than EGP", () => {
    const r = buildMetaAdsReport(
      base({
        insights: [
          {
            date: "2026-09-20",
            adId: AD,
            adsetId: "S1",
            campaignId: CAMP,
            spend: 10,
            impressions: 100,
            clicks: 5,
            linkClicks: null,
            purchases: null,
            purchaseValue: null,
            currency: "USD",
          },
        ],
        checkouts: [checkout()],
      }),
    );
    expect(r.currencyMismatch).toBe(true);
    expect(r.campaigns[0].roas).toBeNull();
    expect(r.campaigns[0].cpa).toBeNull();
    expect(r.totals.roas).toBeNull();
    expect(r.notes.join(" ")).toMatch(/USD/);
  });

  it("tells the admin to sync when there are no insights in the period", () => {
    const r = buildMetaAdsReport(base({ insights: [], campaigns: [], adsets: [], ads: [] }));
    expect(r.campaigns).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/Sync now/);
  });

  it("never reports reach (it cannot be summed across days)", () => {
    const r = buildMetaAdsReport(base());
    expect(JSON.stringify(r)).not.toContain('"reach"');
    expect(r.notes.join(" ")).toMatch(/Reach is not shown/);
  });
});
