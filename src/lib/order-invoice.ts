// Pure model for the customer-facing order invoice image. Nothing in here
// touches the DOM, the network or the database: it turns the order rows the
// admin already has on screen into the numbers/text the renderer draws, so
// the figures on the invoice are exactly the ones stored on the order
// (orders.subtotal / packaging_fee / shipping_cost / total_price) and are
// never recomputed from catalog prices.
import { bundleImageAt, parseBundleMeta } from "./bundle-meta";
import { parseBundleTitle } from "./order-whatsapp";

export type InvoiceOrderRow = {
  id: string;
  order_number?: string | null;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  poster_title: string | null;
  poster_image: string | null;
  /** Bundle rows keep their posters (id/title/image) here — see bundle-meta.ts. */
  notes?: string | null;
  subtotal?: number | string | null;
  packaging_fee?: number | string | null;
  shipping_cost?: number | string | null;
  total_price?: number | string | null;
  status: string;
  payment_method: string;
  payment_status?: string | null;
  created_at: string;
};

export type InvoicePhotoOrder = { label: string; totalPrice: number | string | null };

/** Image sources resolved by the caller (the admin drawer). */
export type InvoiceImageLookup = {
  /** rowId → the row's own usable image (stored URL or resolved custom upload). */
  own: Record<string, string | null | undefined>;
  /** poster name → catalog image, matched by name (see resolveOrderPosterImagesAdmin). */
  catalog: Record<string, string>;
};

export type InvoiceItem = {
  key: string;
  title: string;
  isBundle: boolean;
  isTape: boolean;
  size: string;
  frameType: string;
  frameColor: string;
  quantity: number;
  /** Net line amount (after any bundle discount), in cents; null when unknown. */
  lineCents: number | null;
  /** Per-unit amount in cents (line / quantity); null when unknown. */
  unitCents: number | null;
  /** Main image URL (single poster, or the bundle's first poster). */
  imageUrl: string | null;
  /** Bundle only: every poster in the bundle with its image, when one is known. */
  posters: { name: string; imageUrl: string | null }[];
};

export type InvoiceModel = {
  orderLabel: string;
  createdAt: Date;
  customer: { name: string; phone: string; governorate: string; address: string };
  items: InvoiceItem[];
  photoLines: { label: string; cents: number }[];
  subtotalCents: number;
  packagingCents: number;
  shippingCents: number;
  /** Sum of the stored row totals (+ photo orders). */
  totalCents: number;
  /** True when some row had no total/subtotal and the total is a lower bound. */
  totalIncomplete: boolean;
  paymentMethod: string;
  paymentStatus: string | null;
  status: string;
  /** Cancelled / returned: the invoice is stamped and not presented as a live order. */
  voided: boolean;
};

const TAPE_TITLE = "Double Face Tape";

export function toCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "1,250" or "1,250.50" — no trailing ".00", never a float artefact. */
export function formatEgp(cents: number | null): string {
  if (cents === null) return "—";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = frac === 0 ? wholeStr : `${wholeStr}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${out}` : out;
}

export function containsArabic(s: string | null | undefined): boolean {
  return !!s && /\p{Script=Arabic}/u.test(s);
}

export function isVoidedStatus(status: string): boolean {
  return /^(cancel|return|refund)/i.test(status.trim());
}

function usableUrl(u: string | null | undefined): string | null {
  return u && /^https?:\/\//.test(u) ? u : null;
}

