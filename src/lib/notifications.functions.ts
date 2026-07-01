import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  phone: string | null;
  governorate: string | null;
  total_price: number | null;
  payment_method: string | null;
  status: string | null;
};

async function loadServiceAccount(admin: Awaited<ReturnType<typeof getAdmin>>) {
  const { data, error } = await admin
    .from("marketing_secrets")
    .select("firebase_service_account")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  const sa = data?.firebase_service_account as
    | { client_email?: string; private_key?: string; project_id?: string }
    | null;
  if (!sa || !sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error("Firebase service account is not configured");
  }
  return sa as { client_email: string; private_key: string; project_id: string };
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadDeviceTokens(admin: Awaited<ReturnType<typeof getAdmin>>) {
  const { data, error } = await admin.from("admin_devices").select("fcm_token");
  if (error) throw error;
  return (data ?? []).map((r) => r.fcm_token as string).filter(Boolean);
}

async function pruneInvalid(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  tokens: string[],
) {
  if (tokens.length === 0) return;
  await admin.from("admin_devices").delete().in("fcm_token", tokens);
}

async function logNotification(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  row: {
    title: string;
    body: string;
    payload: Record<string, string> | null;
    sent: number;
    failed: number;
    status: string;
    error?: string | null;
  },
) {
  try {
    await admin.from("notification_logs").insert({
      title: row.title,
      body: row.body,
      payload: row.payload as never,
      sent_count: row.sent,
      failed_count: row.failed,
      status: row.status,
      error: row.error ?? null,
    });
  } catch { /* noop */ }
}

/**
 * Called (unauthenticated) from checkout right after the order is inserted.
 * We revalidate the order server-side and only notify if it exists — the
 * endpoint cannot be used to send arbitrary payloads.
 */
export const notifyNewOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { orderId: string }) => {
    if (!input || typeof input.orderId !== "string" || input.orderId.length < 8) {
      throw new Error("orderId is required");
    }
    return { orderId: input.orderId.slice(0, 64) };
  })
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select("id, order_number, customer_name, phone, governorate, total_price, payment_method, status")
      .eq("id", data.orderId)
      .maybeSingle<OrderRow>();
    if (error || !order) return { ok: false, reason: "order-not-found" as const };

    let sa;
    try {
      sa = await loadServiceAccount(admin);
    } catch (e) {
      return { ok: false, reason: "not-configured" as const, error: (e as Error).message };
    }
    const tokens = await loadDeviceTokens(admin);
    if (tokens.length === 0) return { ok: false, reason: "no-devices" as const };

    const { sendFcmToTokens } = await import("./fcm.server");
    const title = "🔔 New Order Received";
    const body = [
      `Order #${order.order_number ?? order.id.slice(0, 6)}`,
      order.customer_name ?? "",
      order.governorate ?? "",
      `Total: ${Number(order.total_price ?? 0)} EGP`,
    ].filter(Boolean).join("\n");

    const payload = {
      order_id: order.id,
      order_number: order.order_number ?? "",
      customer_name: order.customer_name ?? "",
      phone: order.phone ?? "",
      governorate: order.governorate ?? "",
      total_price: String(order.total_price ?? 0),
      payment_method: order.payment_method ?? "",
      order_status: order.status ?? "",
    };

    try {
      const result = await sendFcmToTokens(sa, tokens, {
        title,
        body,
        data: payload,
        clickUrl: `/admin?tab=orders&order=${order.id}`,
      });
      if (result.invalidTokens.length) await pruneInvalid(admin, result.invalidTokens);
      await logNotification(admin, {
        title,
        body,
        payload,
        sent: result.sent,
        failed: result.failed,
        status: result.sent > 0 ? "sent" : "failed",
        error: result.errors.slice(0, 3).join(" | ") || null,
      });
      return { ok: true, sent: result.sent, failed: result.failed };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logNotification(admin, { title, body, payload, sent: 0, failed: tokens.length, status: "error", error: msg });
      return { ok: false, reason: "fcm-error" as const, error: msg };
    }
  });

/**
 * Admin-only: send a test notification to all registered admin devices.
 */
export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const admin = await getAdmin();
    const sa = await loadServiceAccount(admin);
    const tokens = await loadDeviceTokens(admin);
    if (tokens.length === 0) return { ok: false, reason: "no-devices" as const };

    const { sendFcmToTokens } = await import("./fcm.server");
    const title = "🔔 Test Notification";
    const body = "Push notifications are working — you're all set.";
    const result = await sendFcmToTokens(sa, tokens, {
      title,
      body,
      data: { test: "1" },
      clickUrl: "/admin?tab=notifications",
    });
    if (result.invalidTokens.length) await pruneInvalid(admin, result.invalidTokens);
    await logNotification(admin, {
      title,
      body,
      payload: { test: "1" },
      sent: result.sent,
      failed: result.failed,
      status: result.sent > 0 ? "sent" : "failed",
      error: result.errors.slice(0, 3).join(" | ") || null,
    });
    return { ok: true, sent: result.sent, failed: result.failed };
  });