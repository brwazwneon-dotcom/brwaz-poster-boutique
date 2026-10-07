/**
 * Single source of truth for checkout pricing.
 *
 * Everything the customer sees (cart, checkout) and everything written into
 * the `orders` rows (per-line subtotal / packaging / shipping / total) comes
 * out of `computeCheckout`, so the on-screen total and the stored total can
 * never drift apart. Admin screens, WhatsApp text and the invoice read the
 * stored values back and never recompute them.
 *
 * Business rules are unchanged from the previous inline implementation in
 * `routes/cart.tsx`:
 *   - unit price = admin frame price for (frame type, size) [+ custom design
 *     fee for customer-uploaded images]; bundle lines keep their offer price
 *   - auto bundle offer: 6 × 20x30 or 4 × 30x40 → flat offer price per set
 *   - packaging fee per bundle line (× qty) and per auto-detected set
 *   - double-face tape per frame (optional)
 *   - shipping flat fee, free when (discounted subtotal + tape) ≥ threshold
 *
 * All arithmetic that gets split across lines is done in integer cents with
 * largest-remainder allocation, so line values always add up exactly.
 */
import type { CartItem } from "./cart";
import { isValidFrameCombo } from "./poster-options";
import { computeShipping, priceForFrame, type Pricing, type SiteSettings } from "./use-settings";

export const AUTO_OFFER_SETS = [
  { size: "20x30", per: 6, priceKey: "bundle6_20x30" },
  { size: "30x40", per: 4, priceKey: "bundle4_30x40" },
] as const;

export const toCents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
export const fromCents = (c: number) => c / 100;

/** Customer-uploaded design lines carry the extra custom design fee. */
export function isCustomLine(
  i: Pick<CartItem, "customImagePath" | "categoryName" | "bundle">,
): boolean {
  if (i.bundle) return false;
  if (i.customImagePath) return true;
  return /custom|مخصص/i.test(i.categoryName ?? "");
}

/**
 * Current unit price for a cart line. Never trusts the price that was stored
 * in the browser's localStorage when the item was added, except as a last
 * resort when the admin has no price for that frame/size combination.
 */
export function unitPriceFor(
  i: Pick<CartItem, "frameType" | "size" | "price" | "bundle" | "customImagePath" | "categoryName">,
  pricing: Pricing,
): number {
  if (i.bundle) return i.price; // offer bundles are priced by the offer itself
  const base = priceForFrame(pricing, i.frameType, i.size);
  if (!(base > 0)) return i.price;
  return base + (isCustomLine(i) ? pricing.customDesignFee : 0);
}

