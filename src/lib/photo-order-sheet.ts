// Pure helpers for photo-printing orders: the WhatsApp confirmation text and
// the data behind the combined "order sheet" image (all the customer's photos
// on one page with the order details), mirroring what framed-poster orders get.
import { toCents } from "./order-invoice";
import { photoUnitPrice, type LoosePhotoSize } from "./photo-volume-pricing";

export type PhotoOrderLike = {
  id: string;
  order_number: string | null;
  /** Which table the order lives in (not what the customer bought — see isLooseSize). */
  kind: "photo_4x6" | "photo_printing";
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  /** "size_10x15" for a per-photo size, or a package key for a retired package. */
  detail: string;
  quantity: number;
  total_price: number | string;
  status: string;
  photos: string[];
  created_at: string;
  selected_albums?: Array<{ name: string; qty: number }> | null;
  albums_total?: number | string | null;
  payment_method?: string | null;
  /** Price breakdown, when it can be told exactly (see derivePhotoBreakdown). */
  subtotal?: number | null;
  shipping?: number | null;
};

export const PHOTO_PAYMENT_LABEL: Record<string, { en: string; ar: string }> = {
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
  instapay: { en: "InstaPay", ar: "إنستا باي" },
  vodafone_cash: { en: "Vodafone Cash", ar: "فودافون كاش" },
};

/** A per-photo size order ("size_10x15") — everything customers can buy today. */
export function isLooseSize(detail: string): boolean {
  return detail.startsWith("size_");
}

/**
 * What the customer bought: a per-photo size ("10×15 cm") or, for older
 * orders, a fixed package. The 4×6 table name is an implementation detail and
 * is never shown as the product (10×15 cm IS the 4×6 inch print).
 */
export function photoKindLabel(detail: string): { en: string; ar: string } {
  return isLooseSize(detail)
    ? { en: "Photo Printing", ar: "طباعة صور" }
    : { en: "Photo package", ar: "باقة صور" };
}

/** "size_10x15" → "10×15 cm"; a package key is shown as is. */
export function photoDetailLabel(detail: string): string {
  return isLooseSize(detail) ? `${detail.slice(5).replace(/x/gi, "×")} cm` : detail;
}

/** Label for the detail line: "Size · المقاس" or "Package · الباقة". */
export function photoDetailTitle(detail: string): string {
  return isLooseSize(detail) ? "Size · المقاس" : "Package · الباقة";
}

export function photoCount(o: PhotoOrderLike): number {
  return o.photos.length > 0 ? o.photos.length : Math.max(0, Number(o.quantity) || 0);
}

/** "10 Oct 2026, 04:37" — the date shown next to every order. */
export function formatOrderDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

// ---- price breakdown --------------------------------------------------------
export type PhotoPriceSettings = {
  prices: Partial<Record<LoosePhotoSize, number>>;
  shippingFee: number;
  freeThreshold: number;
  packages?: Array<{ key: string; photos: number; price: number }>;
};

export type PhotoBreakdown = { subtotal: number; shipping: number };

/**
 * The orders store only a grand total (+ albums). The subtotal / shipping split
 * is rebuilt from the price list and ACCEPTED ONLY WHEN IT RECONCILES: shipping
 * must come out as exactly 0 (free or paid with the frames) or the shipping fee.
 * If prices changed since the order, nothing is shown rather than a wrong figure.
 */
export function derivePhotoBreakdown(
  o: {
    detail: string;
    quantity: number;
    total_price: number | string;
    albums_total?: number | string | null;
  },
  s: PhotoPriceSettings,
): PhotoBreakdown | null {
  const total = Number(o.total_price);
  const albums = Number(o.albums_total) || 0;
  const qty = Number(o.quantity) || 0;
  if (!Number.isFinite(total) || qty <= 0) return null;
  let subtotal: number | null = null;
  if (isLooseSize(o.detail)) {
    const size = o.detail.slice(5) as LoosePhotoSize;
    const base = s.prices[size];
    if (typeof base === "number" && base > 0) subtotal = photoUnitPrice(size, qty, base) * qty;
  } else {
    const pkg = s.packages?.find((p) => p.key === o.detail);
    if (pkg && pkg.photos > 0) {
      const extra = Math.max(0, qty - pkg.photos);
      subtotal = pkg.price + extra * Math.ceil(pkg.price / pkg.photos);
    }
  }
  if (subtotal === null) return null;
  const shipping = Math.round((total - albums - subtotal) * 100) / 100;
  if (Math.abs(shipping) < 0.5) return { subtotal, shipping: 0 };
  if (Math.abs(shipping - s.shippingFee) < 0.5) return { subtotal, shipping: s.shippingFee };
  return null;
}

// ---- WhatsApp confirmation --------------------------------------------------
/**
 * The same confirmation a framed-poster order gets (greeting, order number,
 * what was ordered, price breakdown, total, customer data, address, and the
 * "please confirm" request), written for a photo-printing order.
 */
