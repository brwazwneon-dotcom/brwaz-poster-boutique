export const POSTER_BADGES = [
  { id: "best-seller", label: "Best Seller" },
  { id: "new", label: "New" },
  { id: "trending", label: "Trending" },
  { id: "limited", label: "Limited Edition" },
  { id: "exclusive", label: "Exclusive" },
] as const;

export type PosterBadgeId = (typeof POSTER_BADGES)[number]["id"];

export function badgeLabel(id?: string | null): string | null {
  if (!id) return null;
  return POSTER_BADGES.find((b) => b.id === id)?.label ?? null;
}

export function formatCount(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "0";
  return v.toLocaleString("en-US");
}

/** 1,234 → "1.2K", 12,500 → "12.5K", 1,200,000 → "1.2M". Real counts only, just shorter. */
export function formatCompactCount(n: number | null | undefined): string {
  const v = Math.floor(Number(n ?? 0));
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (v < 1000) return String(v);
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (v < 1_000_000) return `${trim(v / 1000)}K`;
  return `${trim(v / 1_000_000)}M`;
}

/**
 * A poster's view count is shown to shoppers only once it says something
 * ("1 views" on a new poster just looks empty). It is always the REAL count —
 * below the threshold the line is simply left out.
 */
export const MIN_VIEWS_TO_SHOW = 25;
export function shouldShowViews(n: number | null | undefined): boolean {
  return Number(n ?? 0) >= MIN_VIEWS_TO_SHOW;
}
