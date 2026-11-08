// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIENCES,
  campaignLandingUrl,
  campaignUrlParameters,
  classifyAudience,
  getAudiences,
  parseAudience,
  recordAudience,
} from "./audience";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 8);
const at = (pathname: string, search = "") => ({ pathname, search });

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("parseAudience", () => {
  it("accepts exactly the two audiences, any case, with spaces", () => {
    expect(parseAudience("youth")).toBe("youth");
    expect(parseAudience(" ALBUM ")).toBe("album");
    expect([...AUDIENCES]).toEqual(["youth", "album"]);
  });
  it.each(["", "movies", "youth,album", "youthful", null, undefined, 3, {}])(
    "%j is not an audience",
    (v) => {
      expect(parseAudience(v)).toBeNull();
    },
  );
});

describe("classifyAudience: only where a campaign sends the visitor tags them", () => {
  it("the ?aud= parameter works on any page", () => {
    expect(classifyAudience(at("/", "?aud=youth"))).toBe("youth");
    expect(classifyAudience(at("/photo-printing", "?aud=album&utm_source=facebook"))).toBe("album");
    expect(classifyAudience(at("/category/joker", "?x=1&aud=youth"))).toBe("youth");
  });
  it("the campaigns' own landing pages tag by path (trailing slash and case do not matter)", () => {
    expect(classifyAudience(at("/landing/youth"))).toBe("youth");
    expect(classifyAudience(at("/landing/album/"))).toBe("album");
    expect(classifyAudience(at("/Landing/Album"))).toBe("album");
  });
  it("the parameter wins over the path", () => {
    expect(classifyAudience(at("/landing/youth", "?aud=album"))).toBe("album");
  });
  it("an invalid parameter is ignored and the path decides", () => {
    expect(classifyAudience(at("/landing/youth", "?aud=banana"))).toBe("youth");
    expect(classifyAudience(at("/", "?aud=banana"))).toBeNull();
  });
  it("ordinary pages, and other landing pages, belong to no audience", () => {
    for (const [p, s] of [
      ["/", ""],
      ["/photo-printing", ""],
      ["/category/anime", ""],
      ["/landing/movies", "?utm_source=meta"],
      ["/landing/youth-extra", ""],
      ["/cart", "?aud="],
    ] as const) {
      expect(classifyAudience(at(p, s)), `${p}${s}`).toBeNull();
    }
  });
});

describe("recordAudience: first touch and last touch", () => {
  it("the first campaign visit sets both", () => {
    expect(recordAudience(T0, at("/", "?aud=youth"))).toEqual({ first: "youth", last: "youth" });
    expect(getAudiences(T0)).toEqual({ first: "youth", last: "youth" });
  });
  it("a visit from the other campaign moves only the last one", () => {
    recordAudience(T0, at("/", "?aud=youth"));
    expect(recordAudience(T0 + DAY, at("/landing/album"))).toEqual({
      first: "youth",
      last: "album",
    });
  });
  it("an ordinary page changes nothing: a returning visitor keeps the audience they came in with", () => {
    recordAudience(T0, at("/landing/album"));
    expect(recordAudience(T0 + 2 * DAY, at("/cart"))).toEqual({ first: "album", last: "album" });
    expect(recordAudience(T0 + 3 * DAY, at("/", ""))).toEqual({ first: "album", last: "album" });
  });
  it("a visitor nobody tagged stays untagged and nothing is written", () => {
    expect(recordAudience(T0, at("/"))).toEqual({ first: null, last: null });
    expect(window.localStorage.getItem("brw-audience-v2")).toBeNull();
  });
  it("the last touch lasts 30 days and the first 90", () => {
    recordAudience(T0, at("/landing/youth"));
    expect(getAudiences(T0 + 29 * DAY)).toEqual({ first: "youth", last: "youth" });
    expect(getAudiences(T0 + 31 * DAY)).toEqual({ first: "youth", last: null });
    expect(getAudiences(T0 + 91 * DAY)).toEqual({ first: null, last: null });
  });
  it("after the first touch expired, the next campaign visit starts over", () => {
    recordAudience(T0, at("/landing/youth"));
    expect(recordAudience(T0 + 100 * DAY, at("/landing/album"))).toEqual({
      first: "album",
      last: "album",
    });
  });
  it("garbage in storage is ignored, never thrown on", () => {
    window.localStorage.setItem("brw-audience-v2", "not json");
    expect(getAudiences(T0)).toEqual({ first: null, last: null });
    window.localStorage.setItem(
      "brw-audience-v2",
      JSON.stringify({ first: { a: "movies", ts: T0 }, last: { a: "youth", ts: "x" } }),
    );
    expect(getAudiences(T0)).toEqual({ first: null, last: null });
    expect(recordAudience(T0, at("/landing/album"))).toEqual({ first: "album", last: "album" });
  });
  it("blocked storage never throws; the audience of the current page is still reported", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(recordAudience(T0, at("/landing/youth"))).toEqual({ first: "youth", last: "youth" });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getAudiences(T0)).toEqual({ first: null, last: null });
    expect(recordAudience(T0, at("/"))).toEqual({ first: null, last: null });
  });
  it("reads the real page address when none is given", () => {
    window.history.pushState({}, "", "/landing/album?utm_source=facebook");
    expect(recordAudience()).toEqual({ first: "album", last: "album" });
    window.history.pushState({}, "", "/");
  });
});

describe("campaign links", () => {
  it("the Meta URL-parameters box gets the campaign and ad ids (Meta fills them) and the audience", () => {
    expect(campaignUrlParameters("youth")).toBe(
      "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&aud=youth",
    );
    expect(campaignUrlParameters("album")).toContain("&aud=album");
  });
  it("the destination links point at each campaign's own page and are classified back to it", () => {
    for (const a of AUDIENCES) {
      const url = new URL(campaignLandingUrl("https://brwazwneon.com/", a));
      expect(url.origin).toBe("https://brwazwneon.com");
      expect(classifyAudience({ pathname: url.pathname, search: url.search })).toBe(a);
    }
    expect(campaignLandingUrl("https://brwazwneon.com", "youth")).toBe(
      "https://brwazwneon.com/landing/youth?aud=youth",
    );
  });
});
