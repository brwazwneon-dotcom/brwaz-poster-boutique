/**
 * Measured geometry of the bundled frame mockup images
 * (public/assets/mockups/frame-{black,white,wood}.webp).
 *
 * Every number below was measured from the image files themselves (alpha
 * channel: the transparent hole is the real opening the print shows
 * through) — nothing is estimated. The pixels immediately OUTSIDE each hole
 * are 100% opaque (alpha 255, checked out to 6 px), so a poster layer that is
 * a few pixels larger than the hole is hidden under the frame art exactly like
 * the lip of a physical frame: no gap can show and nothing can overflow.
 *
 * Coordinates are pixels of the image, `right`/`bottom` are exclusive.
 */
export type MockupAssetGeometry = {
  width: number;
  height: number;
  /** Bounding box of the transparent opening. */
  hole: { left: number; top: number; right: number; bottom: number };
  /**
   * Smallest top/bottom margin (as a fraction of image height) that can be
   * cropped away without touching the frame itself. Used when the preview
   * box is wider than the mockup, so the photo is "covered" without cutting
   * the frame.
   */
  safeVerticalCrop: number;
};

export const MOCKUP_ASSET_GEOMETRY = {
  black: {
    width: 853,
    height: 1280,
    hole: { left: 120, top: 173, right: 733, bottom: 1082 },
    safeVerticalCrop: 0.09,
  },
  white: {
    width: 853,
    height: 1280,
    hole: { left: 119, top: 176, right: 731, bottom: 1081 },
    safeVerticalCrop: 0.09,
  },
  // The wood photo is shot at an angle: the opening is a slightly skewed
  // quadrilateral TL(131,164) TR(722,194) BR(771,1102) BL(168,1148). The poster
  // layer covers its bounding box; the opaque photo around the quad trims it.
  wood: {
    width: 852,
    height: 1280,
    hole: { left: 131, top: 164, right: 772, bottom: 1150 },
    safeVerticalCrop: 0.09,
  },
} as const satisfies Record<"black" | "white" | "wood", MockupAssetGeometry>;

/** Extra pixels of poster beyond the hole, hidden under the opaque frame art. */
export const POSTER_BLEED_PX = 3;

/** Poster layer rectangle as % of the mockup image (left, top, width, height). */
export function posterRectPct(g: MockupAssetGeometry, bleed = POSTER_BLEED_PX) {
  const l = Math.max(0, g.hole.left - bleed);
  const t = Math.max(0, g.hole.top - bleed);
  const r = Math.min(g.width, g.hole.right + bleed);
  const b = Math.min(g.height, g.hole.bottom + bleed);
  return {
    left: (l / g.width) * 100,
    top: (t / g.height) * 100,
    width: ((r - l) / g.width) * 100,
    height: ((b - t) / g.height) * 100,
  };
}

/**
 * CSS width for the mockup "stage" inside a preview box (needs the box to be a
 * `container-type: size` container). The stage always keeps the image's own
 * aspect ratio, so the frame is never stretched:
 *   - box same shape as the image  → fills the box
 *   - box wider than the image     → "cover" the box, but only as far as the
 *                                    wall margin can be cropped without
 *                                    touching the frame
 *   - box taller / much wider      → "contain" (frame fully visible)
 */
export function mockupStageWidthCss(g: MockupAssetGeometry): string {
  const r = g.width / g.height;
  const contain = `min(100cqw, calc(100cqh * ${r}))`;
  const cover = `max(100cqw, calc(100cqh * ${r}))`;
  const safe = `calc(100cqh * ${r / (1 - 2 * g.safeVerticalCrop)})`;
  return `max(${contain}, min(${cover}, ${safe}))`;
}
