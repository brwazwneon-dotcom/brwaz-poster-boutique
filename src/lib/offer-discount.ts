// Spreads the automatic set-offer discount over the cart lines for the stored
// order rows. The offers (6 x 20x30, 4 x 30x40) only ever discount frames of
// THEIR size, so the discount is shared out among the individual lines of that
// size only — a 40x50 or 100x60 frame in the same cart keeps its list price.
// (It used to be spread pro-rata over every line, which turned 230 into 211 and
// 950 into 869 on the order even though the total was right.)
// The shares always add back to the discount the customer was shown.
export type DiscountLine = { price: number; qty: number; size: string; bundle?: unknown };

export function distributeOfferDiscounts(
  lines: DiscountLine[],
  discountBySize: Record<string, number>,
): number[] {
  const out = lines.map(() => 0);
  for (const [size, rawDiscount] of Object.entries(discountBySize)) {
    const discount = Math.round(rawDiscount);
    if (!(discount > 0)) continue;
    const idx = lines.map((l, i) => (!l.bundle && l.size === size ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const gross = idx.reduce((s, i) => s + lines[i].price * lines[i].qty, 0);
    if (gross <= 0) continue;
    for (const i of idx) out[i] = Math.round((lines[i].price * lines[i].qty * discount) / gross);
    // Rounding can leave the shares 1-2 EGP off; the last line of the group absorbs it.
    const last = idx[idx.length - 1];
    out[last] += discount - idx.reduce((s, i) => s + out[i], 0);
  }
  return out;
}
