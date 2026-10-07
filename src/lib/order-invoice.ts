/**
 * Invoice data built ONLY from what is already stored on the order rows.
 *
 * Nothing here prices anything: `total` is the sum of the stored
 * `total_price` of the order's rows — the very same number the admin order
 * header and the WhatsApp confirmation use. The other lines (subtotal,
 * discount, packaging, shipping) are breakdowns of that stored total; if a
 * legacy row's parts do not add up, the difference is shown as an explicit
 * "Other fees / adjustments" line instead of silently changing the total.
 */
import { parseItemNotes } from "@/lib/order-pricing";

export type InvoiceRow = {
  id: string;
  order_number?: string | null;
  poster_title: string | null;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  subtotal?: number | null;
  packaging_fee?: number | null;
  shipping_cost?: number | null;
  total_price: number;
  notes?: string | null;
};

export type InvoiceGroup = {
  primaryNumber: string;
  created_at: string;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  status: string;
  payment_method: string | null;
  payment_status?: string | null;
  is_test?: boolean;
  items: InvoiceRow[];
};

export type InvoiceItem = {
  rowId: string;
  name: string;
  frameType: string;
  frameColor: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoiceData = {
  orderNumber: string;
  createdAt: string;
  customer: { name: string; phone: string; governorate: string; address: string };
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  packaging: number;
  shipping: number;
  otherFees: number;
  total: number;
  paymentLabel: string;
  status: string;
  isTest: boolean;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function buildInvoiceData(g: InvoiceGroup): InvoiceData {
  const items: InvoiceItem[] = [];
  let discount = 0;
  let subtotal = 0;
  let packaging = 0;
  let shipping = 0;
  let total = 0;
  for (const row of g.items) {
    const snap = parseItemNotes(row.notes).pricing;
    const qty = Math.max(1, n(row.quantity));
    const gross = snap ? n(snap.gross) : n(row.subtotal);
    const unit = snap ? n(snap.unit_price) : qty > 0 ? n(row.subtotal) / qty : 0;
    subtotal += gross;
    discount += snap ? n(snap.discount) : 0;
    packaging += n(row.packaging_fee);
    shipping += n(row.shipping_cost);
    total += n(row.total_price);
    items.push({
      rowId: row.id,
      name: row.poster_title?.trim() || "Item",
      frameType: row.frame_type,
      frameColor: row.frame_color,
      size: row.size,
      quantity: qty,
      unitPrice: r2(unit),
      lineTotal: r2(gross),
    });
  }
  subtotal = r2(subtotal);
  discount = r2(discount);
  packaging = r2(packaging);
  shipping = r2(shipping);
  total = r2(total);
  const parts = r2(subtotal - discount + packaging + shipping);
  const otherFees = r2(total - parts);
  return {
    orderNumber: g.primaryNumber,
    createdAt: g.created_at,
    customer: {
      name: g.customer_name,
      phone: g.phone,
      governorate: g.governorate,
      address: g.address,
    },
    items,
    subtotal,
    discount,
    packaging,
    shipping,
    otherFees: Math.abs(otherFees) < 0.005 ? 0 : otherFees,
    total,
    paymentLabel: g.payment_method === "instapay" ? "Instapay / Vodafone Cash" : "Cash on delivery",
    status: g.status,
    isTest: !!g.is_test,
  };
}

export function formatEgp(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const hasFraction = Math.abs(v - Math.round(v)) > 0.004;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${s} EGP`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Fixed zone and our own month names, so the same order always prints the same
 * date regardless of the admin's machine, locale or ICU version.
 */
export function formatInvoiceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "2-digit",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("day")} ${MONTHS[Number(get("month")) - 1] ?? ""} ${get("year")}, ${hh}:${get("minute")}`;
}

export const hasArabic = (s: string) => /[؀-ۿݐ-ݿ]/.test(s);
