import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HERO_CTA,
  HERO_POSTER,
  HERO_POSTER_LARGE,
  HERO_POSTER_SIZES,
  HERO_POSTER_SMALL,
  HERO_POSTER_SRCSET,
  MAX_TILT_DEG,
  isClassicHeroRequested,
  tiltFor,
} from "./hero-concept";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("hero poster", () => {
  it("is a catalog poster served by the shop's image host in the usual two sizes", () => {
    expect(HERO_POSTER_SMALL).toBe(
      "https://brwazwneon-images.vercel.app/p/857080f8-7f2d-4718-a07a-a16a68e78fb7-480.webp",
    );
    expect(HERO_POSTER_LARGE).toBe(
      "https://brwazwneon-images.vercel.app/p/857080f8-7f2d-4718-a07a-a16a68e78fb7-1000.webp",
    );
  });

  it("matches the pattern the rest of the site uses for poster pictures (image-host.ts)", () => {
    expect(HERO_POSTER_LARGE).toMatch(/^https:\/\/[^/]+\/p\/[0-9a-f-]{36}-1000\.webp$/i);
  });

  it("offers both files to the browser, smallest first, with the real widths", () => {
    expect(HERO_POSTER_SRCSET).toBe(`${HERO_POSTER_SMALL} 480w, ${HERO_POSTER_LARGE} 1000w`);
    expect(HERO_POSTER_SIZES).toContain("max-width: 1023px");
  });

  it("reserves a 2:3 box (the files are 1000x1500), so the picture cannot shift the layout", () => {
    expect(HERO_POSTER.width / HERO_POSTER.height).toBeCloseTo(2 / 3, 4);
  });
});

describe("hero buttons go to routes that exist", () => {
  const tree = fs.readFileSync(path.join(SRC, "routeTree.gen.ts"), "utf8");
  it("primary and secondary routes are registered in the route tree", () => {
    for (const to of Object.values(HERO_CTA)) {
      expect(tree, to).toContain(`'${to}'`);
    }
  });
});

describe("tilt", () => {
  it("is zero in the middle and a few degrees at the edges, never more", () => {
    expect(tiltFor(0, 0)).toEqual({ rotateY: 0, rotateX: 0 });
    expect(tiltFor(1, 1)).toEqual({ rotateY: MAX_TILT_DEG.y, rotateX: -MAX_TILT_DEG.x });
    expect(tiltFor(-1, -1)).toEqual({ rotateY: -MAX_TILT_DEG.y, rotateX: MAX_TILT_DEG.x });
  });

  it("clamps a pointer that is outside the stage", () => {
    expect(tiltFor(9, -9)).toEqual({ rotateY: MAX_TILT_DEG.y, rotateX: MAX_TILT_DEG.x });
  });

  it("stays gentle", () => {
    expect(MAX_TILT_DEG.y).toBeLessThanOrEqual(6);
    expect(MAX_TILT_DEG.x).toBeLessThanOrEqual(4);
  });
});

describe("?hero=classic", () => {
  it("is only true for exactly hero=classic", () => {
    expect(isClassicHeroRequested("?hero=classic")).toBe(true);
    expect(isClassicHeroRequested("?a=1&hero=classic")).toBe(true);
    expect(isClassicHeroRequested("")).toBe(false);
    expect(isClassicHeroRequested("?hero=4")).toBe(false);
    expect(isClassicHeroRequested("?hero=")).toBe(false);
  });
});
