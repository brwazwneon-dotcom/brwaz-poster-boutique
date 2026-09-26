// Joins Meta's own numbers (spend, impressions, clicks…) with what the website
// measured (sessions, add to cart, checkout, orders, revenue) per campaign,
// ad set and ad. Pure functions only — no database, no network — so every
// rule below is unit-tested.
//
// How website rows tie to Meta rows (never guessed):
//   1. utm_content = the ad's id, utm_campaign = the campaign's id  (exact id match)
//   2. otherwise a UNIQUE, case-insensitive name match — and only for traffic
//      that is itself tagged Facebook / Instagram
//   3. otherwise the row stays visible as "unmatched Meta traffic" (if it is
//      paid Facebook/Instagram) or is simply not a Meta row.
// The ad set is not in the URL; it is read from the ad's own record.
import type {
  MetaAdRow,
  MetaAdsReport,
  MetaAdsetRow,
  MetaCampaignRow,
  PlatformMetrics,
  SiteMetrics,
} from "@/lib/meta-ads.types";
import type { PeriodInfo, TouchModel } from "@/lib/analytics-center.types";

export type InsightInput = {
  date: string;
  adId: string;
  adsetId: string | null;
  campaignId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  currency: string | null;
};
export type CampaignInput = {
  id: string;
  name: string | null;
  status: string | null;
  objective: string | null;
};
export type AdsetInput = {
  id: string;
  campaignId: string | null;
  name: string | null;
  status: string | null;
};
export type AdInput = {
  id: string;
  adsetId: string | null;
  campaignId: string | null;
  name: string | null;
  status: string | null;
};
export type SiteSessionInput = {
  visitorId: string | null;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  carted: boolean;
  checkout: boolean;
};
export type SiteCheckoutInput = {
  status: string;
  revenue: number;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
};

const PAID_MEDIUM = /paid|cpc|ppc|cpm|display|ads?$|sponsored/i;
const META_SOURCES = new Set(["facebook", "instagram"]);
const CANCELLED = new Set(["cancelled", "returned"]);
const CONFIRMED = new Set(["confirmed", "shipped", "delivered"]);

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const nameKey = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export type Assignment = {
  campaignId: string | null;
  adId: string | null;
  by: "id" | "name";
};

export type Matcher = {
  assign(t: {
    source: string;
    medium: string | null;
    campaign: string | null;
    content: string | null;
  }): Assignment | null;
  isPaidMeta(t: { source: string; medium: string | null }): boolean;
};

