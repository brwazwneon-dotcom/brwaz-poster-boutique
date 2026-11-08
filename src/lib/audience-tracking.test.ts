// @vitest-environment jsdom
// The audience (youth / album) travels with the visitor: into the order's stored attribution and into Meta events.
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ allowed: true }));
vi.mock("./meta-capi.functions", () => ({
  sendCapiEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("./ga4", () => ({ gaEvent: vi.fn() }));
vi.mock("./tiktok-browser", () => ({ trackTikTok: vi.fn() }));
vi.mock("./preview-mode", () => ({ isPreviewMode: () => false }));
vi.mock("./analytics", () => ({ visitorId: () => "visitor-1", sessionId: () => "session-1" }));
vi.mock("./analytics-env", async (orig) => ({
  ...(await orig<typeof import("./analytics-env")>()),
  clientTrackingAllowed: () => env.allowed,
}));
vi.mock("./analytics-events", () => ({
  emitAnalyticsEvent: vi.fn(),
  dispatchInternalOnly: () => false,
}));
// The older first-visit store (landing-pages.ts) is real here: the two must not contradict each other.
vi.mock("./landing-pages", async () => {
  const KEY = "brw-audience";
  return {
    getAudienceAttribution: () => {
      const raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    },
  };
});

import { _resetAttributionForTests, getOrderAttributionSnapshot } from "./attribution";
import { readStoredAttribution, sanitizeOrderAttribution } from "./order-attribution";
import { recordAudience } from "./audience";

const touch = {
  source: "facebook",
  medium: "paid_social",
  campaign: "120211234567890",
  content: "23851234567890",
  term: null,
};
const NOW = new Date("2026-11-08T10:00:00Z");

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
  _resetAttributionForTests();
  env.allowed = true;
  // meta-pixel.ts puts its script before the first script tag of the page, and keeps one pixel per window.
  document.head.innerHTML = "<script></script>";
  for (const k of ["fbq", "_fbq", "__brwz_pixel_loaded", "__brwz_pixel_id"])
    delete (window as unknown as Record<string, unknown>)[k];
});

describe("the order's stored attribution carries the audience", () => {
  it("the browser snapshot has an audience only when the visitor came through a campaign", () => {
    expect(getOrderAttributionSnapshot()).not.toHaveProperty("audience");
    recordAudience(Date.now(), { pathname: "/", search: "?aud=youth" });
    expect(getOrderAttributionSnapshot().audience).toEqual({ first: "youth", last: "youth" });
  });

  it("the server keeps the two known values and drops anything else", () => {
    const stored = sanitizeOrderAttribution(
      { v: 1, first: touch, last: touch, audience: { first: "youth", last: "ALBUM" } },
      NOW,
    );
    expect(stored?.audience).toEqual({ first: "youth", last: "album" });
    const junk = sanitizeOrderAttribution(
      { v: 1, first: touch, last: touch, audience: { first: "hacker", last: { x: 1 } } },
      NOW,
    );
    expect(junk).not.toHaveProperty("audience");
    expect(
      sanitizeOrderAttribution({ v: 1, first: touch, last: touch, audience: "youth" }, NOW),
    ).not.toHaveProperty("audience");
  });

  it("one audience is enough, and an order without an audience is unchanged", () => {
    expect(
      sanitizeOrderAttribution(
        { v: 1, first: touch, last: touch, audience: { last: "album" } },
        NOW,
      )?.audience,
    ).toEqual({ first: null, last: "album" });
    const plain = sanitizeOrderAttribution({ v: 1, first: touch, last: touch }, NOW);
    expect(plain).not.toHaveProperty("audience");
    expect(plain?.first?.meta_campaign_id).toBe("120211234567890"); // existing behaviour is untouched
  });

  it("reads back from the database the same way", () => {
    const stored = sanitizeOrderAttribution(
      { v: 1, first: touch, last: touch, audience: { first: "youth", last: "album" } },
      NOW,
    );
    expect(readStoredAttribution(JSON.parse(JSON.stringify(stored)))?.audience).toEqual({
      first: "youth",
      last: "album",
    });
    expect(readStoredAttribution({ v: 1, first: touch, last: touch })).not.toHaveProperty(
      "audience",
    );
  });
});

describe("Meta events carry the audience", () => {
  async function fire(path: string, search: string, name = "photo_page_view") {
    window.history.pushState({}, "", `${path}${search}`);
    vi.resetModules();
    const m = await import("./meta-pixel");
    const fbq = vi.fn();
    m.setMarketingConfig({
      ready: true,
      pixelId: "4466074806960925",
      pixelEnabled: true,
      capiEnabled: false,
      advancedMatchingEnabled: false,
      ga4MeasurementId: "",
      ga4Enabled: false,
    } as never);
    (window as unknown as { fbq: unknown }).fbq = fbq;
    m.trackCustom(name as never, { content_name: "x" });
    return fbq.mock.calls.find((c) => c[0] === "trackCustom");
  }

  it("the first event of an ad click already has the audience (nothing else had to run first)", async () => {
    const call = await fire("/photo-printing", "?aud=album&utm_source=facebook");
    expect(call?.[2]).toMatchObject({ audience_type: "album" });
  });

  it("a later page of the same visit keeps it", async () => {
    await fire("/landing/youth", "");
    const call = await fire("/cart", "");
    expect(call?.[2]).toMatchObject({ audience_type: "youth" });
  });

  it("when the visitor comes back through the other campaign, events follow the most recent one", async () => {
    await fire("/", "?aud=youth");
    const call = await fire("/", "?aud=album");
    expect(call?.[2]).toMatchObject({ audience_type: "album" });
  });

  it("an untagged visitor's events have no audience", async () => {
    const call = await fire("/", "");
    expect(call?.[2]).not.toHaveProperty("audience_type");
  });

  it("the older landing store never contradicts the audience: its landing page is dropped when it is another audience's", async () => {
    window.localStorage.setItem(
      "brw-audience",
      JSON.stringify({
        audience_type: "youth",
        landing_page: "/landing/youth",
        utm_campaign: "c1",
      }),
    );
    const call = await fire("/", "?aud=album");
    expect(call?.[2]).toMatchObject({ audience_type: "album" });
    expect(call?.[2]).not.toHaveProperty("landing_page");
  });

  it("the older store still works on its own (a visitor from before this change)", async () => {
    window.localStorage.setItem(
      "brw-audience",
      JSON.stringify({
        audience_type: "movies",
        landing_page: "/landing/movies",
        utm_campaign: "movies_ads",
      }),
    );
    const call = await fire("/", "");
    expect(call?.[2]).toMatchObject({
      audience_type: "movies",
      landing_page: "/landing/movies",
      utm_campaign: "movies_ads",
    });
  });

  it("nothing is sent from a host that is not the production site", async () => {
    env.allowed = false;
    expect(await fire("/", "?aud=youth")).toBeUndefined();
  });
});
