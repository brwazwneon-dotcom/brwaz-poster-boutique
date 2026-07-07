/**
 * Customer behavior tracking & personalization.
 *
 * Everything here is best-effort: every call is wrapped in try/catch and
 * never blocks user actions. Respects the admin toggle
 * `behavior.tracking_enabled` in `site_settings`.
 */
import { supabase } from "@/integrations/supabase/client";
import { isPreviewMode } from "@/lib/preview-mode";
import { visitorId, detectDevice } from "@/lib/analytics";

type BehaviorSettings = {
  tracking: boolean;
  personalization: boolean;
  retentionDays: number;
};

const DEFAULTS: BehaviorSettings = {
  tracking: true,
  personalization: true,
  retentionDays: 180,
};

let cache: { at: number; value: BehaviorSettings } | null = null;
let inflight: Promise<BehaviorSettings> | null = null;
const TTL_MS = 60_000;

export async function getBehaviorSettings(): Promise<BehaviorSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [
          "behavior.tracking_enabled",
          "behavior.personalization_enabled",
          "behavior.retention_days",
        ]);
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const bool = (k: string, fallback: boolean) => {
        const v = map.get(k);
        if (typeof v === "boolean") return v;
        if (typeof v === "string") return v === "true" || v === "1";
        return fallback;
      };
      const num = (k: string, fallback: number) => {
        const v = map.get(k);
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const value: BehaviorSettings = {
        tracking: bool("behavior.tracking_enabled", DEFAULTS.tracking),
        personalization: bool("behavior.personalization_enabled", DEFAULTS.personalization),
        retentionDays: num("behavior.retention_days", DEFAULTS.retentionDays),
      };
      cache = { at: Date.now(), value };
      return value;
    } catch {
      return DEFAULTS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function guard(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isPreviewMode()) return false;
  const s = await getBehaviorSettings();
  return s.tracking;
}

/** Fired once per session on first mount. */
let bootDone = false;
export async function initBehavior(): Promise<void> {
  if (bootDone) return;
  bootDone = true;
  if (!(await guard())) return;
  try {
    const geoRaw = window.localStorage.getItem("brw-geo-v1");
    const geo = geoRaw ? JSON.parse(geoRaw) as { city?: string; governorate?: string; country?: string } : null;
    await supabase.rpc("upsert_visitor_profile", {
      _visitor_id: visitorId(),
      _device: detectDevice(),
      _city: geo?.city ?? null,
      _governorate: geo?.governorate ?? null,
      _country: geo?.country ?? null,
    });
  } catch { /* noop */ }
}

async function score(kind: "category" | "tag" | "size" | "frame", key: string | null | undefined, delta = 1) {
  if (!key) return;
  if (!(await guard())) return;
  try {
    await supabase.rpc("score_visitor_interest", {
      _visitor_id: visitorId(),
      _kind: kind,
      _key: key,
      _delta: delta,
    });
  } catch { /* noop */ }
}

export const track = {
  productView(posterId: string, meta: { categoryId?: string | null; tags?: string[] | null }) {
    if (!posterId) return;
    void (async () => {
      if (!(await guard())) return;
      // Score category (weight 1) and up to 3 tags (weight 0.5)
      if (meta.categoryId) void score("category", meta.categoryId, 1);
      (meta.tags ?? []).slice(0, 5).forEach((t) => void score("tag", t.toLowerCase(), 0.5));
    })();
  },
  wishlist(posterId: string, meta: { categoryId?: string | null; tags?: string[] | null }, added: boolean) {
    if (!added) return;
    void score("category", meta.categoryId ?? "", 2);
    (meta.tags ?? []).slice(0, 5).forEach((t) => void score("tag", t.toLowerCase(), 1));
  },
  cart(posterId: string, meta: { categoryId?: string | null; size?: string; frameType?: string }, added: boolean, qty = 1) {
    void (async () => {
      if (!(await guard())) return;
      if (added) {
        void score("category", meta.categoryId ?? "", 3);
        void score("size", meta.size ?? "", 1);
        void score("frame", meta.frameType ?? "", 1);
      }
      try {
        await supabase.from("visitor_cart_events").insert({
          visitor_id: visitorId(),
          poster_id: posterId || null,
          event: added ? "add" : "remove",
          qty,
          size: meta.size ?? null,
          frame_type: meta.frameType ?? null,
        });
      } catch { /* noop */ }
    })();
  },
  checkoutStart() {
    void (async () => {
      if (!(await guard())) return;
      try {
        await supabase.from("visitor_cart_events").insert({
          visitor_id: visitorId(),
          event: "checkout_start",
        });
      } catch { /* noop */ }
    })();
  },
  purchase(phone: string, posterIds: string[]) {
    void (async () => {
      if (!(await guard())) return;
      const vid = visitorId();
      try {
        await supabase.rpc("merge_visitor_to_phone", { _visitor_id: vid, _phone: phone });
      } catch { /* noop */ }
      try {
        if (posterIds.length) {
          await supabase.from("visitor_cart_events").insert(
            posterIds.map((pid) => ({ visitor_id: vid, poster_id: pid, event: "purchase" })),
          );
        } else {
          await supabase.from("visitor_cart_events").insert({ visitor_id: vid, event: "purchase" });
        }
      } catch { /* noop */ }
    })();
  },
};

/* -------------------- Recommendations -------------------- */

export type RecPoster = {
  id: string;
  title: string;
  image_url: string | null;
  category_id: string | null;
};

export type Recommendations = {
  top_category_id: string | null;
  top_category_name: string | null;
  top_tag: string | null;
  recently_viewed: RecPoster[];
  because_you_liked: RecPoster[];
  popular_in_tag: RecPoster[];
  recommended_for_you: RecPoster[];
  continue_where_you_left_off: RecPoster[];
};

export async function fetchRecommendations(limit = 10): Promise<Recommendations | null> {
  if (typeof window === "undefined") return null;
  const settings = await getBehaviorSettings();
  if (!settings.personalization) return null;
  try {
    const { data, error } = await supabase.rpc("get_recommendations", {
      _visitor_id: visitorId(),
      _limit: limit,
    });
    if (error) throw error;
    return (data ?? null) as Recommendations | null;
  } catch {
    return null;
  }
}