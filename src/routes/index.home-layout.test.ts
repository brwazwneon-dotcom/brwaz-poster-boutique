import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source checks on the homepage: Hero Concept #4 comes first and the old promo banners and the Photo Printing
// call to action keep their places under it.
const text = fs
  .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.tsx"), "utf8")
  .replace(/\r\n/g, "\n");

describe("homepage layout", () => {
  it("renders the new hero once, before every admin-ordered section", () => {
    expect(text.match(/<HeroFrameConcept\s*\/>/g)).toHaveLength(1);
    expect(text.indexOf("<HeroFrameConcept />")).toBeLessThan(text.indexOf("sections\n"));
    expect(text).toMatch(/classicHero \? null : <HeroFrameConcept \/>/);
  });

  it("keeps the homepage slider banners in their own slot (not nulled)", () => {
    expect(text).toMatch(/homepage_slider: \(\) => <HomepageSlider key="homepage_slider" \/>/);
  });

  it("the hero_banners slot shows only the hero banners (no Photo Printing button), and the old hero only with ?hero=classic", () => {
    expect(text).toMatch(
      /classicHero \? \(\s*<HeroBannerSection[^>]*\/>\s*\) : \(\s*<HeroBannersBand/,
    );
    const band = text.slice(
      text.indexOf("function HeroBannersBand"),
      text.indexOf("function PhotoPrintingHomeCta"),
    );
    expect(band).toContain("useHeroBanners()");
    expect(band).toContain("<HeroBannerSlider");
    expect(band).not.toContain("/photo-printing");
    expect(band).not.toContain("<h1");
  });

  it("Photo Printing is its own block, shown once, under the two hero slots and before the first other section", () => {
    const cta = text.slice(
      text.indexOf("function PhotoPrintingHomeCta"),
      text.indexOf("function HeroBannerSection"),
    );
    expect(cta).toContain('to="/photo-printing"');
    expect(cta).toContain("photoPrinting.title");
    expect(cta).toContain("photoPrinting.ctaKicker");
    expect(cta).toContain("hero-print-cta");
    // one use of the component in the page, placed by the rule, not by a section key
    expect(text.split("<PhotoPrintingHomeCta ")).toHaveLength(2);
    expect(text).toContain('s.key !== "homepage_slider" && s.key !== "hero_banners"');
    expect(text).toContain("photoPrintingPlaced ? nodes : [...nodes, photoPrinting]");
    // not with ?hero=classic (the old hero has its own button)
    expect(text).toContain("let photoPrintingPlaced = classicHero");
    // no new section key
    expect(text).not.toContain("photo-printing-cta");
  });
});
