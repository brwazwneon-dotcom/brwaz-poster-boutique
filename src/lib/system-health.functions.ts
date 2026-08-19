import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type HealthReport = {
  generatedAt: string;
  responseMs: number;
  database: {
    ok: boolean;
    error?: string;
    counts: {
      posters: number;
      posters_hidden: number;
      posters_missing_image: number;
      categories: number;
      subcategories: number;
      orders: number;
      photo_orders: number;
      custom_orders: number;
      customers: number;
      reviews: number;
      reviews_pending: number;
      wishlists: number;
      best_sellers: number;
      sets: number;
      hero_banners: number;
      slider_images: number;
      before_after: number;
      admin_devices: number;
    };
    latest: {
      last_order_at: string | null;
      last_review_at: string | null;
      last_visitor_at: string | null;
    };
    size_bytes: number | null;
  };
  storage: {
    ok: boolean;
    buckets: Record<string, { file_count: number; total_bytes: number }>;
    total_bytes: number;
  };
  backups: {
    last_daily: { created_at: string; size_bytes: number | null } | null;
    last_weekly: { created_at: string; size_bytes: number | null } | null;
    last_monthly: { created_at: string; size_bytes: number | null } | null;
    total: number;
  };
  notifications: {
    devices: number;
    last_sent_at: string | null;
    last_status: string | null;
    fcm_configured: boolean;
    recent_failures: number;
  };
  marketing: {
    ga4_measurement_id: string | null;
    ga4_enabled: boolean;
    meta_pixel_id: string | null;
    meta_pixel_enabled: boolean;
    meta_capi_enabled: boolean;
    meta_advanced_matching_enabled: boolean;
    last_capi_event_at: string | null;
  };
  payment: {
    cash_on_delivery: boolean;
    instapay_configured: boolean;
    vodafone_configured: boolean;
    screenshots_uploaded_total: number;
  };
  environment: {
    supabase_url: boolean;
    service_role_key: boolean;
    backup_encryption_key: boolean;
    lovable_api_key: boolean;
    gemini_api_key: boolean;
  };
  version: {
    build_mode: string;
    generated_at: string;
    node_env: string;
  };
};

