import { supabase } from "@/integrations/supabase/client";

export type ErrorSeverity = "low" | "medium" | "high" | "critical";
export type ErrorStatus = "open" | "in_progress" | "resolved";

export type ErrorLog = {
  id: string;
  level: string;
  source: string;
  category: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  visitor_id: string | null;
  metadata: Record<string, unknown>;
  status: ErrorStatus;
  created_at: string;
};

/** Map a `level` value from system_logs to a user-facing severity chip. */
export function levelToSeverity(level: string): ErrorSeverity {
  if (level === "critical") return "critical";
  if (level === "error") return "high";
  if (level === "warning") return "medium";
  return "low";
}

export const SEVERITY_STYLES: Record<ErrorSeverity, { badge: string; label: string; dot: string }> = {
  low: { badge: "bg-gray-500/15 text-gray-300 border-gray-500/30", label: "Low", dot: "bg-gray-400" },
  medium: { badge: "bg-blue-500/15 text-blue-300 border-blue-500/30", label: "Medium", dot: "bg-blue-400" },
  high: { badge: "bg-orange-500/15 text-orange-300 border-orange-500/30", label: "High", dot: "bg-orange-400" },
  critical: { badge: "bg-red-500/20 text-red-300 border-red-500/40", label: "Critical", dot: "bg-red-500" },
};

export const STATUS_STYLES: Record<ErrorStatus, { badge: string; label: string }> = {
  open: { badge: "bg-red-500/15 text-red-300 border-red-500/30", label: "Open" },
  in_progress: { badge: "bg-blue-500/15 text-blue-300 border-blue-500/30", label: "In Progress" },
  resolved: { badge: "bg-green-500/15 text-green-300 border-green-500/30", label: "Resolved" },
};

/** Human-friendly translations for common error categories/messages. */
export function humanizeError(log: ErrorLog): { title: string; description: string } {
  const cat = log.category ?? "";
  const msg = log.message.toLowerCase();

  if (cat === "upload_failed" || msg.includes("upload")) {
    return {
      title: "فشل في رفع صورة",
      description: "لم يتم رفع الصورة. قد يكون السبب اتصال إنترنت ضعيف أو حجم الصورة كبير. حاول تاني.",
    };
  }
  if (cat === "low_quality_image") {
    return {
      title: "صورة جودتها ضعيفة",
      description: "الصورة اللي اترفعت قد تظهر بجودة منخفضة عند الطباعة. يُفضل استخدام صورة أوضح.",
    };
  }
  if (msg.includes("edge function")) {
    return {
      title: "مشكلة أثناء تنفيذ العملية",
      description: "حدثت مشكلة أثناء تنفيذ العملية. قد يكون السبب اتصال قاعدة البيانات. راجع التفاصيل أو جرّب مرة أخرى.",
    };
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return { title: "خطأ في الاتصال", description: "الاتصال بالخادم فشل. تأكد من الإنترنت وحاول تاني." };
  }
  if (msg.includes("permission") || msg.includes("rls") || msg.includes("policy")) {
    return { title: "مشكلة صلاحيات", description: "الطلب اترفض بسبب صلاحيات. تحقق من إعدادات الأمان." };
  }
  if (msg.includes("payment")) {
    return { title: "مشكلة في الدفع", description: "حدثت مشكلة أثناء معالجة الدفع. راجع التفاصيل." };
  }
  if (cat === "website_error") {
    return { title: "خطأ في الموقع", description: "حصل خطأ غير متوقع في الموقع. راجع التفاصيل التقنية." };
  }
  if (cat === "database") {
    return { title: "مشكلة في قاعدة البيانات", description: "حصل خطأ أثناء حفظ أو قراءة البيانات." };
  }
  if (cat === "storage") {
    return { title: "مشكلة في التخزين", description: "حصل خطأ أثناء التعامل مع ملفات التخزين." };
  }
  if (cat === "performance") {
    return { title: "أداء بطيء", description: "تم رصد بطء في التحميل. راجع صفحة Performance Monitor." };
  }
  return {
    title: log.message.length > 80 ? log.message.slice(0, 77) + "…" : log.message,
    description: "خطأ غير مصنف. اطّلع على التفاصيل التقنية للفهم أكثر.",
  };
}

export async function fetchErrorLogs(opts?: {
  limit?: number;
  offset?: number;
  severity?: ErrorSeverity | "all";
  status?: ErrorStatus | "all";
  category?: string;
  search?: string;
}) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  let q = supabase
    .from("system_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.severity && opts.severity !== "all") {
    const levels =
      opts.severity === "critical"
        ? ["critical"]
        : opts.severity === "high"
          ? ["error"]
          : opts.severity === "medium"
            ? ["warning"]
            : ["info"];
    q = q.in("level", levels);
  }
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.search) q = q.ilike("message", `%${opts.search}%`);

  const { data, error, count } = await q;
  if (error) throw error;
  return { items: (data ?? []) as ErrorLog[], count: count ?? 0 };
}

export async function setErrorLogStatus(id: string, status: ErrorStatus) {
  const { error } = await supabase.rpc("set_error_log_status" as never, { _id: id, _status: status } as never);
  if (error) throw error;
}

export function copyErrorDetails(log: ErrorLog) {
  const text = [
    `Title: ${humanizeError(log).title}`,
    `Message: ${log.message}`,
    `Level: ${log.level}`,
    `Category: ${log.category ?? "-"}`,
    `Source: ${log.source}`,
    `URL: ${log.url ?? "-"}`,
    `Time: ${log.created_at}`,
    `Stack:`,
    log.stack ?? "-",
    `Metadata:`,
    JSON.stringify(log.metadata ?? {}, null, 2),
  ].join("\n");
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
  return text;
}

/** Try to extract related order id from metadata. */
export function relatedEntity(log: ErrorLog): { type: "order" | "customer"; id: string; link: string } | null {
  const md = log.metadata ?? {};
  const orderId = (md as Record<string, unknown>).order_id ?? (md as Record<string, unknown>).orderId;
  if (typeof orderId === "string" && orderId) {
    return { type: "order", id: orderId, link: `/admin?tab=orders&order=${orderId}` };
  }
  const phone = (md as Record<string, unknown>).phone ?? (md as Record<string, unknown>).customer_phone;
  if (typeof phone === "string" && phone) {
    return { type: "customer", id: phone, link: `/admin?tab=behavior&phone=${encodeURIComponent(phone)}` };
  }
  return null;
}