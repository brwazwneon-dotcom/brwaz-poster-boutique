// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetAttributionForTests,
  captureAttribution,
  classifyTouch,
  getAttribution,
  getMetaIdentifiers,
  getOrderAttributionSnapshot,
  normalizeSource,
  toAttributionFields,
  toOrderUtm,
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

describe("Meta click id (fbclid → fbc) lives in the canonical store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    _resetAttributionForTests();
  });

  it("captures fbclid from the landing URL into the SAME record as first/last touch", () => {
    visit({ search: "?fbclid=AbCdEf123456&utm_source=instagram&utm_medium=paid_social" });
    const stored = JSON.parse(window.localStorage.getItem("brw-attribution-v1")!);
    expect(stored.clickIds.fbclid).toBe("AbCdEf123456");
    expect(stored.first.source).toBe("instagram");
    expect(Object.keys(window.localStorage).filter((k) => k.includes("click"))).toEqual([]);
  });

  it("builds fbc in Meta's documented format when no _fbc cookie exists", () => {
    const t0 = 1_790_000_000_000;
    visit({ search: "?fbclid=AbCdEf123456", now: t0 });
    expect(getMetaIdentifiers(t0 + 1000).fbc).toBe(`fb.1.${t0}.AbCdEf123456`);
  });

  it("prefers the cookies the Pixel wrote itself (_fbp and _fbc)", () => {
    document.cookie = "_fbp=fb.1.1596403881668.1116446470";
    document.cookie = "_fbc=fb.1.1554763741205.FromCookie12345";
    visit({ search: "?fbclid=Different123456" });
    expect(getMetaIdentifiers()).toEqual({
      fbp: "fb.1.1596403881668.1116446470",
      fbc: "fb.1.1554763741205.FromCookie12345",
    });
  });

  it("fbclid never changes first or last touch on its own — it is not a touch", () => {
    visit({ search: "?utm_source=instagram&utm_campaign=c1" });
    const before = getAttribution();
    visit({ newSession: true, search: "", referrer: "" });
    const after = getAttribution();
    expect(after.first).toEqual(before.first);
    expect(after.last).toEqual(before.last);
  });

  it("a direct return visit keeps first touch AND the original fbclid", () => {
    visit({ search: "?fbclid=AbCdEf123456&utm_source=facebook&utm_medium=paid&utm_campaign=eid" });
    visit({ newSession: true, search: "", referrer: "" });
    const a = getAttribution();
    expect(a.first).toMatchObject({ source: "facebook", campaign: "eid" });
    expect(a.last).toMatchObject({ source: "facebook", campaign: "eid" });
    expect(getMetaIdentifiers().fbc).toMatch(/AbCdEf123456$/);
  });

  it("a newer fbclid replaces the old one; the stored id expires after 90 days", () => {
    const t0 = Date.now();
    visit({ search: "?fbclid=OldClickId12345", now: t0 });
    visit({ newSession: true, search: "?fbclid=NewClickId12345", now: t0 + 1000 });
    expect(getMetaIdentifiers(t0 + 2000).fbc).toMatch(/NewClickId12345$/);
    expect(getMetaIdentifiers(t0 + 91 * 86_400_000).fbc).toBeUndefined();
  });

  it("is safe with storage blocked (never throws)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => visit({ search: "?fbclid=AbCdEf123456" })).not.toThrow();
    spy.mockRestore();
  });
});

describe("toOrderUtm — what the order's utm_* columns get", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    _resetAttributionForTests();
  });

  it("stamps the last campaign touch, normalised (ig → instagram)", () => {
    visit({ search: "?utm_source=ig&utm_medium=paid_social&utm_campaign=eid_offer" });
    expect(toOrderUtm()).toEqual({
      utm_source: "instagram",
      utm_medium: "paid_social",
      utm_campaign: "eid_offer",
    });
  });

  it("Facebook / Instagram social traffic is stamped even without UTMs", () => {
    visit({ search: "", referrer: "https://l.instagram.com/" });
    expect(toOrderUtm().utm_source).toBe("instagram");
  });

  it("direct and organic visits stamp nothing", () => {
    visit({ search: "", referrer: "" });
    expect(toOrderUtm()).toEqual({ utm_source: null, utm_medium: null, utm_campaign: null });
    visit({ newSession: true, search: "", referrer: "https://www.bing.com/" });
    expect(toOrderUtm().utm_source).toBeNull();
  });

  it("a later direct visit does not erase the paid last touch", () => {
    visit({ search: "?utm_source=instagram&utm_medium=paid_social&utm_campaign=c1" });
    visit({ newSession: true, search: "", referrer: "" });
    expect(toOrderUtm().utm_campaign).toBe("c1");
  });
});

describe("getOrderAttributionSnapshot — the browser side of the order snapshot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetAttributionForTests();
  });

  it("carries first touch, last touch and the click id from the ONE attribution store", () => {
    window.localStorage.setItem(
      "brw-attribution-v1",
      JSON.stringify({
        first: {
          source: "instagram",
          medium: "paid",
          campaign: "52575575055376",
          content: "52575869248376",
          term: null,
          ts: 1_000_000,
        },
        last: {
          source: "facebook",
          medium: "paid",
          campaign: "52575575055376",
          content: "52575869248376",
          term: null,
          ts: 1_000_500,
        },
        clickIds: { fbclid: "AbCdEfGh12345678", ts: 1_000_000 },
      }),
    );
    const snap = getOrderAttributionSnapshot(1_001_000);
    expect(snap).toEqual({
      v: 1,
      first: {
        source: "instagram",
        medium: "paid",
        campaign: "52575575055376",
        content: "52575869248376",
        term: null,
      },
      last: {
        source: "facebook",
        medium: "paid",
        campaign: "52575575055376",
        content: "52575869248376",
        term: null,
      },
      fbclid: "AbCdEfGh12345678",
    });
  });

  it("does not resurrect an expired touch (first 90 days, last 30 days)", () => {
    const day = 86_400_000;
    window.localStorage.setItem(
      "brw-attribution-v1",
      JSON.stringify({
        first: {
          source: "instagram",
          medium: "paid",
          campaign: "a",
          content: null,
          term: null,
          ts: 0,
        },
        last: {
          source: "facebook",
          medium: "paid",
          campaign: "b",
          content: null,
          term: null,
          ts: 0,
        },
      }),
    );
    const snap = getOrderAttributionSnapshot(60 * day); // last (30d) expired, first (90d) alive
    expect(snap.last).toBeNull();
    expect(snap.first?.campaign).toBe("a");
  });

  it("is empty (not an error) when nothing was captured, and holds nothing personal", () => {
    const snap = getOrderAttributionSnapshot();
    expect(snap).toEqual({ v: 1, first: null, last: null });
    expect(JSON.stringify(snap)).not.toMatch(/phone|name|address|email/i);
  });
});
