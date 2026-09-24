// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetAttributionForTests,
  captureAttribution,
  classifyTouch,
  getAttribution,
  normalizeSource,
  toAttributionFields,
} from "./attribution";

describe("normalizeSource — one taxonomy everywhere", () => {
  it.each([
    ["ig", "instagram"],
    ["instagram", "instagram"],
    ["l.instagram.com", "instagram"],
    ["Instagram_Stories", "instagram"],
    ["fb", "facebook"],
    ["facebook", "facebook"],
    ["m.facebook.com", "facebook"],
    ["meta", "facebook"],
    ["tiktok", "tiktok"],
    ["tt", "tiktok"],
    ["google", "google"],
    ["googleads", "google"],
    ["bing", "organic"],
    ["duckduckgo.com", "organic"],
    ["organic", "organic"],
    ["direct", "direct"],
    ["(direct)", "direct"],
    ["whatsapp", "referral"],
    ["wa.me", "referral"],
    ["l.wl.co", "referral"],
    ["chatgpt.com", "referral"],
    ["twitter", "referral"],
    ["newsletter", "other"],
    ["other", "other"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeSource(raw)).toBe(expected);
  });

  it("returns null for empty input so 'no value' is not confused with 'other'", () => {
    expect(normalizeSource("")).toBeNull();
    expect(normalizeSource("   ")).toBeNull();
    expect(normalizeSource(null)).toBeNull();
    expect(normalizeSource(undefined)).toBeNull();
  });

  it("visits and orders can never disagree: ig and instagram normalize identically", () => {
    expect(normalizeSource("ig")).toBe(normalizeSource("instagram"));
  });
});

describe("classifyTouch", () => {
  const host = "brwazwneon.com";
  it("reads the full UTM set", () => {
    const t = classifyTouch({
      search:
        "?utm_source=instagram&utm_medium=Paid_Social&utm_campaign=test_campaign&utm_content=reel1&utm_term=posters",
      referrer: "",
      hostname: host,
    });
    expect(t).toEqual({
      source: "instagram",
      medium: "paid_social",
      campaign: "test_campaign",
      content: "reel1",
      term: "posters",
    });
  });
  it("normalizes utm_source=ig", () => {
    expect(
      classifyTouch({ search: "?utm_source=ig&utm_medium=paid", referrer: "", hostname: host })
        ?.source,
    ).toBe("instagram");
  });
  it("an internal navigation is not a touch", () => {
    expect(
      classifyTouch({
        search: "",
        referrer: "https://www.brwazwneon.com/category/movies",
        hostname: host,
      }),
    ).toBeNull();
    expect(
      classifyTouch({ search: "", referrer: "http://localhost:8080/", hostname: "localhost" }),
    ).toBeNull();
  });
  it("no referrer is direct", () => {
    expect(classifyTouch({ search: "", referrer: "", hostname: host })?.source).toBe("direct");
  });
  it("social referrers", () => {
    expect(
      classifyTouch({ search: "", referrer: "https://l.instagram.com/?u=x", hostname: host }),
    ).toMatchObject({ source: "instagram", medium: "social" });
    expect(
      classifyTouch({ search: "", referrer: "https://l.facebook.com/", hostname: host }),
    ).toMatchObject({ source: "facebook", medium: "social" });
  });
  it("search engines are organic, unknown hosts are referral", () => {
    expect(
      classifyTouch({ search: "", referrer: "https://www.google.com/", hostname: host }),
    ).toMatchObject({ source: "organic", medium: "organic" });
    expect(
      classifyTouch({ search: "", referrer: "https://some-blog.example/post", hostname: host }),
    ).toMatchObject({ source: "referral", medium: "referral" });
  });
  it("click ids identify the platform when UTMs are stripped", () => {
    expect(classifyTouch({ search: "?gclid=abc", referrer: "", hostname: host })?.source).toBe(
      "google",
    );
    expect(classifyTouch({ search: "?ttclid=abc", referrer: "", hostname: host })?.source).toBe(
      "tiktok",
    );
    expect(classifyTouch({ search: "?fbclid=abc", referrer: "", hostname: host })?.source).toBe(
      "facebook",
    );
    expect(
      classifyTouch({ search: "?fbclid=abc", referrer: "https://l.instagram.com/", hostname: host })
        ?.source,
    ).toBe("instagram");
  });
  it("utm google with an organic medium is organic, not google ads", () => {
    expect(
      classifyTouch({
        search: "?utm_source=google&utm_medium=organic",
        referrer: "",
        hostname: host,
      })?.source,
    ).toBe("organic");
  });
  it("an unknown utm_source is 'other' (never guessed)", () => {
    expect(
      classifyTouch({ search: "?utm_source=mailerlite", referrer: "", hostname: host })?.source,
    ).toBe("other");
  });
});