export function buildInvoiceModel(
  rows: InvoiceOrderRow[],
  opts: {
    orderLabel: string;
    images?: InvoiceImageLookup;
    photoOrders?: InvoicePhotoOrder[];
  },
): InvoiceModel {
  const first = rows[0];
  const images = opts.images ?? { own: {}, catalog: {} };
  let subtotalCents = 0;
  let packagingCents = 0;
  let shippingCents = 0;
  let totalCents = 0;
  let totalIncomplete = false;

  const items: InvoiceItem[] = rows.map((r) => {
    const sub = toCents(r.subtotal);
    const pack = toCents(r.packaging_fee) ?? 0;
    const ship = toCents(r.shipping_cost) ?? 0;
    const stored = toCents(r.total_price);
    // The line amount is the net subtotal; if that was never recorded it is
    // the stored total minus the fees that are shown separately.
    const lineCents = sub ?? (stored !== null ? stored - pack - ship : null);
    const rowTotal = stored ?? (sub !== null ? sub + pack + ship : null);
    if (rowTotal === null) totalIncomplete = true;
    subtotalCents += lineCents ?? 0;
    packagingCents += pack;
    shippingCents += ship;
    totalCents += rowTotal ?? 0;

    const qty = Math.max(1, Number(r.quantity) || 1);
    const bundle = parseBundleTitle(r.poster_title);
    const own = usableUrl(images.own[r.id]) ?? usableUrl(r.poster_image);
    const isTape = (r.poster_title ?? "").trim() === TAPE_TITLE;
    const meta = bundle.isBundle ? parseBundleMeta(r.notes) : null;
    const posters = bundle.isBundle
      ? bundle.posterNames.map((name, idx) => ({
          name,
          // The poster the customer actually picked (stored with the order) wins;
          // then the row's own image (first poster); then a name match.
          imageUrl:
            usableUrl(bundleImageAt(meta, bundle.posterNames, idx)) ??
            (idx === 0 ? own : null) ??
            usableUrl(images.catalog[name]),
        }))
      : [];
    const title = bundle.isBundle ? bundle.label : r.poster_title?.trim() || "Item";
    return {
      key: r.id,
      title,
      isBundle: bundle.isBundle,
      isTape,
      size: bundle.isBundle ? (bundle.size ?? r.size) : r.size,
      frameType: r.frame_type,
      frameColor: r.frame_color,
      quantity: qty,
      lineCents,
      unitCents: lineCents === null ? null : Math.round(lineCents / qty),
      imageUrl: isTape
        ? null
        : bundle.isBundle
          ? (posters[0]?.imageUrl ?? null)
          : (own ?? usableUrl(images.catalog[title])),
      posters,
    };
  });

  const photoLines = (opts.photoOrders ?? []).map((p) => ({
    label: p.label,
    cents: toCents(p.totalPrice) ?? 0,
  }));
  for (const p of photoLines) {
    totalCents += p.cents;
    subtotalCents += p.cents;
  }

  return {
    orderLabel: opts.orderLabel,
    createdAt: new Date(first.created_at),
    customer: {
      name: first.customer_name,
      phone: first.phone,
      governorate: first.governorate,
      address: first.address,
    },
    items,
    photoLines,
    subtotalCents,
    packagingCents,
    shippingCents,
    totalCents,
    totalIncomplete,
    paymentMethod: first.payment_method,
    paymentStatus: first.payment_status ?? null,
    status: first.status,
    voided: isVoidedStatus(first.status),
  };
}

/** Safe file name stem for downloads: letters/digits/Arabic kept, the rest dashed. */
export function safeFileStem(s: string, fallback = "file"): string {
  const cleaned = s
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

/**
 * A URL that makes the browser download the file instead of showing it.
 * Cloudinary delivers this natively (`fl_attachment`) with CORS and without
 * any server of ours in the path; other hosts are returned unchanged and the
 * caller falls back to fetching the bytes itself.
 */
export function cloudinaryDownloadUrl(url: string, stem: string): string | null {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1 || !/^https:\/\/res\.cloudinary\.com\//.test(url)) return null;
  const head = url.slice(0, at + marker.length);
  const tail = url.slice(at + marker.length);
  // Cloudinary only takes a plain ASCII name in the flag, so Arabic titles
  // fall back to the generic stem rather than risk a 400 on the whole image.
  const ascii =
    stem
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "poster";
  return `${head}fl_attachment:${ascii}/${tail}`;
}
