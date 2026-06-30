import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UserDataSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
}).default({});

const InputSchema = z.object({
  event_name: z.enum([
    "PageView",
    "ViewContent",
    "Search",
    "AddToWishlist",
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
    "Lead",
    "Contact",
    "CompleteRegistration",
  ]),
  event_id: z.string().min(1).max(128),
  event_source_url: z.string().url().optional(),
  custom_data: z.record(z.string(), z.unknown()).default({}),
  user_data: UserDataSchema,
  client_user_agent: z.string().max(1024).optional(),
});

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normEmail(v: string) { return v.trim().toLowerCase(); }
function normPhone(v: string) { return v.replace(/[^\d]/g, ""); }
function normName(v: string) { return v.trim().toLowerCase(); }

export const sendCapiEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load pixel id + flags from site_settings + token from marketing_secrets.
    const [settingsRes, secretRes] = await Promise.all([
      supabaseAdmin
        .from("site_settings")
        .select("key,value")
        .in("key", ["meta_pixel_id", "meta_capi_enabled", "meta_advanced_matching_enabled"]),
      supabaseAdmin
        .from("marketing_secrets")
        .select("meta_capi_access_token")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (settingsRes.error) return { ok: false, skipped: true, reason: "settings_error" };
    const map = new Map((settingsRes.data ?? []).map((r) => [r.key, r.value as unknown]));
    const bool = (k: string) => map.get(k) === true || map.get(k) === "true";
    const pixelId = String(map.get("meta_pixel_id") ?? "").trim();
    const capiEnabled = bool("meta_capi_enabled");
    const advancedMatching = bool("meta_advanced_matching_enabled");
    const accessToken = secretRes.data?.meta_capi_access_token ?? "";

    if (!capiEnabled) return { ok: true, skipped: true, reason: "capi_disabled" };
    if (!pixelId || !/^\d{6,20}$/.test(pixelId)) return { ok: false, skipped: true, reason: "invalid_pixel_id" };
    if (!accessToken) return { ok: false, skipped: true, reason: "no_access_token" };

    // Build user_data (hashed) for Advanced Matching when enabled.
    const u = data.user_data ?? {};
    const user_data: Record<string, unknown> = {
      client_user_agent: data.client_user_agent,
    };
    if (advancedMatching) {
      if (u.email)   user_data.em = [await sha256Hex(normEmail(u.email))];
      if (u.phone)   user_data.ph = [await sha256Hex(normPhone(u.phone))];
      if (u.city)    user_data.ct = [await sha256Hex(normName(u.city))];
      if (u.country) user_data.country = [await sha256Hex(normName(u.country))];
    }

    const payload = {
      data: [
        {
          event_name: data.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: data.event_id,
          event_source_url: data.event_source_url,
          action_source: "website",
          user_data,
          custom_data: data.custom_data,
        },
      ],
    };

    try {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, body };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "capi_failed" };
    }
  });