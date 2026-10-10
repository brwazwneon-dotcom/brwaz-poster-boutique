// Server-side sanity check of the prices a checkout sends. The browser still
// computes the cart totals (offers, bundles, free-shipping and the double-face
// tape are all decided there), so this does NOT recompute an order from
// scratch. It checks what can be checked against the live price list and the
// order's own arithmetic, and reports anything that cannot be true:
//   hard  - arithmetic that cannot be right (negative, row total != parts) or a
//           line priced ABOVE the catalog price for its frame/size
//   soft  - worth a look (below the usual discount floor, shipping off)
// Modes (site_settings key `order_price_enforcement`): "off" | "log" (default -
// findings are only logged, the order goes through) | "enforce" (hard findings
// reject the order). Findings never contain customer data.
import { FRAME_TYPES, SIZES } from "./poster-options";

export type PriceCheckMode = "off" | "log" | "enforce";
export type PriceFinding = {
  severity: "hard" | "soft";
  code: string;
  row?: number;
  detail: string;
};

export type CheckRow = {
  frame_type: string;
  size: string;
  quantity: number;
  poster_title: string;
  selected_poster: string | null;
  subtotal: number;
  packaging_fee: number;
  shipping_cost: number;
  total_price: number;
};

const FRAME_ID_BY_LABEL = new Map<string, string>(FRAME_TYPES.map((f) => [f.label, f.id]));
const SIZE_ID_BY_LABEL = new Map<string, string>(SIZES.map((s) => [s.label, s.id]));
const TAPE_TITLE = "Double Face Tape";
// Lowest share of the catalog price a line may be sold at (bundle/auto-offer
// discounts); mirrors the database guard trigger.
const DISCOUNT_FLOOR = 0.45;

export const PRICE_CHECK_SETTING_KEYS = [
  "order_price_enforcement",
  "shipping_fee",
  "free_shipping_threshold",
  "custom_design_fee",
  ...FRAME_TYPES.flatMap((f) => SIZES.map((s) => `frame_${f.id}_${s.id}`)),
];

export function parsePriceCheckMode(raw: unknown): PriceCheckMode {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v === "off" || v === "enforce" ? v : "log";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function checkOrderRows(
  rows: CheckRow[],
  settings: Record<string, unknown>,
): PriceFinding[] {
  const out: PriceFinding[] = [];
  const customFee = num(settings.custom_design_fee) ?? 0;
  let subtotalSum = 0;
  let shippingSum = 0;
  let hasTape = false;

  rows.forEach((r, i) => {
    const parts = [r.subtotal, r.packaging_fee, r.shipping_cost, r.total_price];
    if (parts.some((p) => typeof p !== "number" || !Number.isFinite(p) || p < 0)) {
      out.push({
        severity: "hard",
        code: "invalid_amount",
        row: i,
        detail: "negative or non-numeric amount",
      });
      return;
    }
    if (!Number.isFinite(r.quantity) || r.quantity < 1 || r.quantity > 1000) {
      out.push({
        severity: "hard",
        code: "invalid_quantity",
        row: i,
        detail: `quantity ${r.quantity}`,
      });
    }
    if (Math.abs(r.total_price - (r.subtotal + r.packaging_fee + r.shipping_cost)) > 1) {
      out.push({
        severity: "hard",
        code: "total_mismatch",
        row: i,
        detail: `total ${r.total_price} vs parts ${r.subtotal + r.packaging_fee + r.shipping_cost}`,
      });
    }
    shippingSum += r.shipping_cost;
    if (r.poster_title === TAPE_TITLE) {
      hasTape = true;
      return;
    }
    subtotalSum += r.subtotal;

    const isBundle = /^\s*\d+\s*frames?\s*bundle/i.test(r.poster_title);
    if (isBundle) return; // bundle prices are set per offer, not per frame size
    const frame = FRAME_ID_BY_LABEL.get(r.frame_type);
    const size = SIZE_ID_BY_LABEL.get(r.size);
    const unit = frame && size ? num(settings[`frame_${frame}_${size}`]) : null;
    if (!unit || unit <= 0) return; // unrecognised combo: nothing to compare against
    const isCustom = r.selected_poster === null && /^custom design/i.test(r.poster_title);
    const gross = (unit + (isCustom ? customFee : 0)) * r.quantity;
    if (r.subtotal > gross + 1) {
      out.push({
        severity: "hard",
        code: "above_catalog",
        row: i,
        detail: `${frame}/${size} x${r.quantity}: subtotal ${r.subtotal} > catalog ${gross}`,
      });
    } else if (r.subtotal < gross * DISCOUNT_FLOOR - 1) {
      out.push({
        severity: "soft",
        code: "below_floor",
        row: i,
        detail: `${frame}/${size} x${r.quantity}: subtotal ${r.subtotal} < ${Math.round(DISCOUNT_FLOOR * 100)}% of ${gross}`,
      });
    }
  });

  const fee = num(settings.shipping_fee);
  const threshold = num(settings.free_shipping_threshold);
  if (fee !== null && threshold !== null && rows.length > 0) {
    const expected = subtotalSum >= threshold ? 0 : fee;
    if (Math.abs(shippingSum - expected) > 1) {
      out.push({
        severity: "soft",
        code: "shipping_off",
        detail: `charged ${Math.round(shippingSum * 100) / 100}, expected ${expected} for ${Math.round(subtotalSum)}${hasTape ? " (+tape)" : ""}`,
      });
    }
  }
  return out;
}

export function hasHardFinding(findings: PriceFinding[]): boolean {
  return findings.some((f) => f.severity === "hard");
}
