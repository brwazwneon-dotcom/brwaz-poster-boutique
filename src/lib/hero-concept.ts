/**
 * Hero Concept #4 ("The Frame Takes Center Stage"): the one catalog design shown in the hero.
 *
 * This is a real poster from the live catalog ("Porsche (22)", category /category/porsche), served from the shop's
 * own image host as the usual two ready-made WebP files (see image-host.ts): 480x720 for phones and 1000x1500 for
 * large screens. Nothing is uploaded or copied into the repository.
 *
 * It is a constant for the preview. If the concept is approved, the poster should come from a site setting so the
 * owner can change it without code (not part of this preview).
 */
export const HERO_POSTER = {
  id: "857080f8-7f2d-4718-a07a-a16a68e78fb7",
  /** Image host folder of the catalog pictures. */
  base: "https://brwazwneon-images.vercel.app/p",
  /** Both files share this proportion (width / height = 2 / 3). */
  width: 1000,
  height: 1500,
  smallWidth: 480,
  largeWidth: 1000,
} as const;

export const HERO_POSTER_SMALL = `${HERO_POSTER.base}/${HERO_POSTER.id}-${HERO_POSTER.smallWidth}.webp`;
export const HERO_POSTER_LARGE = `${HERO_POSTER.base}/${HERO_POSTER.id}-${HERO_POSTER.largeWidth}.webp`;

/** Candidates for the browser, smallest first. */
export const HERO_POSTER_SRCSET = `${HERO_POSTER_SMALL} ${HERO_POSTER.smallWidth}w, ${HERO_POSTER_LARGE} ${HERO_POSTER.largeWidth}w`;

/**
 * Rendered width of the poster itself, which is what `srcset` has to choose from: about 46vw (phones, capped by the
 * height available) up to ~400 CSS px on a desktop. On a 3x phone that is still under 1000 device pixels, so the
 * 480 file is only picked on 1x/2x small screens and the 1000 file everywhere it matters.
 */
export const HERO_POSTER_SIZES = "(max-width: 1023px) 62vw, 420px";

/**
 * `sizes` of the lead frame of the four-frame gallery (about 40% of the gallery on phones, ~230-250 px on larger
 * screens). Shared by the lead <img> and by the route's preload so the browser picks the same file for both.
 */
export const HERO_LEAD_SIZES = "(max-width: 639px) 40vw, (max-width: 1023px) 230px, 240px";

/** Where the two buttons go: routes that already exist. */
export const HERO_CTA = {
  primary: "/trending",
  secondary: "/custom-design",
} as const;

/** `?hero=classic` shows the current hero again, to compare the two side by side in the preview. */
export function isClassicHeroRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get("hero") === "classic";
  } catch {
    return false;
  }
}

/**
 * Tilt of the frame for a pointer at (x, y) inside the stage, as -1..1 fractions of the stage from its centre.
 * Very light on purpose: two or three degrees, never more.
 */
export const MAX_TILT_DEG = { y: 3, x: 2 } as const;

export function tiltFor(fx: number, fy: number) {
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  return {
    rotateY: Number((clamp(fx) * MAX_TILT_DEG.y).toFixed(2)),
    rotateX: Number((-clamp(fy) * MAX_TILT_DEG.x).toFixed(2)),
  };
}