function visit(opts: { search?: string; referrer?: string; newSession?: boolean; now?: number }) {
  if (opts.newSession) {
    window.sessionStorage.clear();
    _resetAttributionForTests();
  }
  window.history.pushState({}, "", `/${opts.search ?? ""}`);
  Object.defineProperty(document, "referrer", { value: opts.referrer ?? "", configurable: true });
  return captureAttribution(opts.now);
}

describe("first touch / last touch through the funnel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    _resetAttributionForTests();
  });

  it("stores the UTM landing as both first and last touch", () => {
    const a = visit({
      search: "?utm_source=instagram&utm_medium=paid_social&utm_campaign=test_campaign",
    });
    expect(a.first).toMatchObject({
      source: "instagram",
      medium: "paid_social",
      campaign: "test_campaign",
    });
    expect(a.last).toMatchObject({ source: "instagram", campaign: "test_campaign" });
  });

  it("attribution survives in-site navigation with no query string", () => {
    visit({ search: "?utm_source=instagram&utm_medium=paid_social&utm_campaign=test_campaign" });
    // SPA navigation: URL loses the UTMs, document.referrer is unchanged.
    const a = visit({ referrer: "" });
    expect(a.last).toMatchObject({ source: "instagram", campaign: "test_campaign" });
    expect(getAttribution().first).toMatchObject({ source: "instagram" });
  });

  it("a later campaign changes LAST touch only — first touch is preserved", () => {
    visit({ search: "?utm_source=instagram&utm_campaign=first_campaign" });
    const a = visit({
      newSession: true,
      search: "?utm_source=tiktok&utm_medium=paid&utm_campaign=second",
    });
    expect(a.first).toMatchObject({ source: "instagram", campaign: "first_campaign" });
    expect(a.last).toMatchObject({ source: "tiktok", campaign: "second" });
  });

  it("a direct return visit does not overwrite the last real touch", () => {
    visit({ search: "?utm_source=instagram&utm_campaign=c1" });
    const a = visit({ newSession: true, referrer: "" });
    expect(a.last).toMatchObject({ source: "instagram", campaign: "c1" });
  });

  it("an internal referrer never creates or changes a touch", () => {
    const a = visit({ referrer: "https://brwazwneon.com/" });
    expect(a.first).toBeNull();
    expect(a.last).toBeNull();
  });

  it("a new tab from a social referrer becomes the last touch", () => {
    visit({ search: "?utm_source=instagram" });
    const a = visit({ newSession: true, referrer: "https://l.facebook.com/" });
    expect(a.last).toMatchObject({ source: "facebook", medium: "social" });
    expect(a.first?.source).toBe("instagram");
  });

  it("expired touches are dropped (last touch after 30 days)", () => {
    const t0 = Date.now();
    visit({ search: "?utm_source=instagram", now: t0 });
    const later = t0 + 31 * 86_400_000;
    const a = visit({ newSession: true, referrer: "", now: later });
    expect(a.last).toMatchObject({ source: "direct" });
    expect(a.first).toMatchObject({ source: "instagram" });
  });

  it("flattens to the analytics columns", () => {
    const a = visit({
      search:
        "?utm_source=instagram&utm_medium=paid_social&utm_campaign=c&utm_content=x&utm_term=y",
    });
    expect(toAttributionFields(a)).toMatchObject({
      first_source: "instagram",
      first_medium: "paid_social",
      first_campaign: "c",
      first_content: "x",
      first_term: "y",
      last_source: "instagram",
    });
  });
});
