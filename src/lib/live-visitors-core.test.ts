import { describe, expect, it } from "vitest";
import {
  buildLiveSnapshot,
  clampWindowSeconds,
  cleanPath,
  cleanVisitorId,
  deviceFromUserAgent,
  geoFromHeaders,
  pageLabel,
  sanitizePing,
  type LiveRow,
} from "./live-visitors-core";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function row(id: string, o: Partial<LiveRow> = {}): LiveRow {
  return {
    visitor_id: id,
    first_seen: ago(300),
    last_seen: ago(10),
    path: "/",
    title: null,
    country_code: "EG",
    country: "Egypt",
    region: null,
    city: "Cairo",
    device: "mobile",
    browser: "Chrome",
    source: "instagram",
    screen: "small",
    ...o,
  };
}

describe("active visitor definition", () => {
  it("counts a visitor only while last_seen is inside the window (90s default)", () => {
    const snap = buildLiveSnapshot(
      [
        row("aaaaaaaa-1", { last_seen: ago(5) }),
        row("aaaaaaaa-2", { last_seen: ago(89) }),
        row("aaaaaaaa-3", { last_seen: ago(91) }),
        row("aaaaaaaa-4", { last_seen: ago(600) }),
      ],
      NOW,
    );
    expect(snap.windowSeconds).toBe(90);
    expect(snap.online).toBe(2);
    expect(snap.visitors.map((v) => v.label)).toEqual(["aaaaaa", "aaaaaa"]);
    expect(snap.visitors[0].secondsAgo).toBe(5);
  });

  it("honours a custom window and clamps it to 30s..600s", () => {
    const rows = [row("bbbbbbbb-1", { last_seen: ago(100) })];
    expect(buildLiveSnapshot(rows, NOW, 90).online).toBe(0);
    expect(buildLiveSnapshot(rows, NOW, 180).online).toBe(1);
    expect(clampWindowSeconds(1)).toBe(30);
    expect(clampWindowSeconds(99999)).toBe(600);
    expect(clampWindowSeconds("abc")).toBe(90);
  });

  it("aggregates countries, cities, devices and pages", () => {
    const snap = buildLiveSnapshot(
      [
        row("cccccccc-1", { city: "Cairo", device: "mobile", path: "/" }),
        row("cccccccc-2", { city: "Cairo", device: "mobile", path: "/category/movies" }),
        row("cccccccc-3", { city: "Alexandria", device: "desktop", path: "/" }),
        row("cccccccc-4", {
          country_code: "SA",
          country: "Saudi Arabia",
          city: "Riyadh",
          device: "tablet",
          path: "/cart",
        }),
      ],
      NOW,
    );
    expect(snap.online).toBe(4);
    expect(snap.countries.map((c) => [c.label, c.count])).toEqual([
      ["Egypt", 3],
      ["Saudi Arabia", 1],
    ]);
    expect(snap.cities[0]).toMatchObject({ label: "Cairo, Egypt", count: 2 });
    expect(snap.devices).toEqual({ mobile: 2, tablet: 1, desktop: 1 });
    expect(snap.pages.find((p) => p.key === "/")?.count).toBe(2);
    expect(snap.pages.map((p) => p.label)).toContain("Category: movies");
  });

  it("two tabs from the same visitor are one row (the id is the key), and no IP exists anywhere", () => {
    const snap = buildLiveSnapshot([row("dddddddd-1")], NOW);
    const json = JSON.stringify(snap);
    expect(snap.online).toBe(1);
    expect(json).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(Object.keys(snap.visitors[0])).not.toContain("ip");
    // only a 6-char anonymous label is exposed, never the full id
    expect(snap.visitors[0].label).toHaveLength(6);
  });
});

describe("ping validation and privacy", () => {
  it("rejects bad ids and strips query strings / hashes from paths", () => {
    expect(cleanVisitorId("short")).toBeNull();
    expect(cleanVisitorId("has spaces in it!!")).toBeNull();
    expect(cleanVisitorId("0a1b2c3d-1111-2222-3333-444455556666")).not.toBeNull();
    expect(cleanPath("/poster/x?token=secret#frag")).toBe("/poster/x");
    expect(cleanPath("https://evil.example/")).toBe("/");
    expect(cleanPath(undefined)).toBe("/");
  });

  it("sanitizePing keeps only the expected fields", () => {
    const p = sanitizePing({
      visitorId: "0a1b2c3d-1111-2222-3333-444455556666",
      path: "/cart?x=1",
      title: "Cart\n\u0000 — BRWAZ",
      device: "phone-ish",
      source: "instagram",
      screen: "huge",
      ip: "1.2.3.4",
      email: "a@b.c",
    });
    expect(p).toEqual({
      visitorId: "0a1b2c3d-1111-2222-3333-444455556666",
      path: "/cart",
      title: "Cart — BRWAZ",
      source: "instagram",
      screen: null,
      device: "desktop",
    });
    expect(sanitizePing(null)).toBeNull();
    expect(sanitizePing({ path: "/" })).toBeNull();
  });

  it("reads approximate location from platform headers only", () => {
    const geo = geoFromHeaders(
      (n) =>
        ({
          "x-vercel-ip-country": "eg",
          "x-vercel-ip-country-region": "ALX",
          "x-vercel-ip-city": "Alexandria",
        })[n],
    );
    expect(geo).toEqual({ countryCode: "EG", country: "Egypt", region: "ALX", city: "Alexandria" });
    expect(
      geoFromHeaders((n) => (n === "x-vercel-ip-city" ? "S%C3%A3o%20Paulo" : undefined)).city,
    ).toBe("São Paulo");
    expect(geoFromHeaders(() => undefined)).toEqual({
      countryCode: null,
      country: null,
      region: null,
      city: null,
    });
    expect(
      geoFromHeaders((n) => (n === "x-vercel-ip-country" ? "ZZZ" : undefined)).countryCode,
    ).toBeNull();
  });

  it("classifies devices and page names", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5) Mobile/15E148")).toBe(
      "mobile",
    );
    expect(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 18_5)")).toBe("tablet");
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(pageLabel("/")).toBe("Homepage");
    expect(pageLabel("/poster/the-last-of-us-2")).toBe("Poster: the-last-of-us-2");
    expect(pageLabel("/offers")).toBe("Offers");
  });
});
