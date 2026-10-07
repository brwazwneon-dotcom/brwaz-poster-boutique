import { describe, expect, it } from "vitest";
import {
  MOCKUP_ASSET_GEOMETRY,
  POSTER_BLEED_PX,
  mockupStageWidthCss,
  posterRectPct,
} from "./frame-mockup-geometry";

describe("measured mockup geometry", () => {
  for (const key of ["black", "white", "wood"] as const) {
    const g = MOCKUP_ASSET_GEOMETRY[key];
    it(`${key}: opening lies inside the image and is portrait`, () => {
      expect(g.hole.left).toBeGreaterThan(0);
      expect(g.hole.top).toBeGreaterThan(0);
      expect(g.hole.right).toBeLessThan(g.width);
      expect(g.hole.bottom).toBeLessThan(g.height);
      expect(g.hole.bottom - g.hole.top).toBeGreaterThan(g.hole.right - g.hole.left);
    });

    it(`${key}: poster layer = opening + ${POSTER_BLEED_PX}px bleed on every side, within the image`, () => {
      const r = posterRectPct(g);
      const l = (r.left / 100) * g.width;
      const t = (r.top / 100) * g.height;
      const w = (r.width / 100) * g.width;
      const h = (r.height / 100) * g.height;
      expect(l).toBeCloseTo(g.hole.left - POSTER_BLEED_PX, 6);
      expect(t).toBeCloseTo(g.hole.top - POSTER_BLEED_PX, 6);
      expect(l + w).toBeCloseTo(g.hole.right + POSTER_BLEED_PX, 6);
      expect(t + h).toBeCloseTo(g.hole.bottom + POSTER_BLEED_PX, 6);
      expect(r.left + r.width).toBeLessThanOrEqual(100);
      expect(r.top + r.height).toBeLessThanOrEqual(100);
    });

    it(`${key}: bleed stays hidden — the wall/frame margin is far larger than the bleed`, () => {
      expect(
        Math.min(g.hole.left, g.hole.top, g.width - g.hole.right, g.height - g.hole.bottom),
      ).toBeGreaterThan(POSTER_BLEED_PX * 10);
    });
  }

  it("no bleed → exactly the hole", () => {
    const g = MOCKUP_ASSET_GEOMETRY.black;
    const r = posterRectPct(g, 0);
    expect((r.left / 100) * g.width).toBeCloseTo(g.hole.left, 6);
    expect(((r.left + r.width) / 100) * g.width).toBeCloseTo(g.hole.right, 6);
  });

  it("stage keeps the image aspect ratio and never exceeds the safe vertical crop", () => {
    const css = mockupStageWidthCss(MOCKUP_ASSET_GEOMETRY.black);
    expect(css).toMatch(/^max\(min\(100cqw, calc\(100cqh \* 0\.66/);
    expect(css).toContain("cqh");
    expect(css).toContain("cqw");
  });
});