function nz(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

type Supabase = SupabaseClient<Database>;

type AuthContext = {
  supabase: Supabase;
  userId: string;
};

type QueryError = { message?: string } | null;

type CountQuery = PromiseLike<{ count: number | null; error: QueryError }> & {
  eq(column: string, value: unknown): CountQuery;
  or(filters: string): CountQuery;
  is(column: string, value: unknown): CountQuery;
  not(column: string, operator: string, value: unknown): CountQuery;
};

type CountFrom = (table: string) => {
  select(columns: string, options: { count: "exact"; head: true }): CountQuery;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringSetting(settings: Record<string, unknown>, key: string): string | null {
  const value = settings[key];
  return typeof value === "string" ? value : null;
}

function hasSettingValue(value: unknown, keys: string[]): boolean {
  if (!isRecord(value)) return false;
  return keys.some((key) => Boolean(value[key]));
}

async function requireAdmin(ctx: AuthContext) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthReport> => {
    const authContext = context as AuthContext;
    await requireAdmin(authContext);
    const start = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    // The storage manifest RPC is SECURITY DEFINER and gated on auth.uid()
    // via private.has_role(). When called with service_role, auth.uid() is
    // NULL and the RPC raises 'forbidden'. Call it with the admin's own
    // authenticated client instead so has_role() resolves correctly.
    const asUser = authContext.supabase;

    const count = async (table: string, filter?: (q: CountQuery) => CountQuery) => {
      let q = (admin.from as unknown as CountFrom)(table).select("*", {
        count: "exact",
        head: true,
      });
      if (filter) q = filter(q);
      const { count: c, error } = await q;
      if (error) return 0;
      return c ?? 0;
    };

    const [
      posters,
      postersHidden,
      postersMissing,
      cats,
      subs,
      orders,
      photo,
      custom,
      reviews,
      reviewsPending,
      wishlists,
      bests,
      sets,
      hero,
      slider,
      ba,
      devices,
      screenshots,
    ] = await Promise.all([
      count("posters"),
      count("posters", (q) => q.eq("hidden", true)),
      count("posters", (q) => q.or("image_url.is.null,image_url.eq.")),
      count("categories", (q) => q.is("parent_id", null)),
      count("categories", (q) => q.not("parent_id", "is", null)),
      count("orders"),
      count("photo_orders"),
      count("custom_design_orders"),
      count("reviews"),
      count("reviews", (q) => q.eq("approved", false)),
      count("wishlists"),
      count("best_sellers"),
      count("sets"),
      count("hero_banners"),
      count("slider_images"),
      count("before_after"),
      count("admin_devices"),
      count("orders", (q) => q.not("payment_screenshot_url", "is", null)),
    ]);

    const [
      lastOrder,
      lastReview,
      lastVisit,
      lastNotif,
      failedNotif,
      storageRpc,
      backupsRes,
      marketingRes,
      settingsRes,
      capiEventRes,
    ] = await Promise.all([
      admin
        .from("orders")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("reviews")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("analytics_visits")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("notification_logs")
        .select("created_at,status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("notification_logs")
        .select("*", { count: "exact", head: true })
        .neq("status", "sent")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      asUser.rpc("admin_storage_manifest"),
      admin
        .from("backups")
        .select("id,created_at,backup_type,size_bytes,status")
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("marketing_secrets")
        .select("firebase_service_account,meta_capi_access_token")
        .eq("id", 1)
        .maybeSingle(),
      admin
        .from("site_settings")
        .select("key,value")
        .in("key", [
          "ga4_measurement_id",
          "ga4_enabled",
          "meta_pixel_id",
          "meta_pixel_enabled",
          "meta_capi_enabled",
          "meta_advanced_matching_enabled",
          "instapay_config",
          "vodafone_config",
        ]),
      admin
        .from("analytics_poster_events")
        .select("created_at")
        .eq("event_type", "capi")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Unique customers approximation via phone
    const { data: uniqPhones } = await admin
      .from("orders")
      .select("phone")
      .not("phone", "is", null)
      .limit(10000);
    const customers = new Set((uniqPhones ?? []).map((r) => String(r.phone).trim()).filter(Boolean))
      .size;

    const backupsList = (backupsRes.data ?? []) as unknown as Array<{
      created_at: string;
      backup_type: string;
      size_bytes: number | null;
    }>;
    const findFreq = (f: string) =>
      backupsList.find((b) => (b.backup_type ?? "").toLowerCase() === f) ?? null;

    const settingsMap: Record<string, unknown> = {};
    for (const row of settingsRes.data ?? []) settingsMap[row.key] = row.value;

    const marketing = marketingRes.data as { firebase_service_account?: unknown } | null;
    const firebaseServiceAccount = isRecord(marketing?.firebase_service_account)
      ? marketing.firebase_service_account
      : null;
    const fcmConfigured = Boolean(
      firebaseServiceAccount?.private_key && firebaseServiceAccount?.client_email,
    );

    const storage = (storageRpc.data ?? {}) as Record<
      string,
      { file_count: number; total_bytes: number }
    >;
    const totalStorage = Object.values(storage).reduce((sum, s) => sum + nz(s?.total_bytes), 0);

    const dbSize: number | null = null; // Postgres size introspection not exposed via Data API

    return {
      generatedAt: new Date().toISOString(),
      responseMs: Date.now() - start,
      database: {
        ok: true,
        counts: {
          posters,
          posters_hidden: postersHidden,
          posters_missing_image: postersMissing,
          categories: cats,
          subcategories: subs,
          orders,
          photo_orders: photo,
          custom_orders: custom,
          customers,
          reviews,
          reviews_pending: reviewsPending,
          wishlists,
          best_sellers: bests,
          sets,
          hero_banners: hero,
          slider_images: slider,
          before_after: ba,
          admin_devices: devices,
        },
        latest: {
          last_order_at: lastOrder.data?.created_at ?? null,
          last_review_at: lastReview.data?.created_at ?? null,
          last_visitor_at: lastVisit.data?.created_at ?? null,
        },
        size_bytes: dbSize,
      },
      storage: {
        ok: !storageRpc.error,
        buckets: storage,
        total_bytes: totalStorage,
      },
      backups: {
        last_daily: findFreq("daily")
          ? { created_at: findFreq("daily")!.created_at, size_bytes: findFreq("daily")!.size_bytes }
          : null,
        last_weekly: findFreq("weekly")
          ? {
              created_at: findFreq("weekly")!.created_at,
              size_bytes: findFreq("weekly")!.size_bytes,
            }
          : null,
        last_monthly: findFreq("monthly")
          ? {
              created_at: findFreq("monthly")!.created_at,
              size_bytes: findFreq("monthly")!.size_bytes,
            }
          : null,
        total: backupsList.length,
      },
      notifications: {
        devices,
        last_sent_at: lastNotif.data?.created_at ?? null,
        last_status: lastNotif.data?.status ?? null,
        fcm_configured: fcmConfigured,
        recent_failures: failedNotif.count ?? 0,
      },
      marketing: {
        ga4_measurement_id: stringSetting(settingsMap, "ga4_measurement_id"),
        ga4_enabled: Boolean(settingsMap.ga4_enabled),
        meta_pixel_id: stringSetting(settingsMap, "meta_pixel_id"),
        meta_pixel_enabled: Boolean(settingsMap.meta_pixel_enabled),
        meta_capi_enabled: Boolean(settingsMap.meta_capi_enabled),
        meta_advanced_matching_enabled: Boolean(settingsMap.meta_advanced_matching_enabled),
        last_capi_event_at: capiEventRes.data?.created_at ?? null,
      },
      payment: {
        cash_on_delivery: true,
        instapay_configured: Boolean(
          hasSettingValue(settingsMap.instapay_config, ["handle", "phone"]),
        ),
        vodafone_configured: Boolean(
          hasSettingValue(settingsMap.vodafone_config, ["phone", "number"]),
        ),
        screenshots_uploaded_total: screenshots,
      },
      environment: {
        supabase_url: Boolean(process.env.SUPABASE_URL),
        service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        backup_encryption_key: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
        lovable_api_key: Boolean(process.env.LOVABLE_API_KEY),
        gemini_api_key: Boolean(process.env.GEMINI_API_KEY),
      },
      version: {
        build_mode: process.env.NODE_ENV ?? "unknown",
        generated_at: new Date().toISOString(),
        node_env: process.env.NODE_ENV ?? "unknown",
      },
    };
  });
