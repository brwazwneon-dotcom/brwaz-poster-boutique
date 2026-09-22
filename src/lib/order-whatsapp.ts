// Pure, framework-agnostic order-confirmation logic — templates, timeline
// stage labels, WhatsApp link building. Adapted from the old (Supabase-only,
// never wired) src/lib/order-management.ts: same behavior, but with the
// `import { supabase } from "@/integrations/supabase/client"` removed —
// that import eagerly creates a Supabase client at module load, which this
// Neon-only admin must never pull in just to reuse a string template (see
// ProductsTab.tsx's identical reasoning for not importing src/lib/ai-review.ts
// directly). Safe to import from both client components and server functions.

export const TIMELINE_STAGES: { key: string; label: string }[] = [
  { key: "order_created", label: "Order Created" },
  { key: "customer_details_added", label: "Customer Details Added" },
  { key: "images_uploaded", label: "Images Uploaded" },
  { key: "validation_started", label: "Order Validation Started" },
  { key: "needs_review", label: "Order Needs Review" },
  { key: "order_confirmed", label: "Order Confirmed" },
  { key: "whatsapp_message_prepared", label: "WhatsApp Message Prepared" },
  { key: "whatsapp_confirmation_sent", label: "WhatsApp Confirmation Sent" },
  { key: "customer_rejected", label: "Customer Rejected" },
  { key: "waiting_for_response", label: "Waiting For Response" },
  { key: "sent_to_design", label: "Sent to Design" },
  { key: "sent_to_printing", label: "Sent to Printing" },
  { key: "ready_for_shipping", label: "Ready for Shipping" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  TIMELINE_STAGES.map((s) => [s.key, s.label]),
);

const EXTRA_LABELS: Record<string, string> = {
  status_changed: "Status Changed",
  note_added: "Internal Note Added",
  note_updated: "Internal Note Updated",
  note_deleted: "Internal Note Deleted",
  whatsapp_copied: "WhatsApp Message Copied",
  whatsapp_opened: "WhatsApp Opened",
  admin_viewed: "Admin Opened Order",
  payment_paid: "Payment Verified",
  payment_rejected: "Payment Proof Rejected",
  payment_pending: "Payment Set To Pending",
};

export function humanStage(stage: string) {
  return STAGE_LABEL[stage] ?? EXTRA_LABELS[stage] ?? stage.replace(/_/g, " ");
}

// ------------------ CONFIRMATION STATUS ------------------
export type ConfirmationStatus =
  | "not_sent"
  | "prepared"
  | "sent"
  | "customer_confirmed"
  | "customer_rejected"
  | "waiting_for_response";

export const CONFIRMATION_STATUS_LABEL: Record<ConfirmationStatus, string> = {
  not_sent: "⏳ NOT SENT",
  prepared: "📤 MESSAGE PREPARED",
  sent: "📨 SENT",
  customer_confirmed: "✅ CUSTOMER CONFIRMED",
  customer_rejected: "❌ CUSTOMER REJECTED",
  waiting_for_response: "⚠️ WAITING FOR RESPONSE",
};

// ------------------ WHATSAPP TEMPLATES ------------------
export type WhatsAppTemplateKey =
  "confirmation" | "better_image" | "printing" | "shipped" | "review";

export const WHATSAPP_TEMPLATES: { key: WhatsAppTemplateKey; title: string; icon: string }[] = [
  { key: "confirmation", title: "Order Confirmation", icon: "✅" },
  { key: "better_image", title: "Request Better Image", icon: "🖼️" },
  { key: "printing", title: "Order In Printing", icon: "🖨️" },
  { key: "shipped", title: "Order Shipped", icon: "🚚" },
  { key: "review", title: "Ask for Review", icon: "⭐" },
];

type TemplateItem = {
  poster_title?: string | null;
  frame_type?: string | null;
  frame_color?: string | null;
  size?: string | null;
  quantity?: number | null;
  /** This row's own price (already the line total for its quantity — the
   *  `orders` table stores one price per row, not a separate unit price). */
  price?: number | null;
};

type TemplateOrder = {
  customer_name: string;
  phone?: string | null;
  primaryNumber: string;
  governorate: string;
  address: string;
  total: number;
  /** Optional price breakdown — shown only when the caller actually has it,
   *  never guessed. There is no discount/coupon column on `orders` today
   *  (see neon/migrations/014_coupons.sql's own comment: coupons aren't
   *  wired into checkout yet), so this only ever renders when a future
   *  caller actually has a real figure to pass — never fabricated here. */
  subtotal?: number | null;
  packaging?: number | null;
  shipping?: number | null;
  discount?: number | null;
  items: TemplateItem[];
};

// A "4 Frames Bundle" checkout is saved as ONE `orders` row (one shared
// frame/size, one blended price) whose poster_title packs every included
// poster's name into a single string — see createOrderRows / the /offers
// checkout path. There's no per-poster price or image for a bundle row, so
// this only recovers the poster NAMES already sitting in that string; it
// never invents a price, a name, or picks an image that isn't there.
const BUNDLE_HEAD_RE = /^(\d+)\s+Frames?\s+Bundle\b/i;
// Any run of separator-ish characters — duplicated ("·· ——"), a colon, a
// bare space, whatever the checkout string happens to use.
const SEP_RUN_RE = /[\s·:\-—]+/;
// The LAST single dash/colon character with no other one after it — that's
// where the size ends and the poster list begins, when a size is present.
const LAST_SEP_RE = /[—\-:](?!.*[—\-:])/;

// A name that lost its closing "(" while the checkout built this string
// (a real, observed bug — see the production example below) gets its
// bracket balanced back for display. This only repairs trailing
// punctuation on the text that's already there; it never adds or guesses
// at the poster's actual name.
function balanceParens(s: string): string {
  const opens = (s.match(/\(/g) || []).length;
  const closes = (s.match(/\)/g) || []).length;
  return opens > closes ? s + ")".repeat(opens - closes) : s;
}

export type BundleTitleParts = {
  isBundle: boolean;
  /** "4 Frames Bundle" */
  label: string;
  /** "30 × 40 cm", when present in the title. */
  size: string | null;
  /** Individual poster names, recovered from the packed string and
   *  punctuation-normalized (see balanceParens) — never invented. */
  posterNames: string[];
};

// Tolerates: a missing closing "(" on a name (real prod example: "4 Frames
// Bundle · 30 × 40 cm — Game Of Thrones (111, JOKER (26), Download (28),
// Viking (8)"), a missing size segment, no separator at all before the
// names, a colon instead of a dash, doubled/mixed separator runs, extra or
// trailing commas, and irregular spacing — all without inventing a poster
// name that isn't in the stored string.
export function parseBundleTitle(title: string | null | undefined): BundleTitleParts {
  const raw = (title ?? "").trim();
  const head = raw.match(BUNDLE_HEAD_RE);
  if (!head) return { isBundle: false, label: raw, size: null, posterNames: [] };
  const count = head[1];
  const rest = raw
    .slice(head[0].length)
    .replace(new RegExp(`^${SEP_RUN_RE.source}`), "")
    .trim();
  const lastSep = rest.search(LAST_SEP_RE);
  let size: string | null = null;
  let namesPart = rest;
  if (lastSep !== -1) {
    size =
      rest
        .slice(0, lastSep)
        .replace(new RegExp(`${SEP_RUN_RE.source}$`), "")
        .trim() || null;
    namesPart = rest.slice(lastSep + 1);
  }
  namesPart = namesPart.replace(new RegExp(`^${SEP_RUN_RE.source}`), "");
  const posterNames = namesPart
    .split(/,+/)
    .map((s) => balanceParens(s.trim().replace(/\s{2,}/g, " ")))
    .filter(Boolean);
  return { isBundle: true, label: `${count} Frames Bundle`, size, posterNames };
}

function itemLine(i: TemplateItem, idx: number): string {
  const parts = [
    i.size ? `• المقاس: ${i.size}` : null,
    i.frame_type ? `• الخامة: ${i.frame_type}` : null,
    i.frame_color ? `• اللون: ${i.frame_color}` : null,
    `• الكمية: ${i.quantity ?? 1}`,
    i.price != null ? `• السعر: ${Math.round(Number(i.price))} جنيه` : null,
  ].filter(Boolean);
  const bundle = parseBundleTitle(i.poster_title);
  const title = bundle.isBundle ? bundle.label : i.poster_title || "منتج";
  const bundleList = bundle.isBundle
    ? bundle.posterNames.map((n, ni) => `   ${ni + 1}. ${n}`).join("\n") + "\n"
    : "";
  return `${idx + 1}️⃣ ${title}\n${bundleList}${parts.join("\n")}`;
}

export function buildWhatsAppTemplate(key: WhatsAppTemplateKey, g: TemplateOrder): string {
  const items = g.items.map(itemLine).join("\n\n");
  switch (key) {
    case "confirmation": {
      const priceLines = [
        g.subtotal != null ? `الإجمالي الفرعي: ${Math.round(g.subtotal)} جنيه` : null,
        g.packaging ? `التغليف: ${Math.round(g.packaging)} جنيه` : null,
        g.shipping != null
          ? `الشحن: ${g.shipping > 0 ? `${Math.round(g.shipping)} جنيه` : "مجاني"}`
          : null,
        g.discount ? `الخصم: -${Math.round(g.discount)} جنيه` : null,
      ].filter(Boolean);
      const priceBlock = priceLines.length ? `${priceLines.join("\n")}\n` : "";
      const phoneLine = g.phone ? `📱 الهاتف: ${g.phone}\n` : "";
      return (
        `مرحباً ${g.customer_name} 👋\n` +
        `تم استلام طلبك من BRWAZWNEON ❤️\n\n` +
        `📦 تفاصيل الطلب #${g.primaryNumber}:\n\n${items}\n\n` +
        `💰 ${priceBlock}الإجمالي: ${Math.round(g.total)} جنيه\n\n` +
        `👤 بيانات العميل:\n${phoneLine}📍 العنوان:\n${g.governorate} — ${g.address}\n\n` +
        `من فضلك أكد لنا إن كل البيانات تمام، وإن الصور والمقاسات صحيحة، عشان نبدأ تجهيز الأوردر للطباعة ✅\n\n` +
        `شكراً لاختيارك BRWAZWNEON ❤️`
      );
    }
    case "better_image":
      return (
        `أهلًا يا ${g.customer_name} 👋\n` +
        `راجعنا الصور الخاصة بالأوردر رقم #${g.primaryNumber}، وفي صورة أو أكثر محتاجة جودة أعلى عشان تطلع نتيجة الطباعة بأفضل شكل.\n\n` +
        `من فضلك ابعتلنا الصورة بجودة أوضح على نفس الشات ❤️`
      );
    case "printing":
      return (
        `أهلًا يا ${g.customer_name} ❤️\n` +
        `بنأكد لحضرتك إن الأوردر رقم #${g.primaryNumber} دخل مرحلة الطباعة حاليًا ✅\n` +
        `وهنبلغ حضرتك أول ما يكون جاهز للشحن.`
      );
    case "shipped":
      return (
        `أهلًا يا ${g.customer_name} 👋\n` +
        `الأوردر رقم #${g.primaryNumber} تم شحنه بنجاح ✅\n\n` +
        `العنوان:\n${g.governorate} — ${g.address}\n\n` +
        `من فضلك خليك متابع مع شركة الشحن، وشكرًا لثقتك في Brwaz W Neon ❤️`
      );
    case "review":
      return (
        `أهلًا يا ${g.customer_name} ❤️\n` +
        `نتمنى يكون الأوردر عجب حضرتك.\n` +
        `رأيك يهمنا جدًا، ياريت تبعتلنا تقييمك أو صورة للبرواز بعد الاستلام 🙏`
      );
  }
}

export function waLink(phone: string, message: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits || digits.length < 10) return null;
  const intl = digits.startsWith("20") ? digits : digits.startsWith("0") ? `2${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export const QUICK_NOTES = [
  "تم التواصل واتساب",
  "مستني تأكيد العميل",
  "محتاج صورة أوضح",
  "جاهز للطباعة",
  "تم تأكيد العنوان",
  "العميل مستعجل",
];
