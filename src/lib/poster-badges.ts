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
