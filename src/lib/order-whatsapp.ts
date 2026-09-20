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
  size?: string | null;
  quantity?: number | null;
};

type TemplateOrder = {
  customer_name: string;
  primaryNumber: string;
  governorate: string;
  address: string;
  total: number;
  items: TemplateItem[];
};

export function buildWhatsAppTemplate(key: WhatsAppTemplateKey, g: TemplateOrder): string {
  const items = g.items
    .map(
      (i, idx) =>
        `${idx + 1}) ${i.poster_title || "منتج"} — ${i.size ?? ""} · الكمية: ${i.quantity ?? 1}`,
    )
    .join("\n");
  switch (key) {
    case "confirmation":
      return (
        `أهلًا بحضرتك يا ${g.customer_name} 👋\n` +
        `معاك فريق Brwaz W Neon ❤️\n\n` +
        `حابين نأكد مع حضرتك تفاصيل الأوردر رقم #${g.primaryNumber}:\n\n${items}\n\n` +
        `العنوان:\n${g.governorate} — ${g.address}\n\n` +
        `إجمالي الطلب:\n${Math.round(g.total)} جنيه\n\n` +
        `من فضلك أكد لنا إن كل البيانات تمام، وإن الصور والمقاسات صحيحة، عشان نبدأ تجهيز الأوردر للطباعة ✅`
      );
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
