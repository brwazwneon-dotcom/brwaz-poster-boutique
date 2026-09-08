import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { safePromiseFn } from "./safe-promise-fn";

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
    const adminCheckPromise = requireAdmin(authContext);
    const adminTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Admin role check timed out")), 10_000);
    });
    await Promise.race([adminCheckPromise, adminTimeoutPromise]);
    const start = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    // The storage manifest RPC is SECURITY DEFINER and gated on auth.uid()
    // via private.has_role(). When called with service_role, auth.uid() is
    // NULL and the RPC raises 'forbidden'. Call it with the admin's own
    // authenticated client instead so has_role() resolves correctly.
    const asUser = authContext.supabase;

    // All health checks run concurrently and are individually timeout + error
    // isolated via safePromiseFn. A single slow/hanging/failed check can never
    // block the others or prevent this handler from returning a result, so the
    // System Health page always exits its loading state.
    const checks = {
      postersResult: safePromiseFn(
        admin.from("posters").select("*", { count: "exact", head: true }),
        0,
        "count:posters",
      ),
      postersHiddenResult: safePromiseFn(
        admin.from("posters").select("*", { count: "exact", head: true }).eq("hidden", true),
        0,
        "count:posters_hidden",
      ),
      postersMissingResult: safePromiseFn(
        admin
          .from("posters")
          .select("*", { count: "exact", head: true })
          .or("image_url.is.null,image_url.eq."),
        0,
        "count:posters_missing_image",
      ),
      catsResult: safePromiseFn(
        admin.from("categories").select("*", { count: "exact", head: true }).is("parent_id", null),
        0,
        "count:categories",
      ),
      subsResult: safePromiseFn(
        admin
          .from("categories")
          .select("*", { count: "exact", head: true })
          .not("parent_id", "is", null),
        0,
        "count:subcategories",
      ),
      ordersResult: safePromiseFn(
        admin.from("orders").select("*", { count: "exact", head: true }),
        0,
        "count:orders",
      ),
      photoResult: safePromiseFn(
        admin.from("photo_orders").select("*", { count: "exact", head: true }),
        0,
        "count:photo_orders",
      ),
      customResult: safePromiseFn(
        admin.from("custom_design_orders").select("*", { count: "exact", head: true }),
        0,
        "count:custom_orders",
      ),
      reviewsResult: safePromiseFn(
        admin.from("reviews").select("*", { count: "exact", head: true }),
        0,
        "count:reviews",
      ),
      reviewsPendingResult: safePromiseFn(
        admin.from("reviews").select("*", { count: "exact", head: true }).eq("approved", false),
        0,
        "count:reviews_pending",
      ),
      wishlistsResult: safePromiseFn(
        admin.from("wishlists").select("*", { count: "exact", head: true }),
        0,
        "count:wishlists",
      ),
      bestsResult: safePromiseFn(
        admin.from("best_sellers").select("*", { count: "exact", head: true }),
        0,
        "count:best_sellers",
      ),
      setsResult: safePromiseFn(
        admin.from("sets").select("*", { count: "exact", head: true }),
        0,
        "count:sets",
      ),
      heroResult: safePromiseFn(
        admin.from("hero_banners").select("*", { count: "exact", head: true }),
        0,
        "count:hero_banners",
      ),
      sliderResult: safePromiseFn(
        admin.from("slider_images").select("*", { count: "exact", head: true }),
        0,
        "count:slider_images",
      ),
      baResult: safePromiseFn(
        admin.from("before_after").select("*", { count: "exact", head: true }),
        0,
        "count:before_after",
      ),
      devicesResult: safePromiseFn(
        admin.from("admin_devices").select("*", { count: "exact", head: true }),
        0,
        "count:admin_devices",
      ),
      ordersNoScreenshotResult: safePromiseFn(
        admin
          .from("orders")
          .select("*", { count: "exact", head: true })
          .not("payment_screenshot_url", "is", null),
        0,
        "count:orders_no_screenshot",
      ),
      lastOrderResult: safePromiseFn(
        admin
          .from("orders")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        "select:last_order",
      ),
      lastReviewResult: safePromiseFn(
        admin
          .from("reviews")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        "select:last_review",
      ),
      lastVisitResult: safePromiseFn(
        admin
          .from("analytics_visits")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        "select:last_visit",
      ),
      lastNotifResult: safePromiseFn(
        admin
          .from("notification_logs")
          .select("created_at,status")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        "select:last_notif",
      ),
      failedNotifResult: safePromiseFn(
        admin
          .from("notification_logs")
          .select("*", { count: "exact", head: true })
          .neq("status", "sent")
          .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
        { count: 0 },
        "count:failed_notifications",
      ),
      storageRpcResult: safePromiseFn(
        asUser.rpc("admin_storage_manifest"),
        { error: "storage_unavailable" },
        "storage_manifest",
      ),
      backupsResult: safePromiseFn(
        admin
          .from("backups")
          .select("id,created_at,backup_type,size_bytes,status")
          .order("created_at", { ascending: false })
          .limit(50),
        [],
        "backups",
      ),
      marketingResResult: safePromiseFn(
        admin
          .from("marketing_secrets")
          .select("firebase_service_account,meta_capi_access_token")
          .eq("id", 1)
          .maybeSingle(),
        null,
        "marketing_secrets",
      ),
      settingsResResult: safePromiseFn(
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
        [],
        "site_settings",
      ),
      capiEventResult: safePromiseFn(
        admin
          .from("analytics_poster_events")
          .select("created_at")
          .eq("event_type", "capi")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        "capi_events",
      ),
      uniqPhonesResult: safePromiseFn(
        admin.from("orders").select("phone").not("phone", "is", null).limit(10000),
        [],
        "orders_phone",
      ),
    };

    const resolved = await Promise.all([
      checks.postersResult,
      checks.postersHiddenResult,
      checks.postersMissingResult,
      checks.catsResult,
      checks.subsResult,
      checks.ordersResult,
      checks.photoResult,
      checks.customResult,
      checks.reviewsResult,
      checks.reviewsPendingResult,
      checks.wishlistsResult,
      checks.bestsResult,
      checks.setsResult,
      checks.heroResult,
      checks.sliderResult,
      checks.baResult,
      checks.devicesResult,
      checks.ordersNoScreenshotResult,
      checks.lastOrderResult,
      checks.lastReviewResult,
      checks.lastVisitResult,
      checks.lastNotifResult,
      checks.failedNotifResult,
      checks.storageRpcResult,
      checks.backupsResult,
      checks.marketingResResult,
      checks.settingsResResult,
      checks.capiEventResult,
      checks.uniqPhonesResult,
    ]);
    const [
      postersResult,
      postersHiddenResult,
      postersMissingResult,
      catsResult,
      subsResult,
      ordersResult,
      photoResult,
      customResult,
      reviewsResult,
      reviewsPendingResult,
      wishlistsResult,
      bestsResult,
      setsResult,
      heroResult,
      sliderResult,
      baResult,
      devicesResult,
      ordersNoScreenshotResult,
      lastOrderResult,
      lastReviewResult,
      lastVisitResult,
      lastNotifResult,
      failedNotifResult,
      storageRpcResult,
      backupsResult,
      marketingResResult,
      settingsResResult,
      capiEventResult,
      uniqPhonesResult,
    ] = resolved;

    const customers = new Set(
      ((uniqPhonesResult.value?.data ?? []) as Array<{ phone: string | null }>)
        .map((r) => String(r.phone ?? "").trim())
        .filter(Boolean),
    ).size;

    // Count query responses are `{ data, count, error }`; extract the numeric count.
    const countOf = (r: { status: string; value: unknown }) =>
      r.status === "ok" && r.value && typeof r.value === "object" && "count" in (r.value as object)
        ? Number((r.value as { count: number | null }).count) || 0
        : 0;
    const posters = countOf(postersResult);
    const postersHidden = countOf(postersHiddenResult);
    const postersMissing = countOf(postersMissingResult);
    const cats = countOf(catsResult);
    const subs = countOf(subsResult);
    const ordersCount = countOf(ordersResult);
    const photo = countOf(photoResult);
    const custom = countOf(customResult);
    const reviews = countOf(reviewsResult);
    const reviewsPending = countOf(reviewsPendingResult);
    const wishlists = countOf(wishlistsResult);
    const bests = countOf(bestsResult);
    const setsCount = countOf(setsResult);
    const hero = countOf(heroResult);
    const slider = countOf(sliderResult);
    const ba = countOf(baResult);
    const devices = countOf(devicesResult);
    const screenshots = countOf(ordersNoScreenshotResult);

    // Process last results (Supabase responses are `{ data, error }` envelopes)
    const lastOrder =
      lastOrderResult.status === "ok" ? (lastOrderResult.value?.data ?? null) : null;
    const lastReview =
      lastReviewResult.status === "ok" ? (lastReviewResult.value?.data ?? null) : null;
    const lastVisit =
      lastVisitResult.status === "ok" ? (lastVisitResult.value?.data ?? null) : null;
    const lastNotif =
      lastNotifResult.status === "ok" ? (lastNotifResult.value?.data ?? null) : null;
    const failedNotif =
      failedNotifResult.status === "ok" ? (failedNotifResult.value?.count ?? 0) : 0;

    // Storage processing
    const storageData =
      storageRpcResult.status === "ok" && storageRpcResult.value
        ? ((storageRpcResult.value.data ?? {}) as Record<
            string,
            { file_count: number; total_bytes: number }
          >)
        : {};

    const totalStorage = Object.values(storageData).reduce(
      (sum, s) => sum + (s?.total_bytes ?? 0),
      0,
    );

    const dbSize: number | null = null; // Postgres size introspection not exposed via Data API

    // Settings map
    const settingsMap: Record<string, unknown> = {};
    if (settingsResResult.status === "ok") {
      for (const row of (settingsResResult.value?.data ?? []) as Array<{
        key: string;
        value: unknown;
      }>)
        settingsMap[row.key] = row.value;
    }

    // Marketing processing
    const marketing =
      marketingResResult.status === "ok" ? (marketingResResult.value?.data ?? null) : null;
    const firebaseServiceAccount =
      marketing && isRecord(marketing.firebase_service_account)
        ? marketing.firebase_service_account
        : null;
    const fcmConfigured = Boolean(
      firebaseServiceAccount?.private_key && firebaseServiceAccount?.client_email,
    );

    // Backups processing
    const backupsList = (
      backupsResult.status === "ok" ? (backupsResult.value?.data ?? []) : []
    ) as Array<{
      created_at: string;
      backup_type: string;
      size_bytes: number | null;
    }>;
    const findFreq = (f: string) =>
      backupsList.find((b) => (b.backup_type ?? "").toLowerCase() === f) ?? null;

    // Marketing fields
    const marketingData = {
      ga4_measurement_id: stringSetting(settingsMap, "ga4_measurement_id"),
      ga4_enabled: Boolean(settingsMap.ga4_enabled),
      meta_pixel_id: stringSetting(settingsMap, "meta_pixel_id"),
      meta_pixel_enabled: Boolean(settingsMap.meta_pixel_enabled),
      meta_capi_enabled: Boolean(settingsMap.meta_capi_enabled),
      meta_advanced_matching_enabled: Boolean(settingsMap.meta_advanced_matching_enabled),
      last_capi_event_at:
        capiEventResult.status === "ok" && capiEventResult.value?.data?.created_at
          ? (capiEventResult.value.data?.created_at ?? null)
          : null,
    };

    // Payment - defaults with settings fallbacks
    const payment = {
      cash_on_delivery: true,
      instapay_configured: false,
      vodafone_configured: false,
      screenshots_uploaded_total: screenshots,
    };
    if (settingsMap.instapay_config) {
      payment.instapay_configured = hasSettingValue(settingsMap.instapay_config, [
        "handle",
        "phone",
      ]);
    }
    if (settingsMap.vodafone_config) {
      payment.vodafone_configured = hasSettingValue(settingsMap.vodafone_config, [
        "phone",
        "number",
      ]);
    }

    return {
      generatedAt: new Date().toISOString(),
      responseMs: Date.now() - start,
      database: {
        ok:
          postersResult.status !== "unavailable" ||
          catsResult.status !== "unavailable" ||
          ordersResult.status !== "unavailable",
        counts: {
          posters,
          posters_hidden: postersHidden,
          posters_missing_image: postersMissing,
          categories: cats,
          subcategories: subs,
          orders: ordersCount,
          photo_orders: photo,
          custom_orders: custom,
          customers,
          reviews,
          reviews_pending: reviewsPending,
          wishlists,
          best_sellers: bests,
          sets: setsCount,
          hero_banners: hero,
          slider_images: slider,
          before_after: ba,
          admin_devices: devices,
        },
        latest: {
          last_order_at: lastOrder?.created_at ?? null,
          last_review_at: lastReview?.created_at ?? null,
          last_visitor_at: lastVisit?.created_at ?? null,
        },
        size_bytes: dbSize,
      },
      storage: {
        ok: Object.keys(storageData).length > 0,
        buckets: storageData,
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
        last_sent_at: lastNotif?.created_at ?? null,
        last_status: lastNotif?.status ?? null,
        fcm_configured: fcmConfigured,
        recent_failures: failedNotif,
      },
      marketing: {
        ga4_measurement_id: marketingData.ga4_measurement_id,
        ga4_enabled: marketingData.ga4_enabled,
        meta_pixel_id: marketingData.meta_pixel_id,
        meta_pixel_enabled: marketingData.meta_pixel_enabled,
        meta_capi_enabled: marketingData.meta_capi_enabled,
        meta_advanced_matching_enabled: marketingData.meta_advanced_matching_enabled,
        last_capi_event_at: marketingData.last_capi_event_at,
      },
      payment,
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
