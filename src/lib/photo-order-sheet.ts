// Pure helpers for photo-printing orders: the WhatsApp confirmation text and
// the data behind the combined "order sheet" image (all the customer's photos
// on one page with the order details), mirroring what framed-poster orders get.
import { toCents } from "./order-invoice";

export type PhotoOrderLike = {
  id: string;
  order_number: string | null;
  kind: "photo_4x6" | "photo_printing";
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  detail: string;
  quantity: number;
  total_price: number | string;
  status: string;
  photos: string[];
  created_at: string;
  selected_albums?: Array<{ name: string; qty: number }> | null;
  payment_method?: string | null;
};

export const PHOTO_KIND_LABEL: Record<PhotoOrderLike["kind"], { en: string; ar: string }> = {
  photo_4x6: { en: "4×6 Printing", ar: "طباعة \u200E4×6\u200E" },
  photo_printing: { en: "Photo Printing", ar: "طباعة صور" },
};

export const PHOTO_PAYMENT_LABEL: Record<string, { en: string; ar: string }> = {
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
  instapay: { en: "InstaPay", ar: "إنستا باي" },
  vodafone_cash: { en: "Vodafone Cash", ar: "فودافون كاش" },
};

/** "package_key" / size detail → something a customer recognises ("size_10x15" → "10x15"). */
export function photoDetailLabel(detail: string): string {
  return detail.startsWith("size_") ? detail.slice(5) : detail;
}

export function photoCount(o: PhotoOrderLike): number {
  return o.photos.length > 0 ? o.photos.length : Math.max(0, Number(o.quantity) || 0);
}

/** "BRW-1234 · 10 Oct 2026, 04:37" — the date shown next to every order. */
export function formatOrderDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function buildPhotoConfirmationMessage(o: PhotoOrderLike): string {
  const kind = PHOTO_KIND_LABEL[o.kind].ar;
  const pay = PHOTO_PAYMENT_LABEL[o.payment_method ?? "cod"]?.ar ?? "الدفع عند الاستلام";
  const total = Math.round(Number(o.total_price) || 0);
  const albums = (o.selected_albums ?? []).filter((a) => a && a.name);
  const albumLine = albums.length
    ? `🖼️ ألبومات: ${albums.map((a) => `${a.name} ×${a.qty}`).join("، ")}\n`
    : "";
  return (
    `مرحباً ${o.customer_name} 👋\n` +
    `تم استلام طلب طباعة الصور من BRWAZWNEON ❤️\n\n` +
    `📦 تفاصيل الطلب #${o.order_number ?? o.id.slice(0, 8)}:\n` +
    `• النوع: ${kind}\n` +
    `• الباقة/المقاس: ${photoDetailLabel(o.detail)}\n` +
    `• عدد الصور: ${photoCount(o)}\n` +
    albumLine +
    `• الدفع: ${pay}\n\n` +
    `💰 الإجمالي: ${total} جنيه\n\n` +
    `📍 العنوان:\n${o.governorate} — ${o.address}\n\n` +
    `من فضلك أكد لنا إن الصور والمقاسات والعنوان تمام، عشان نبدأ تجهيز الطباعة ✅\n\n` +
    `شكراً لاختيارك BRWAZWNEON ❤️`
  );
}

export type PhotoSheetModel = {
  orderLabel: string;
  createdAt: Date;
  kindLabel: string;
  customer: { name: string; phone: string; governorate: string; address: string };
  detail: string;
  count: number;
  totalCents: number;
  paymentLabel: string;
  albums: string[];
  photos: string[];
  voided: boolean;
  status: string;
};

export function buildPhotoSheetModel(o: PhotoOrderLike): PhotoSheetModel {
  const kind = PHOTO_KIND_LABEL[o.kind];
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
    detail: photoDetailLabel(o.detail),
    count: photoCount(o),
    totalCents: toCents(o.total_price) ?? 0,
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
