/**
 * Hero showcase: the four frames of Hero Concept #4 are real Best Sellers, a different four every day.
 *
 * Source: the storefront's own Best Sellers list (`fetchBestSellersFromDb`: posters flagged `is_best_seller`, visible,
 * with a usable image, ordered by the admin's optional pin (`best_seller_order`) and then by `sales_count`). Nothing
 * here ranks products or reads orders: it only takes the top of that existing list and rotates through it by date.
 *
 * Pure functions, no server or browser access, so they are easy to test with a fake clock.
 */

/** How many of the top Best Sellers take part in the daily rotation, and how many frames the hero shows. */
export const SHOWCASE_POOL = 12;
export const SHOWCASE_COUNT = 4;

/** The shop's day changes at midnight in Egypt, whatever the visitor's or the server's own time zone. */
export const SHOWCASE_TIME_ZONE = "Africa/Cairo";

export type ShowcaseItem = {
  id: string;
  title: string;
  /** The usual large picture (1000 px wide). */
  image: string;
  /** A ready-made 480 px version when the image host has one (see image-host.ts), else null. */
  small: string | null;
};

export type ShowcasePayload = {
  /** The shop day (YYYY-MM-DD, Cairo) these frames were chosen for. */
  day: string;
  items: ShowcaseItem[];
};

/** The shop's calendar day for a moment in time, as YYYY-MM-DD. */
export function shopDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOWCASE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days since 1970-01-01 for a shop day: steady, no gaps at month or year ends. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Four consecutive entries of the pool, starting at a point that moves on by four every day (wrapping round), so:
 *  - the same day always gives the same four, for everybody;
 *  - the next day gives different ones (whenever the pool has more than four);
 *  - every product shown is from the pool, i.e. from the top of the Best Sellers list.
 */
export function pickDaily<T>(
  ranked: readonly T[],
  day: string,
  pool = SHOWCASE_POOL,
  count = SHOWCASE_COUNT,
): T[] {
  const top = ranked.slice(0, pool);
  if (top.length <= count) return [...top];
  const start = (dayNumber(day) * count) % top.length;
  return Array.from({ length: count }, (_, i) => top[(start + i) % top.length]);
}

// Same shape as image-host.ts: .../p/<posterId>-1000.webp has a sibling .../p/<posterId>-480.webp.
const LARGE = /^(https?:\/\/[^?#]+\/p\/[0-9a-f-]{36})-\d{3,4}\.webp$/i;

export function smallVariant(imageUrl: string): string | null {
  const m = imageUrl.match(LARGE);
  return m ? `${m[1]}-480.webp` : null;
}

export type BestSellerRowLike = {
  posters: { id: string; title: string; image_url?: string | null; hidden?: boolean } | null;
};

/** Best Sellers rows (already ordered by the shop's rule) -> the usable ones: visible, with a real picture. */
export function showcaseCandidates(rows: readonly BestSellerRowLike[]): ShowcaseItem[] {
  const out: ShowcaseItem[] = [];
  for (const row of rows) {
    const p = row.posters;
    if (!p || p.hidden || !p.image_url || !/^https?:\/\//i.test(p.image_url)) continue;
    out.push({
      id: p.id,
      title: p.title,
      image: p.image_url,
      small: smallVariant(p.image_url),
    });
  }
  return out;
}

export function buildShowcase(rows: readonly BestSellerRowLike[], now: Date): ShowcasePayload {
  const day = shopDay(now);
  return { day, items: pickDaily(showcaseCandidates(rows), day) };
}

/** `srcset` for an item: the 480 and 1000 files when both exist, else just the one picture. */
export function showcaseSrcSet(item: ShowcaseItem): string | undefined {
  return item.small ? `${item.small} 480w, ${item.image} 1000w` : undefined;
}