export function buildPhotoConfirmationMessage(o: PhotoOrderLike): string {
  const kind = photoKindLabel(o.detail).ar;
  const pay = PHOTO_PAYMENT_LABEL[o.payment_method ?? "cod"]?.ar ?? "الدفع عند الاستلام";
  const total = Math.round(Number(o.total_price) || 0);
  const count = photoCount(o);
  const albums = (o.selected_albums ?? []).filter((a) => a && a.name);
  const albumsTotal = Number(o.albums_total) || 0;

  const lines: string[] = [];
  lines.push(`• النوع: ${kind}`);
  lines.push(`• ${isLooseSize(o.detail) ? "المقاس" : "الباقة"}: ‎${photoDetailLabel(o.detail)}‎`);
  lines.push(`• عدد الصور: ${count}`);
  if (o.subtotal != null && count > 0 && isLooseSize(o.detail)) {
    lines.push(`• سعر الصورة: ${Math.round((o.subtotal / count) * 100) / 100} جنيه`);
  }
  if (albums.length)
    lines.push(`• ألبومات: ${albums.map((a) => `${a.name} ×${a.qty}`).join("، ")}`);
  lines.push(`• الدفع: ${pay}`);

  const priceLines: string[] = [];
  if (o.subtotal != null) priceLines.push(`الإجمالي الفرعي: ${Math.round(o.subtotal)} جنيه`);
  if (albumsTotal > 0) priceLines.push(`الألبومات: ${Math.round(albumsTotal)} جنيه`);
  if (o.shipping != null) {
    priceLines.push(`الشحن: ${o.shipping > 0 ? `${Math.round(o.shipping)} جنيه` : "مجاني"}`);
  }
  const priceBlock = priceLines.length ? `${priceLines.join("\n")}\n` : "";

  return (
    `مرحباً ${o.customer_name} 👋\n` +
    `تم استلام طلبك من BRWAZWNEON ❤️\n\n` +
    `📦 تفاصيل الطلب #${o.order_number ?? o.id.slice(0, 8)}:\n\n${lines.join("\n")}\n\n` +
    `💰 ${priceBlock}الإجمالي: ${total} جنيه\n\n` +
    `👤 بيانات العميل:\n📱 الهاتف: ${o.phone}\n📍 العنوان:\n${o.governorate} — ${o.address}\n\n` +
    `من فضلك أكد لنا إن كل البيانات تمام، وإن الصور والمقاسات صحيحة، عشان نبدأ تجهيز الأوردر للطباعة ✅\n\n` +
    `شكراً لاختيارك BRWAZWNEON ❤️`
  );
}

// ---- combined order image ---------------------------------------------------
export type PhotoSheetModel = {
  orderLabel: string;
  createdAt: Date;
  kindLabel: string;
  customer: { name: string; phone: string; governorate: string; address: string };
  detailTitle: string;
  detail: string;
  count: number;
  totalCents: number;
  subtotalCents: number | null;
  albumsCents: number;
  shippingCents: number | null;
  paymentLabel: string;
  albums: string[];
  photos: string[];
  voided: boolean;
  status: string;
};

export function buildPhotoSheetModel(o: PhotoOrderLike): PhotoSheetModel {
  const kind = photoKindLabel(o.detail);
  const pay = PHOTO_PAYMENT_LABEL[o.payment_method ?? "cod"];
  return {
    orderLabel: o.order_number ?? o.id.slice(0, 8),
    createdAt: new Date(o.created_at),
    kindLabel: `${kind.en} · ${kind.ar}`,
    customer: {
      name: o.customer_name,
      phone: o.phone,
      governorate: o.governorate,
      address: o.address,
    },
    detailTitle: photoDetailTitle(o.detail),
    detail: photoDetailLabel(o.detail),
    count: photoCount(o),
    totalCents: toCents(o.total_price) ?? 0,
    subtotalCents: o.subtotal != null ? toCents(o.subtotal) : null,
    albumsCents: toCents(o.albums_total) ?? 0,
    shippingCents: o.shipping != null ? toCents(o.shipping) : null,
    paymentLabel: pay ? `${pay.en} · ${pay.ar}` : "Cash on delivery · الدفع عند الاستلام",
    albums: (o.selected_albums ?? []).filter((a) => a && a.name).map((a) => `${a.name} ×${a.qty}`),
    photos: o.photos.filter((u) => /^https?:\/\//.test(u)),
    voided: /^(cancel|return|refund)/i.test(o.status),
    status: o.status,
  };
}

/** Columns for the photo grid: bigger tiles for a few photos, smaller for many. */
export function photoGridColumns(n: number): number {
  if (n <= 6) return 3;
  if (n <= 12) return 4;
  if (n <= 30) return 5;
  return 6;
}
