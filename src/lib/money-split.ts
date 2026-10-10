// Splits an amount across n rows in whole cents so the parts ALWAYS add back to
// the exact amount (89 EGP over 3 items → 29.67 + 29.67 + 29.66, not three
// rounded 29.67s that add up to 89.01). The remainder cents go to the first rows.
export function splitAmount(total: number, parts: number): number[] {
  const n = Math.max(0, Math.floor(parts));
  if (n === 0) return [];
  const cents = Math.round((Number.isFinite(total) ? total : 0) * 100);
  const base = Math.trunc(cents / n);
  const extra = cents - base * n; // may be negative for negative totals
  const step = extra >= 0 ? 1 : -1;
  return Array.from({ length: n }, (_, i) => (base + (i < Math.abs(extra) ? step : 0)) / 100);
}