export function createMatcher(
  campaigns: Array<{ id: string; name: string | null }>,
  ads: Array<{ id: string; campaignId: string | null; name: string | null }>,
): Matcher {
  const campById = new Map(campaigns.map((c) => [c.id, c]));
  const adById = new Map(ads.map((a) => [a.id, a]));
  const uniqueByName = <T extends { id: string; name: string | null }>(list: T[]) => {
    const seen = new Map<string, T | null>();
    for (const x of list) {
      const k = nameKey(x.name);
      if (!k) continue;
      seen.set(k, seen.has(k) ? null : x); // a repeated name is ambiguous: match nothing
    }
    return seen;
  };
  const campByName = uniqueByName(campaigns);
  const adByName = uniqueByName(ads);
  const isPaidMeta = (t: { source: string; medium: string | null }) =>
    META_SOURCES.has(t.source) && !!t.medium && PAID_MEDIUM.test(t.medium);

  return {
    isPaidMeta,
    assign(t) {
      const camp = (t.campaign ?? "").trim();
      const content = (t.content ?? "").trim();
      const fromMeta = META_SOURCES.has(t.source);

      let campaignId: string | null = null;
      let adId: string | null = null;
      let by: "id" | "name" = "id";

      if (camp && campById.has(camp)) campaignId = camp;
      else if (camp && fromMeta) {
        const hit = campByName.get(nameKey(camp));
        if (hit) {
          campaignId = hit.id;
          by = "name";
        }
      }
      if (content && adById.has(content)) adId = content;
      else if (content && fromMeta) {
        const hit = adByName.get(nameKey(content));
        if (hit) {
          adId = hit.id;
          by = by === "id" && campaignId ? by : "name";
        }
      }
      if (adId) {
        const owner = adById.get(adId)?.campaignId ?? null;
        // The campaign in the URL wins if it disagrees with the ad's own campaign:
        // the ad id alone is then not trustworthy for this visit.
        if (campaignId && owner && owner !== campaignId) adId = null;
        else if (!campaignId) campaignId = owner;
      }
      return campaignId || adId ? { campaignId, adId, by } : null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Accumulators                                                        */
/* ------------------------------------------------------------------ */

type SiteAcc = {
  visitors: Set<string>;
  sessions: number;
  addToCart: number;
  checkout: number;
  orders: number;
  ordersAll: number;
  cancelled: number;
  revenueGross: number;
  revenueNet: number;
  revenueConfirmed: number;
  revenueDelivered: number;
};
const newSite = (): SiteAcc => ({
  visitors: new Set(),
  sessions: 0,
  addToCart: 0,
  checkout: 0,
  orders: 0,
  ordersAll: 0,
  cancelled: 0,
  revenueGross: 0,
  revenueNet: 0,
  revenueConfirmed: 0,
  revenueDelivered: 0,
});
const mergeSite = (into: SiteAcc, from: SiteAcc) => {
  for (const v of from.visitors) into.visitors.add(v);
  into.sessions += from.sessions;
  into.addToCart += from.addToCart;
  into.checkout += from.checkout;
  into.orders += from.orders;
  into.ordersAll += from.ordersAll;
  into.cancelled += from.cancelled;
  into.revenueGross += from.revenueGross;
  into.revenueNet += from.revenueNet;
  into.revenueConfirmed += from.revenueConfirmed;
  into.revenueDelivered += from.revenueDelivered;
};
const finishSite = (a: SiteAcc): SiteMetrics => ({
  sessions: a.sessions,
  visitors: a.visitors.size,
  addToCart: a.addToCart,
  checkout: a.checkout,
  orders: a.orders,
  ordersAll: a.ordersAll,
  cancelled: a.cancelled,
  revenueGross: a.revenueGross,
  revenueNet: a.revenueNet,
  revenueConfirmed: a.revenueConfirmed,
  revenueDelivered: a.revenueDelivered,
});
const hasSite = (a: SiteAcc) => a.sessions > 0 || a.ordersAll > 0;

function addSession(a: SiteAcc, s: SiteSessionInput) {
  if (s.visitorId) a.visitors.add(s.visitorId);
  a.sessions += 1;
  if (s.carted) a.addToCart += 1;
  if (s.checkout) a.checkout += 1;
}
function addCheckout(a: SiteAcc, c: SiteCheckoutInput) {
  const status = c.status.trim().toLowerCase();
  const cancelled = CANCELLED.has(status);
  a.ordersAll += 1;
  a.revenueGross += c.revenue;
  if (cancelled) {
    a.cancelled += 1;
    return;
  }
  a.orders += 1;
  a.revenueNet += c.revenue;
  if (CONFIRMED.has(status)) a.revenueConfirmed += c.revenue;
  if (status === "delivered") a.revenueDelivered += c.revenue;
}

type PlatAcc = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  purchases: number | null;
  purchaseValue: number | null;
};
const newPlat = (): PlatAcc => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: null,
  purchases: null,
  purchaseValue: null,
});
const addNullable = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
const addPlat = (
  a: PlatAcc,
  i: Pick<
    InsightInput,
    "spend" | "impressions" | "clicks" | "linkClicks" | "purchases" | "purchaseValue"
  >,
) => {
  a.spend += i.spend;
  a.impressions += i.impressions;
  a.clicks += i.clicks;
  a.linkClicks = addNullable(a.linkClicks, i.linkClicks);
  a.purchases = addNullable(a.purchases, i.purchases);
  a.purchaseValue = addNullable(a.purchaseValue, i.purchaseValue);
};
const mergePlat = (into: PlatAcc, from: PlatAcc) => addPlat(into, from);
const finishPlat = (a: PlatAcc): PlatformMetrics => ({
  spend: a.spend,
  impressions: a.impressions,
  clicks: a.clicks,
  linkClicks: a.linkClicks,
  ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
  cpc: div(a.spend, a.clicks),
  cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
  metaPurchases: a.purchases,
  metaPurchaseValue: a.purchaseValue,
});
const hasPlat = (a: PlatAcc) => a.spend > 0 || a.impressions > 0 || a.clicks > 0;

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export type ReportInput = {
  period: PeriodInfo;
  model: TouchModel;
  insights: InsightInput[];
  campaigns: CampaignInput[];
  adsets: AdsetInput[];
  ads: AdInput[];
  sessions: SiteSessionInput[];
  checkouts: SiteCheckoutInput[];
  storeOrders: number;
  storeRevenueNet: number;
  dataThrough: string | null;
};

