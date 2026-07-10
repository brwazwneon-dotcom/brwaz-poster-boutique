import { supabase } from "@/integrations/supabase/client";

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  priority: "low" | "medium" | "high" | "critical";
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  resolved_at: string | null;
  status: string;
  created_at: string;
};

export const PRIORITY_STYLES: Record<
  AdminNotification["priority"],
  { dot: string; badge: string; label: string }
> = {
  low: { dot: "bg-gray-400", badge: "bg-gray-500/15 text-gray-300", label: "Low" },
  medium: { dot: "bg-blue-400", badge: "bg-blue-500/15 text-blue-300", label: "Medium" },
  high: { dot: "bg-orange-400", badge: "bg-orange-500/15 text-orange-300", label: "High" },
  critical: { dot: "bg-red-500", badge: "bg-red-500/20 text-red-300", label: "Critical" },
};

export const TYPE_LABEL: Record<string, string> = {
  new_order: "طلب جديد",
  new_custom_order: "طلب مخصص",
  new_photo_order: "طلب طباعة",
  order_updated: "تحديث طلب",
  low_quality_image: "صورة ضعيفة الجودة",
  upload_failed: "فشل رفع صورة",
  payment_issue: "مشكلة في الدفع",
  website_error: "خطأ في الموقع",
  maintenance: "صيانة",
  stock_issue: "مشكلة في المخزون",
  slow_performance: "أداء بطيء",
  admin_action: "يتطلب مراجعة",
};

export async function fetchNotifications(opts?: {
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
  priority?: string;
  search?: string;
}) {
  let q = supabase
    .from("admin_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.unreadOnly) q = q.is("read_at", null);
  if (opts?.type && opts.type !== "all") q = q.eq("type", opts.type);
  if (opts?.priority && opts.priority !== "all") q = q.eq("priority", opts.priority);
  if (opts?.search) q = q.or(`title.ilike.%${opts.search}%,body.ilike.%${opts.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AdminNotification[];
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
}

export async function markAllRead() {
  await supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
}

export async function markResolved(id: string) {
  await supabase
    .from("admin_notifications")
    .update({ resolved_at: new Date().toISOString(), status: "resolved" })
    .eq("id", id);
}

export async function deleteNotification(id: string) {
  await supabase.from("admin_notifications").delete().eq("id", id);
}

export function timeAgo(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}