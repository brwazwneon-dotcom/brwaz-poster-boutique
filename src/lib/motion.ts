// Switches for the storefront motion layer (pop-in cards, hero stickers, fly-to-cart).
// Motion is decoration, so it is OFF whenever speed or comfort could suffer:
//  - the visitor asks for reduced motion (OS setting)
//  - the owner turns on Emergency fast mode or Safe mode (performance_flags)
//  - the URL has ?motion=off (QA / measuring the site without the layer)
export type MotionInputs = {
  prefersReducedMotion: boolean;
  emergencyFastMode: boolean;
  safeMode: boolean;
  search: string;
};

export function motionAllowed(i: MotionInputs): boolean {
  if (i.prefersReducedMotion || i.emergencyFastMode || i.safeMode) return false;
  try {
    return new URLSearchParams(i.search).get("motion") !== "off";
  } catch {
    return true;
  }
}

/** Free-shipping progress for the "added to cart" sheet, from real cart + settings values. */
export function shippingProgress(
  cartTotal: number,
  threshold: number,
): { fraction: number; remaining: number; unlocked: boolean } {
  const total = Number.isFinite(cartTotal) ? Math.max(0, cartTotal) : 0;
  if (!(threshold > 0)) return { fraction: 1, remaining: 0, unlocked: true };
  const remaining = Math.max(0, Math.round(threshold - total));
  return {
    fraction: Math.min(1, total / threshold),
    remaining,
    unlocked: total >= threshold,
  };
}

/** Fired by the cart when an item is added; the motion layer reacts to it. */
export const CART_ADDED_EVENT = "brw:cart-added";
export type CartAddedDetail = { title: string; image: string; price: number };
