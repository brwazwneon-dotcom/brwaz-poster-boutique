import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global stability + performance flags stored as a single JSON row in
 * `site_settings.value` under key `performance_flags`. The dashboard writes
 * these; the storefront + admin heavy jobs read them.
 *
 * Design goal: give the site owner an emergency lever to stabilise the site
 * without a code deploy. No new features — only ON/OFF gates for the parts
 * that can degrade perf.
 */

export const PERFORMANCE_FLAGS_KEY = "performance_flags";

export type PerformanceFlags = {
  /** Emergency storefront mode: smallest public payload, no slow personal rails. */
  emergency_fast_mode: boolean;
  /** Master switch. When ON, forces conservative defaults across the site. */
  safe_mode: boolean;
  /** Blocks bulk AI SEO runs and image variant auto-fix from starting. */
  pause_heavy_jobs: boolean;
  /** Hide the animated black preloader (SSR still renders instantly). */
  disable_preloader: boolean;
  /** Cap the number of homepage sections rendered eagerly. */
  max_home_sections: number;
  /** Hide the recurring "someone just bought" social proof popups. */
  disable_social_proof: boolean;
  /** Hide the floating offer bubble on public pages. */
  disable_floating_offer: boolean;
  /** Extra defer window for Meta Pixel / GA4 injection, in ms. */
  analytics_defer_ms: number;
  /** Show/hide WhatsApp floating button. Default enabled. */
  whatsapp_enabled: boolean;
  /** Show/hide Photo Assistant floating button. Default enabled. */
  assistant_enabled: boolean;
  /** Show/hide Today's Offers floating bubble. Default enabled. */
  offers_enabled: boolean;
  /** On screens <768px, collapse secondary tools into a compact More Tools button. Default true. */
  collapse_tools_mobile: boolean;
};

export const PERFORMANCE_DEFAULTS: PerformanceFlags = {
  emergency_fast_mode: false,
  safe_mode: false,
  pause_heavy_jobs: false,
  disable_preloader: false,
  max_home_sections: 30,
  disable_social_proof: false,
  disable_floating_offer: false,
  analytics_defer_ms: 3000,
  whatsapp_enabled: true,
  assistant_enabled: true,
  offers_enabled: true,
  collapse_tools_mobile: true,
};

/** Values applied when `safe_mode` is ON, regardless of other stored values. */
const SAFE_MODE_OVERRIDES: Partial<PerformanceFlags> = {
  emergency_fast_mode: true,
  disable_preloader: true,
  max_home_sections: 4,
  disable_social_proof: true,
  disable_floating_offer: true,
  analytics_defer_ms: 6000,
};

const EMERGENCY_FAST_OVERRIDES: Partial<PerformanceFlags> = {
  disable_preloader: true,
  max_home_sections: 6,
  disable_social_proof: true,
  disable_floating_offer: true,
  analytics_defer_ms: 9000,
};

function parseFlags(raw: unknown): PerformanceFlags {
  const base = { ...PERFORMANCE_DEFAULTS };
  if (raw && typeof raw === "object") {
    const v = raw as Partial<PerformanceFlags>;
    if (typeof v.emergency_fast_mode === "boolean")
      base.emergency_fast_mode = v.emergency_fast_mode;
    if (typeof v.safe_mode === "boolean") base.safe_mode = v.safe_mode;
    if (typeof v.pause_heavy_jobs === "boolean") base.pause_heavy_jobs = v.pause_heavy_jobs;
    if (typeof v.disable_preloader === "boolean") base.disable_preloader = v.disable_preloader;
    if (typeof v.max_home_sections === "number" && v.max_home_sections > 0) {
      base.max_home_sections = Math.min(50, Math.max(1, Math.round(v.max_home_sections)));
    }
    if (typeof v.disable_social_proof === "boolean")
      base.disable_social_proof = v.disable_social_proof;
    if (typeof v.disable_floating_offer === "boolean")
      base.disable_floating_offer = v.disable_floating_offer;
    if (typeof v.analytics_defer_ms === "number" && v.analytics_defer_ms >= 0) {
      base.analytics_defer_ms = Math.min(30_000, Math.round(v.analytics_defer_ms));
    }
    if (typeof v.whatsapp_enabled === "boolean") base.whatsapp_enabled = v.whatsapp_enabled;
    if (typeof v.assistant_enabled === "boolean") base.assistant_enabled = v.assistant_enabled;
    if (typeof v.offers_enabled === "boolean") base.offers_enabled = v.offers_enabled;
    if (typeof v.collapse_tools_mobile === "boolean")
      base.collapse_tools_mobile = v.collapse_tools_mobile;
  }
  if (base.emergency_fast_mode) Object.assign(base, EMERGENCY_FAST_OVERRIDES);
  if (base.safe_mode) Object.assign(base, SAFE_MODE_OVERRIDES);
  // Cache the last resolved flags so non-React code (background jobs) can
  // read them synchronously without an extra round-trip.
  try {
    if (typeof window !== "undefined") {
      (window as unknown as { __brwzPerfFlags?: PerformanceFlags }).__brwzPerfFlags = base;
    }
  } catch {
    /* noop */
  }
  return base;
}

export function usePerformanceFlags(): PerformanceFlags {
  const q = useQuery({
    queryKey: ["performance-flags"],
    staleTime: 30_000,
    queryFn: async (): Promise<PerformanceFlags> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PERFORMANCE_FLAGS_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseFlags(data?.value);
    },
  });
  return q.data ?? PERFORMANCE_DEFAULTS;
}

/**
 * Synchronous read for background jobs / event handlers. Uses the last value
 * cached by `usePerformanceFlags`. Falls back to defaults on SSR / first paint.
 */
export function readPerfFlagsSync(): PerformanceFlags {
  if (typeof window === "undefined") return PERFORMANCE_DEFAULTS;
  const w = window as unknown as { __brwzPerfFlags?: PerformanceFlags };
  return w.__brwzPerfFlags ?? PERFORMANCE_DEFAULTS;
}

export async function saveFlags(flags: PerformanceFlags): Promise<void> {
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: PERFORMANCE_FLAGS_KEY, value: flags as never });
  if (error) throw error;
}
