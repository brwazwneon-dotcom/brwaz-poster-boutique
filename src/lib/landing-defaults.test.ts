import { describe, expect, it, vi } from "vitest";
import type { LandingBundle, LandingPage } from "@/lib/landing-pages";
import {
  BUILT_IN_LANDING_KEYS,
  getDefaultLanding,
  isDefaultLanding,
  resolveLandingBundle,
  type LandingFetchers,
} from "./landing-defaults";

const poster = (n: number) => ({
  id: `p${n}`,
  title: `Poster ${n}`,
  image_url: `https://img.example/p/p${n}-1000.webp`,
  category_id: null,
  sales_count: n,
  views_count: n * 2,
});
const adminPage = {
  ...(getDefaultLanding("youth")!.page as LandingPage),
  id: "real-uuid",
  title_en: "Saved by admin",
};
const adminBundle: LandingBundle = { page: adminPage, posters: [] };

const fetchers = (over: Partial<LandingFetchers> = {}): LandingFetchers => ({
  fetchBundle: vi.fn(async () => null),
  fetchPosters: vi.fn(async () => [poster(1), poster(2)]),
  ...over,
});

describe("the built-in pages", () => {
  it("exist for the two campaign audiences only", () => {
    expect([...BUILT_IN_LANDING_KEYS]).toEqual(["youth", "album"]);
    expect(getDefaultLanding("youth")?.kind).toBe("posters");
    expect(getDefaultLanding("album")?.kind).toBe("photo");
    expect(getDefaultLanding(" Album ")?.kind).toBe("photo");
    expect(getDefaultLanding("movies")).toBeNull();
    expect(getDefaultLanding("")).toBeNull();
  });
  it("are complete, visible, Arabic first, and marked as built in", () => {
    for (const key of ["youth", "album"]) {
      const { page } = getDefaultLanding(key)!;
      expect(page.visible).toBe(true);
      expect(page.title_ar).toMatch(/[؀-ۿ]/);
      expect(page.subtitle_ar).toMatch(/[؀-ۿ]/);
      expect(page.cta_text).toMatch(/[؀-ۿ]/);
      expect(page.whatsapp_message).toBeTruthy();
      expect(page.seo_title).toBeTruthy();
      expect(page.meta_description).toBeTruthy();
      expect(isDefaultLanding(page)).toBe(true);
    }
    expect(isDefaultLanding(adminPage)).toBe(false);
    expect(isDefaultLanding(null)).toBe(false);
  });
  it("quote no price (prices come from the admin's settings, on the pages that sell)", () => {
    for (const key of ["youth", "album"]) {
      const { page } = getDefaultLanding(key)!;
      const text = JSON.stringify(page);
      expect(text).not.toMatch(/\d{2,}\s*(EGP|جنيه)/);
    }
  });
});

describe("resolveLandingBundle", () => {
  it("the admin's saved page always wins", async () => {
    const f = fetchers({ fetchBundle: vi.fn(async () => adminBundle) });
    expect(await resolveLandingBundle("youth", f)).toBe(adminBundle);
    expect(f.fetchPosters).not.toHaveBeenCalled();
  });
  it("without a saved page, the youth page gets trending posters", async () => {
    const result = await resolveLandingBundle("youth", fetchers());
    expect(result?.page.id).toBe("default-youth");
    expect(result?.posters.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(result?.posters[0]).toMatchObject({ title: "Poster 1", sales_count: 1, views_count: 2 });
  });
  it("shows at most the page's poster limit", async () => {
    const many = Array.from({ length: 60 }, (_, i) => poster(i));
    const result = await resolveLandingBundle(
      "youth",
      fetchers({ fetchPosters: async () => many }),
    );
    expect(result?.posters).toHaveLength(24);
  });
  it("the album page has no poster grid and never asks for posters", async () => {
    const f = fetchers();
    const result = await resolveLandingBundle("album", f);
    expect(result?.page.id).toBe("default-album");
    expect(result?.posters).toEqual([]);
    expect(f.fetchPosters).not.toHaveBeenCalled();
  });
  it("a failing lookup (for example the table is missing) is not an error: the built-in page is used", async () => {
    const boom = fetchers({
      fetchBundle: vi.fn(async () =>
        Promise.reject(new Error("relation landing_pages does not exist")),
      ),
    });
    expect((await resolveLandingBundle("youth", boom))?.page.id).toBe("default-youth");
    expect((await resolveLandingBundle("album", boom))?.page.id).toBe("default-album");
  });
  it("failing posters give the page without posters, not an error", async () => {
    const result = await resolveLandingBundle(
      "youth",
      fetchers({ fetchPosters: vi.fn(async () => Promise.reject(new Error("db down"))) }),
    );
    expect(result?.page.id).toBe("default-youth");
    expect(result?.posters).toEqual([]);
  });
  it("any other landing key is untouched: no saved page means no page", async () => {
    const f = fetchers();
    expect(await resolveLandingBundle("movies", f)).toBeNull();
    expect(f.fetchPosters).not.toHaveBeenCalled();
    const boom = fetchers({ fetchBundle: async () => Promise.reject(new Error("x")) });
    expect(await resolveLandingBundle("movies", boom)).toBeNull();
  });
});