/** Largest-remainder split of `totalCents` over `weights` (sum is exact). */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const clean = weights.map((x) => Math.max(0, x));
  const sumW = clean.reduce((s, x) => s + x, 0);
  const w = sumW > 0 ? clean : clean.map(() => 1);
  const sum = sumW > 0 ? sumW : n;
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const raw = w.map((x) => (abs * x) / sum);
  const base = raw.map(Math.floor);
  let rest = abs - base.reduce((s, x) => s + x, 0);
  const order = raw
    .map((r, idx) => ({ idx, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) base[order[k].idx] += 1;
  return base.map((x) => x * sign);
}

export type PricingSnapshot = {
  v: 1;
  /** Unit price at the time of the order (before any offer discount). */
  unit_price: number;
  gross: number;
  discount: number;
  net: number;
  packaging: number;
  shipping: number;
  total: number;
};

export type PricedLine = {
  item: CartItem;
  unit: number;
  gross: number;
  discount: number;
  net: number;
  packaging: number;
  shipping: number;
  total: number;
};

export type CheckoutTotals = {
  lines: PricedLine[];
  tape: { frames: number; unit: number; total: number } | null;
  subtotal: number;
  discount: number;
  autoOfferSets: number;
  packaging: number;
  tapeTotal: number;
  shipping: number;
  grand: number;
  frameCount: number;
  posterCount: number;
  remainingForFree: number;
  freeShippingPct: number;
};

export function computeCheckout(
  rawItems: CartItem[],
  pricing: Pricing,
  settings: SiteSettings,
  tapeChosen: boolean,
): CheckoutTotals {
  const items = rawItems.map((i) => ({
    ...i,
    qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
    price: unitPriceFor(i, pricing),
  }));
  const cents = items.map((i) => toCents(i.price) * i.qty);
  const subtotalC = cents.reduce((s, c) => s + c, 0);

  const frameCount = items.reduce(
    (s, i) => s + (i.bundle ? i.bundle.posters.length : 1) * i.qty,
    0,
  );

  // ---- auto bundle offers (duplicates of the same size count) ----
  const discountByLine = items.map(() => 0);
  const extraPackagingByLine = items.map(() => 0);
  let autoOfferSets = 0;
  let discountC = 0;
  for (const rule of AUTO_OFFER_SETS) {
    const idxs = items
      .map((_, k) => k)
      .filter((k) => !items[k].bundle && items[k].size === rule.size);
    const qty = idxs.reduce((s, k) => s + items[k].qty, 0);
    const sets = Math.floor(qty / rule.per);
    if (sets <= 0) continue;
    const avgUnit = idxs.reduce((s, k) => s + items[k].price * items[k].qty, 0) / qty;
    // Same formula as before: whole-EGP discount per completed set.
    const perSet = Math.max(0, Math.round(avgUnit * rule.per - pricing.offers[rule.priceKey]));
    const ruleC = toCents(perSet * sets);
    autoOfferSets += sets;
    discountC += ruleC;
    const parts = allocateCents(
      ruleC,
      idxs.map((k) => cents[k]),
    );
    idxs.forEach((k, p) => (discountByLine[k] += parts[p]));
    // Packaging for the sets lands on the first eligible line.
    extraPackagingByLine[idxs[0]] += toCents(pricing.packagingFee) * sets;
  }
  discountC = Math.min(discountC, subtotalC);

  const packagingByLine = items.map(
    (i, k) => (i.bundle ? toCents(pricing.packagingFee) * i.qty : 0) + extraPackagingByLine[k],
  );
  const packagingC = packagingByLine.reduce((s, c) => s + c, 0);

  const tapeC = tapeChosen ? frameCount * toCents(pricing.doubleFaceTapePrice) : 0;

  const discountedC = Math.max(0, subtotalC - discountC);
  const shippingC = items.length
    ? toCents(computeShipping(fromCents(discountedC + tapeC), settings))
    : 0;
  const shippingByLine = allocateCents(
    shippingC,
    items.map(() => 1),
  );

  const lines: PricedLine[] = items.map((item, k) => {
    const net = cents[k] - discountByLine[k];
    const total = net + packagingByLine[k] + shippingByLine[k];
    return {
      item: rawItems[k],
      unit: item.price,
      gross: fromCents(cents[k]),
      discount: fromCents(discountByLine[k]),
      net: fromCents(net),
      packaging: fromCents(packagingByLine[k]),
      shipping: fromCents(shippingByLine[k]),
      total: fromCents(total),
    };
  });

  const grandC = discountedC + packagingC + tapeC + shippingC;
  const threshold = settings.freeShippingThreshold;
  const basis = fromCents(discountedC + tapeC);
  return {
    lines,
    tape:
      tapeChosen && tapeC > 0
        ? { frames: frameCount, unit: pricing.doubleFaceTapePrice, total: fromCents(tapeC) }
        : null,
    subtotal: fromCents(subtotalC),
    discount: fromCents(discountC),
    autoOfferSets,
    packaging: fromCents(packagingC),
    tapeTotal: fromCents(tapeC),
    shipping: fromCents(shippingC),
    grand: fromCents(grandC),
    frameCount,
    posterCount: frameCount,
    remainingForFree: Math.max(0, threshold - basis),
    freeShippingPct: threshold > 0 ? Math.min(100, Math.round((basis / threshold) * 100)) : 100,
  };
}

export function pricingSnapshot(l: PricedLine): PricingSnapshot {
  return {
    v: 1,
    unit_price: l.unit,
    gross: l.gross,
    discount: l.discount,
    net: l.net,
    packaging: l.packaging,
    shipping: l.shipping,
    total: l.total,
  };
}

/* ------------------------------------------------------------------ */
/* Order-row notes: custom image metadata + immutable pricing snapshot */
/* ------------------------------------------------------------------ */

export type ParsedItemNotes = {
  /** Custom image metadata (original filename / size …) when present. */
  meta: Record<string, unknown> | null;
  pricing: PricingSnapshot | null;
  /** Plain-text note (legacy rows / hand-written). */
  text: string | null;
};

export function buildItemNotes(
  customImageMeta: CartItem["customImageMeta"] | undefined,
  snapshot: PricingSnapshot,
): string {
  return JSON.stringify({ ...(customImageMeta ?? {}), pricing: snapshot });
}

export function parseItemNotes(raw: string | null | undefined): ParsedItemNotes {
  if (!raw) return { meta: null, pricing: null, text: null };
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const { pricing, ...rest } = j as Record<string, unknown>;
      const p =
        pricing && typeof pricing === "object" && (pricing as { v?: unknown }).v === 1
          ? (pricing as PricingSnapshot)
          : null;
      const hasMeta = Object.keys(rest).length > 0;
      return { meta: hasMeta ? rest : null, pricing: p, text: null };
    }
  } catch {
    /* plain text note */
  }
  return { meta: null, pricing: null, text: raw };
}

/* ------------------------------------------------------------------ */
/* Pre-insert validation                                              */
/* ------------------------------------------------------------------ */

export type CheckoutIssue = { lineId: string; code: string; message: string };

export function validateCheckoutLines(totals: CheckoutTotals): CheckoutIssue[] {
  const issues: CheckoutIssue[] = [];
  const seen = new Set<string>();
  for (const l of totals.lines) {
    const i = l.item;
    const add = (code: string, message: string) => issues.push({ lineId: i.id, code, message });
    if (seen.has(i.id)) add("duplicate_line", "Duplicate cart line");
    seen.add(i.id);
    if (!Number.isInteger(i.qty) || i.qty < 1) add("bad_quantity", "Invalid quantity");
    if (!Number.isFinite(l.unit) || l.unit <= 0) add("bad_price", "Missing or non-positive price");
    if (!i.frameType || !i.size || !i.color) add("missing_frame", "Missing frame type/size/color");
    if (i.frameType && i.size && i.color && !isValidFrameCombo(i.frameType, i.size, i.color))
      add("bad_combo", "Frame type, size and colour do not form an orderable combination");
    if (!i.title) add("missing_title", "Missing item title");
    if (!i.image && !i.customImagePath && !i.bundle) add("missing_image", "Missing image");
    if (i.customImagePath && i.customImagePath.startsWith("blob:"))
      add("blob_image", "Temporary image URL");
    if (l.total < 0) add("negative_total", "Negative line total");
  }
  if (!(totals.grand > 0)) {
    issues.push({ lineId: "", code: "bad_total", message: "Order total must be positive" });
  }
  return issues;
}

/** Cancelled and test orders never count towards revenue. */
export function countsAsRevenue(o: { status?: string | null; is_test?: boolean | null }): boolean {
  return o.status !== "cancelled" && !o.is_test;
}
