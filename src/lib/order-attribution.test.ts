import { describe, expect, it } from "vitest";
import {
  ORDER_ATTRIBUTION_VERSION,
  readStoredAttribution,
  sanitizeOrderAttribution,
  withMetaIds,
} from "./order-attribution";

const NOW = new Date("2026-09-27T10:00:00.000Z");
const CAMP = "52575575055376";
const AD = "52575869248376";

const touch = (over: Record<string, unknown> = {}) => ({
  source: "instagram",
  medium: "paid",
  campaign: CAMP,
  content: AD,
  term: null,
  ...over,
});

describe("sanitizeOrderAttribution", () => {
  it("keeps first/last touch, derives the Meta ids from the ad link and stamps the SERVER time", () => {
    const out = sanitizeOrderAttribution(
      {
        v: 1,
        first: touch({ source: "ig" }),
        last: touch(),
        fbclid: "AbCdEfGh12345678",
        recorded_at: "1999-01-01",
      },
      NOW,
    );
    expect(out).toEqual({
      v: ORDER_ATTRIBUTION_VERSION,
      recorded_at: "2026-09-27T10:00:00.000Z", // never the browser's value
      first: {
        source: "instagram",
        medium: "paid",
        campaign: CAMP,
        content: AD,
        term: null,
        meta_campaign_id: CAMP,
        meta_ad_id: AD,
      },
      last: {
        source: "instagram",
        medium: "paid",
        campaign: CAMP,
        content: AD,
        term: null,
        meta_campaign_id: CAMP,
        meta_ad_id: AD,
      },
      fbclid: "AbCdEfGh12345678",
      ids_source: "utm",
    });
  });

  it("does not invent Meta ids: only Facebook/Instagram touches with all-digit campaign/content", () => {
    expect(
      withMetaIds({ source: "tiktok", medium: "paid", campaign: CAMP, content: AD, term: null }),
    ).not.toHaveProperty("meta_campaign_id");
    expect(
      withMetaIds({
        source: "instagram",
        medium: "paid",
        campaign: "football_sep",
        content: "video 1",
        term: null,
      }),
    ).not.toHaveProperty("meta_ad_id");
    expect(
      withMetaIds({
        source: "facebook",
        medium: "paid",
        campaign: "123",
        content: null,
        term: null,
      }),
    ).not.toHaveProperty("meta_campaign_id"); // too short to be a Meta id
    expect(
      withMetaIds({
        source: "facebook",
        medium: "paid",
        campaign: CAMP,
        content: null,
        term: null,
      }),
    ).toMatchObject({ meta_campaign_id: CAMP });
    expect(
      withMetaIds({
        source: "facebook",
        medium: "paid",
        campaign: CAMP,
        content: null,
        term: null,
      }),
    ).not.toHaveProperty("meta_ad_id");
  });

  it("never records an ad set id (it is not in the link)", () => {
    const out = sanitizeOrderAttribution(
      { v: 1, first: touch(), last: touch(), adset_id: "9" },
      NOW,
    );
    expect(JSON.stringify(out)).not.toMatch(/adset/);
  });

  it("drops junk: non-objects, unknown keys, bad click ids, control characters, oversize text", () => {
    expect(sanitizeOrderAttribution(undefined, NOW)).toBeUndefined();
    expect(sanitizeOrderAttribution("x", NOW)).toBeUndefined();
    expect(sanitizeOrderAttribution({ first: null, last: null }, NOW)).toBeUndefined();
    const out = sanitizeOrderAttribution(
      {
        first: touch({ campaign: `a\u0000b${"x".repeat(500)}`, evil: "<script>" }),
        last: null,
        fbclid: "bad clid!",
        phone: "01012345678",
      },
      NOW,
    )!;
    expect(out.first!.campaign!.length).toBeLessThanOrEqual(120);
    expect(out.first!.campaign).not.toContain("\u0000");
    expect(out).not.toHaveProperty("fbclid");
    expect(JSON.stringify(out)).not.toMatch(/evil|script|phone|01012345678/);
  });

  it("normalises the source into the site's one taxonomy", () => {
    const out = sanitizeOrderAttribution(
      { first: touch({ source: "IG" }), last: touch({ source: "meta" }) },
      NOW,
    )!;
    expect(out.first!.source).toBe("instagram");
    expect(out.last!.source).toBe("facebook");
    expect(
      sanitizeOrderAttribution({ first: touch({ source: "weird-thing" }), last: null }, NOW)!.first!
        .source,
    ).toBe("other");
  });

  it("first touch only (direct last touch) is still a valid snapshot", () => {
    const out = sanitizeOrderAttribution({ first: touch(), last: null }, NOW)!;
    expect(out.last).toBeNull();
    expect(out.first!.meta_ad_id).toBe(AD);
  });
});

describe("readStoredAttribution (what the database gives back)", () => {
  it("round-trips a stored snapshot", () => {
    const stored = sanitizeOrderAttribution(
      { first: touch(), last: touch({ source: "facebook" }) },
      NOW,
    )!;
    expect(readStoredAttribution(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it("returns null for anything else — legacy rows, other versions, garbage", () => {
    for (const bad of [
      null,
      undefined,
      {},
      "x",
      5,
      { v: 2, first: touch() },
      { v: 1 },
      { v: 1, first: null, last: null },
    ])
      expect(readStoredAttribution(bad)).toBeNull();
  });

  it("re-validates on read (a tampered row cannot smuggle keys or ids for other sources)", () => {
    const r = readStoredAttribution({
      v: 1,
      recorded_at: "2026-09-27T10:00:00Z",
      first: {
        source: "tiktok",
        medium: "paid",
        campaign: CAMP,
        content: AD,
        meta_ad_id: "999999999",
        extra: "x",
      },
      last: null,
    })!;
    expect(r.first).not.toHaveProperty("meta_ad_id");
    expect(JSON.stringify(r)).not.toContain("extra");
  });
});