const displayName = (name: string | null | undefined, id: string, kind: string) =>
  name && name.trim() ? name : `${kind} ${id}`;

export function buildMetaAdsReport(input: ReportInput): MetaAdsReport {
  const campaigns = new Map<string, CampaignInput>(input.campaigns.map((c) => [c.id, c]));
  const adsets = new Map<string, AdsetInput>(input.adsets.map((s) => [s.id, s]));
  const ads = new Map<string, AdInput>(input.ads.map((a) => [a.id, a]));

  // Ads seen only in insights (deleted / archived) still need a row.
  for (const i of input.insights) {
    if (i.campaignId && !campaigns.has(i.campaignId))
      campaigns.set(i.campaignId, { id: i.campaignId, name: null, status: null, objective: null });
    if (i.adsetId && !adsets.has(i.adsetId))
      adsets.set(i.adsetId, { id: i.adsetId, campaignId: i.campaignId, name: null, status: null });
    if (!ads.has(i.adId))
      ads.set(i.adId, {
        id: i.adId,
        adsetId: i.adsetId,
        campaignId: i.campaignId,
        name: null,
        status: null,
      });
  }

  const matcher = createMatcher([...campaigns.values()], [...ads.values()]);
  const currencies = new Set(input.insights.map((i) => i.currency).filter(Boolean) as string[]);
  const currencyMismatch = [...currencies].some((c) => c !== "EGP");
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const ratiosAllowed = !currencyMismatch;

  // Platform numbers per ad.
  const platByAd = new Map<string, PlatAcc>();
  for (const i of input.insights) {
    const acc = platByAd.get(i.adId) ?? newPlat();
    platByAd.set(i.adId, acc);
    addPlat(acc, i);
  }

  // Site numbers.
  const siteByAd = new Map<string, SiteAcc>();
  const siteCampaignOnly = new Map<string, SiteAcc>();
  const unmatched = newSite();
  const matching = { byId: 0, byName: 0 };
  const bucket = (a: Assignment): SiteAcc => {
    if (a.by === "id") matching.byId += 1;
    else matching.byName += 1;
    if (a.adId) {
      const acc = siteByAd.get(a.adId) ?? newSite();
      siteByAd.set(a.adId, acc);
      return acc;
    }
    const cid = a.campaignId!;
    const acc = siteCampaignOnly.get(cid) ?? newSite();
    siteCampaignOnly.set(cid, acc);
    return acc;
  };
  for (const s of input.sessions) {
    const a = matcher.assign(s);
    if (a) addSession(bucket(a), s);
    else if (matcher.isPaidMeta(s)) addSession(unmatched, s);
  }
  for (const c of input.checkouts) {
    const a = matcher.assign(c);
    if (a) addCheckout(bucket(a), c);
    else if (matcher.isPaidMeta(c)) addCheckout(unmatched, c);
  }

  // Assemble campaign → ad set → ad.
  const adsetOfAd = (a: AdInput) => a.adsetId ?? "";
  type AdsetBuild = {
    id: string;
    plat: PlatAcc;
    site: SiteAcc;
    ads: MetaAdRow[];
  };
  type CampBuild = {
    id: string;
    plat: PlatAcc;
    site: SiteAcc;
    without: SiteAcc;
    adsets: Map<string, AdsetBuild>;
  };
  const camps = new Map<string, CampBuild>();
  const campOf = (id: string): CampBuild => {
    let c = camps.get(id);
    if (!c) {
      c = { id, plat: newPlat(), site: newSite(), without: newSite(), adsets: new Map() };
      camps.set(id, c);
    }
    return c;
  };

  const rowBase = (
    id: string,
    name: string,
    status: string | null,
    plat: PlatAcc,
    site: SiteAcc,
  ) => {
    const p = finishPlat(plat);
    const s = finishSite(site);
    return {
      id,
      name,
      status,
      platform: p,
      site: s,
      cpa: ratiosAllowed ? div(p.spend, s.orders) : null,
      roas: ratiosAllowed ? div(s.revenueNet, p.spend) : null,
    };
  };

  for (const ad of ads.values()) {
    const plat = platByAd.get(ad.id) ?? newPlat();
    const site = siteByAd.get(ad.id) ?? newSite();
    if (!hasPlat(plat) && !hasSite(site)) continue;
    const campaignId = ad.campaignId ?? "";
    const camp = campOf(campaignId);
    const setId = adsetOfAd(ad);
    let set = camp.adsets.get(setId);
    if (!set) {
      set = { id: setId, plat: newPlat(), site: newSite(), ads: [] };
      camp.adsets.set(setId, set);
    }
    mergePlat(set.plat, {
      ...plat,
      linkClicks: plat.linkClicks,
      purchases: plat.purchases,
      purchaseValue: plat.purchaseValue,
    });
    mergeSite(set.site, site);
    set.ads.push({
      ...rowBase(ad.id, displayName(ad.name, ad.id, "Ad"), ad.status, plat, site),
      adsetId: ad.adsetId,
      campaignId: ad.campaignId,
    });
  }
  for (const [cid, site] of siteCampaignOnly) {
    const camp = campOf(cid);
    mergeSite(camp.without, site);
  }

  const campaignRows: MetaCampaignRow[] = [];
  for (const camp of camps.values()) {
    const meta = campaigns.get(camp.id);
    const setRows: MetaAdsetRow[] = [];
    for (const set of camp.adsets.values()) {
      const sMeta = adsets.get(set.id);
      set.ads.sort((a, b) => b.platform.spend - a.platform.spend || b.site.orders - a.site.orders);
      mergePlat(camp.plat, {
        spend: set.plat.spend,
        impressions: set.plat.impressions,
        clicks: set.plat.clicks,
        linkClicks: set.plat.linkClicks,
        purchases: set.plat.purchases,
        purchaseValue: set.plat.purchaseValue,
      });
      mergeSite(camp.site, set.site);
      setRows.push({
        ...rowBase(
          set.id,
          set.id ? displayName(sMeta?.name, set.id, "Ad set") : "(ad set unknown)",
          sMeta?.status ?? null,
          set.plat,
          set.site,
        ),
        campaignId: sMeta?.campaignId ?? (camp.id || null),
        ads: set.ads,
      });
    }
    setRows.sort((a, b) => b.platform.spend - a.platform.spend || b.site.orders - a.site.orders);
    mergeSite(camp.site, camp.without);
    if (!hasPlat(camp.plat) && !hasSite(camp.site)) continue;
    campaignRows.push({
      ...rowBase(
        camp.id,
        camp.id ? displayName(meta?.name, camp.id, "Campaign") : "(campaign unknown)",
        meta?.status ?? null,
        camp.plat,
        camp.site,
      ),
      objective: meta?.objective ?? null,
      adsets: setRows,
      siteWithoutAd: finishSite(camp.without),
    });
  }
  campaignRows.sort((a, b) => b.platform.spend - a.platform.spend || b.site.orders - a.site.orders);

  const totalPlat = newPlat();
  const totalMatched = newSite();
  for (const c of camps.values()) {
    mergePlat(totalPlat, c.plat);
    mergeSite(totalMatched, c.site);
  }
  const tp = finishPlat(totalPlat);
  const tm = finishSite(totalMatched);

  const notes: string[] = [
    "Meta's spend, impressions and clicks are in the ad account's own calendar day and currency; website figures are in Cairo time. A day at the edge of a range can differ slightly.",
    "Reach is not shown: it cannot be added across days without double counting people.",
    "CPA and ROAS use website orders excluding cancelled/returned. “Meta purchases” is what Meta itself counts and is shown beside, never mixed in.",
  ];
  if (currencyMismatch)
    notes.push(
      `Meta reports spend in ${[...currencies].join(", ")}, not EGP: CPA and ROAS are withheld.`,
    );
  if (input.insights.length === 0)
    notes.push("No synced Meta insights fall inside this period. Run “Sync now” to load them.");
  if (input.model === "first")
    notes.push(
      "First-touch view: orders are credited to the campaign that first brought the visitor, not the one that closed the sale.",
    );

  return {
    period: input.period,
    model: input.model,
    currency,
    currencyMismatch,
    totals: {
      platform: tp,
      matched: tm,
      unmatchedMeta: finishSite(unmatched),
      storeOrders: input.storeOrders,
      storeRevenueNet: input.storeRevenueNet,
      cpa: ratiosAllowed ? div(tp.spend, tm.orders) : null,
      roas: ratiosAllowed ? div(tm.revenueNet, tp.spend) : null,
    },
    campaigns: campaignRows,
    matching,
    dataThrough: input.dataThrough,
    notes,
  };
}
