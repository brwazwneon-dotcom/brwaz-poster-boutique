/**
 * Tiered bundle discount applied to the cart subtotal based on the total
 * poster count in the cart (bundle posters count as individuals).
 *
 *   2 posters  → 10%
 *   3 posters  → 15%
 *   4+ posters → 20%
 */
export const BUNDLE_TIERS = [
  { minPosters: 4, percent: 20 },
  { minPosters: 3, percent: 15 },
  { minPosters: 2, percent: 10 },
] as const;

export type BundleTier = (typeof BUNDLE_TIERS)[number];

export function tierFor(posterCount: number): BundleTier | null {
  return BUNDLE_TIERS.find((t) => posterCount >= t.minPosters) ?? null;
}

export function nextTier(posterCount: number): BundleTier | null {
  // Returns the closest tier the customer has NOT yet unlocked.
  const climbing = [...BUNDLE_TIERS].sort((a, b) => a.minPosters - b.minPosters);
  for (const t of climbing) {
    if (posterCount < t.minPosters) return t;
  }
  return null;
}

export function computeBundleDiscount(subtotal: number, posterCount: number): {
  tier: BundleTier | null;
  amount: number; // absolute EGP saved
} {
  const tier = tierFor(posterCount);
  if (!tier) return { tier: null, amount: 0 };
  return { tier, amount: Math.round((subtotal * tier.percent) / 100) };
}