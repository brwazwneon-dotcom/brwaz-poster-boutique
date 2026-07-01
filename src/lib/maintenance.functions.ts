import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type MaybeRpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
async function assertAdmin(supabase: unknown, userId: string) {
  const { data, error } = await (supabase as MaybeRpc).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

/** Send a push notification when maintenance is toggled. */
export const notifyMaintenanceToggle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => ({ enabled: !!data?.enabled }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sec } = await supabaseAdmin
      .from("marketing_secrets")
      .select("firebase_service_account")
      .eq("id", 1)
      .maybeSingle();
    const sa = sec?.firebase_service_account as
      | { client_email?: string; private_key?: string; project_id?: string }
      | null;
    if (!sa?.client_email || !sa.private_key || !sa.project_id) {
      return { ok: false, reason: "not-configured" as const };
    }

    const { data: devices } = await supabaseAdmin.from("admin_devices").select("fcm_token");
    const tokens = (devices ?? []).map((r) => r.fcm_token as string).filter(Boolean);
    if (tokens.length === 0) return { ok: false, reason: "no-devices" as const };

    const { sendFcmToTokens } = await import("./fcm.server");
    const title = data.enabled ? "🛠️ Maintenance Mode Enabled" : "✅ Website is Live Again";
    const body = data.enabled
      ? "Public traffic is paused. Only admins & whitelisted users can access the site."
      : "Maintenance ended. The website is publicly accessible again.";

    try {
      const r = await sendFcmToTokens(
        sa as { client_email: string; private_key: string; project_id: string },
        tokens,
        {
          title,
          body,
          data: { kind: "maintenance", enabled: String(data.enabled) },
          clickUrl: "/admin?tab=maintenance",
        },
      );
      await supabaseAdmin.from("notification_logs").insert({
        title,
        body,
        payload: { kind: "maintenance", enabled: String(data.enabled) } as never,
        sent_count: r.sent,
        failed_count: r.failed,
        status: r.sent > 0 ? "sent" : "failed",
        error: r.errors.slice(0, 3).join(" | ") || null,
      });
      return { ok: true, sent: r.sent };
    } catch (e) {
      return { ok: false, reason: "fcm-error" as const, error: (e as Error).message };
    }
  });