import { supabase } from "@/integrations/supabase/client";

export type TimelineEvent = {
  id: string;
  order_id: string;
  stage: string;
  status: "completed" | "pending" | "failed" | string;
  actor: string | null;
  note: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type InternalNote = {
  id: string;
  order_id: string;
  text: string;
  pinned: boolean;
  author: string | null;
  created_at: string;
  updated_at: string;
};

export const TIMELINE_STAGES: { key: string; label: string }[] = [
  { key: "order_created", label: "Order Created" },
  { key: "customer_details_added", label: "Customer Details Added" },
  { key: "images_uploaded", label: "Images Uploaded" },
  { key: "validation_started", label: "Order Validation Started" },
  { key: "needs_review", label: "Order Needs Review" },
  { key: "order_confirmed", label: "Order Confirmed" },
  { key: "whatsapp_confirmation_sent", label: "WhatsApp Confirmation Sent" },
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

// Fallback labels for auto-logged stages
const EXTRA_LABELS: Record<string, string> = {
  status_changed: "Status Changed",
  note_added: "Internal Note Added",
  note_updated: "Internal Note Updated",
  note_deleted: "Internal Note Deleted",
  whatsapp_copied: "WhatsApp Copied",
  whatsapp_opened: "WhatsApp Opened",
  whatsapp_marked_sent: "WhatsApp Marked as Sent",
  order_check_run: "Order Check Run",
};

export function humanStage(stage: string) {
  return STAGE_LABEL[stage] ?? EXTRA_LABELS[stage] ?? stage.replace(/_/g, " ");
}

export async function fetchTimeline(orderIds: string[]): Promise<TimelineEvent[]> {
  if (!orderIds.length) return [];
  const { data, error } = await supabase
    .from("order_timeline" as never)
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TimelineEvent[];
}

export async function logTimeline(
  orderId: string,
  stage: string,
  opts: { status?: string; actor?: string; note?: string; meta?: Record<string, unknown> } = {},
) {
  const { error } = await supabase.from("order_timeline" as never).insert({
    order_id: orderId,
    stage,
    status: opts.status ?? "completed",
    actor: opts.actor ?? "admin",
    note: opts.note ?? null,
    meta: opts.meta ?? {},
  } as never);
  if (error) console.warn("[timeline]", error.message);
}

export async function fetchNotes(orderIds: string[]): Promise<InternalNote[]> {
  if (!orderIds.length) return [];
  const { data, error } = await supabase
    .from("order_notes" as never)
    .select("*")
    .in("order_id", orderIds)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InternalNote[];
}

export async function addNote(orderId: string, text: string, author?: string) {
  const { error } = await supabase.from("order_notes" as never).insert({
    order_id: orderId,
    text,
    author: author ?? "admin",
  } as never);
  if (error) throw error;
  await logTimeline(orderId, "note_added", { note: text.slice(0, 120) });
}

export async function updateNote(id: string, patch: Partial<Pick<InternalNote, "text" | "pinned">>, orderId: string) {
  const { error } = await supabase.from("order_notes" as never).update(patch as never).eq("id", id);
  if (error) throw error;
  await logTimeline(orderId, "note_updated");
}

export async function deleteNote(id: string, orderId: string) {
  const { error } = await supabase.from("order_notes" as never).delete().eq("id", id);
  if (error) throw error;
  await logTimeline(orderId, "note_deleted");
}

// ------------------ VALIDATION ------------------
export type CheckResult = "passed" | "warning" | "failed";

export type OrderCheck = {
  overall: "ready" | "needs_review";
  groups: {
    customer: CheckResult;
    phone: CheckResult;
    address: CheckResult;
    images: CheckResult;
    products: CheckResult;
    pricing: CheckResult;
    whatsapp: CheckResult;
  };
  issues: string[];
};

type LiteItem = {
  id: string;
  poster_image?: string | null;
  poster_title?: string | null;
  size?: string | null;
  quantity?: number | null;
  total_price?: number | null;
};

type LiteGroup = {
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  items: LiteItem[];
  total: number;
  subtotal: number;
  shipping: number;
};

export function validateOrder(g: LiteGroup): OrderCheck {
  const issues: string[] = [];
  const groups: OrderCheck["groups"] = {
    customer: "passed",
    phone: "passed",
    address: "passed",
    images: "passed",
    products: "passed",
    pricing: "passed",
    whatsapp: "passed",
  };

  if (!g.customer_name?.trim()) {
    groups.customer = "failed";
    issues.push("Customer name is missing");
  }

  const digits = (g.phone ?? "").replace(/\D/g, "");
  if (!digits) {
    groups.phone = "failed";
    groups.whatsapp = "failed";
    issues.push("Phone number is missing");
  } else if (digits.length < 10 || digits.length > 13) {
    groups.phone = "failed";
    groups.whatsapp = "failed";
    issues.push("Phone number is not valid");
  } else if (!/^(?:20)?01[0-9]{9}$/.test(digits)) {
    groups.phone = "warning";
    groups.whatsapp = "warning";
    issues.push("Phone number format may not be WhatsApp-ready");
  }

  if (!g.governorate?.trim()) {
    groups.address = "failed";
    issues.push("Governorate is missing");
  }
  if (!g.address?.trim() || g.address.trim().length < 8) {
    groups.address = groups.address === "failed" ? "failed" : "warning";
    issues.push("Address looks incomplete");
  }

  if (!g.items.length) {
    groups.products = "failed";
    groups.images = "failed";
    issues.push("Order has no products");
  } else {
    g.items.forEach((it, idx) => {
      const n = idx + 1;
      if (!it.size) { groups.products = "failed"; issues.push(`Item ${n}: size is missing`); }
      if (!it.quantity || it.quantity <= 0) { groups.products = "failed"; issues.push(`Item ${n}: quantity is invalid`); }
      if (!it.poster_image) { groups.images = groups.images === "failed" ? "failed" : "warning"; issues.push(`Item ${n}: image is missing`); }
    });
  }

  if (!g.total || g.total <= 0) { groups.pricing = "failed"; issues.push("Total price is not calculated"); }
  if (g.shipping < 0) { groups.pricing = "failed"; issues.push("Shipping cost is invalid"); }

  const overall: OrderCheck["overall"] =
    Object.values(groups).some((v) => v === "failed") ? "needs_review" : "ready";

  return { overall, groups, issues };
}

// ------------------ WHATSAPP TEMPLATES ------------------
export type WhatsAppTemplateKey =
  | "confirmation"
  | "better_image"
  | "printing"
  | "shipped"
  | "review";

export const WHATSAPP_TEMPLATES: { key: WhatsAppTemplateKey; title: string; icon: string }[] = [
  { key: "confirmation", title: "Order Confirmation", icon: "✅" },
  { key: "better_image", title: "Request Better Image", icon: "🖼️" },
  { key: "printing", title: "Order In Printing", icon: "🖨️" },
  { key: "shipped", title: "Order Shipped", icon: "🚚" },
  { key: "review", title: "Ask for Review", icon: "⭐" },
];

export function buildWhatsAppTemplate(
  key: WhatsAppTemplateKey,
  g: {
    customer_name: string;
    primaryNumber: string;
    governorate: string;
    address: string;
    total: number;
    items: LiteItem[];
  },
): string {
  const items = g.items
    .map((i, idx) => `${idx + 1}) ${i.poster_title || "منتج"} — ${i.size ?? ""} · الكمية: ${i.quantity ?? 1}`)
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