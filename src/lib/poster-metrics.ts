/**
 * Safe per-poster ratio helpers.
 * All return 0 when views_count is 0/null so the UI never renders NaN or Infinity.
 */

function safeNum(n: number | null | undefined): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Conversion rate = sales / views, as a percentage. 0 when no views. */
export function conversionRatePct(salesCount: number | null | undefined, viewsCount: number | null | undefined): number {
  const v = safeNum(viewsCount);
  if (v === 0) return 0;
  return (safeNum(salesCount) / v) * 100;
}

/** Click-through rate = cart_adds / views, as a percentage. 0 when no views. */
export function ctrPct(cartAddsCount: number | null | undefined, viewsCount: number | null | undefined): number {
  const v = safeNum(viewsCount);
  if (v === 0) return 0;
  return (safeNum(cartAddsCount) / v) * 100;
}

/** Average seconds viewed per view. 0 when no views. */
export function avgViewSeconds(totalViewSeconds: number | null | undefined, viewsCount: number | null | undefined): number {
  const v = safeNum(viewsCount);
  if (v === 0) return 0;
  return safeNum(totalViewSeconds) / v;
}

/** Format a percentage safely, e.g. 12.34% or "—" when zero-view. */
export function formatRatePct(pct: number, viewsCount: number | null | undefined): string {
  if (safeNum(viewsCount) === 0) return "—";
  return `${pct.toFixed(2)}%`;
}

/** Format avg time as "12s" / "1m 05s" / "—" when zero-view. */
export function formatAvgTime(seconds: number, viewsCount: number | null | undefined): string {
  if (safeNum(viewsCount) === 0) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}