/**
 * Meta Pixel + Conversion API tracking helper.
 * - Loads fbq lazily once a Pixel ID is known.
 * - Every standard event is sent to both Pixel and CAPI with a shared event_id
 *   so Meta can deduplicate them. If Pixel is blocked, CAPI still arrives.
 */
import { sendCapiEvent } from "./meta-capi.functions";
import type { MarketingConfig } from "./use-marketing";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
    __brwz_pixel_id?: string;
    __brwz_pixel_loaded?: boolean;
    __brwz_user_data?: Partial<UserData>;
  }
}

export type UserData = {
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
};

export type StandardEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToWishlist"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase"
  | "Lead"
  | "Contact"
  | "CompleteRegistration";

let lastConfig: MarketingConfig | null = null;

export function setMarketingConfig(cfg: MarketingConfig) {
  lastConfig = cfg;
  if (typeof window === "undefined") return;
  if (cfg.pixelEnabled && cfg.pixelId) loadPixel(cfg.pixelId);
}

function loadPixel(pixelId: string) {
  if (typeof window === "undefined") return;
  if (window.__brwz_pixel_loaded && window.__brwz_pixel_id === pixelId) return;
  if (window.__brwz_pixel_loaded && window.__brwz_pixel_id !== pixelId) {
    // Different ID — initialise additional pixel.
    try { window.fbq?.("init", pixelId); } catch { /* noop */ }
    window.__brwz_pixel_id = pixelId;
    return;
  }
  // Standard FB Pixel boot snippet.
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  try { window.fbq?.("init", pixelId); } catch { /* noop */ }
  window.__brwz_pixel_id = pixelId;
  window.__brwz_pixel_loaded = true;
}

function newEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "evt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Remember Advanced Matching data once we know it (e.g. after sign-in/checkout). */
export function setUserData(u: Partial<UserData>) {
  if (typeof window === "undefined") return;
  window.__brwz_user_data = { ...(window.__brwz_user_data ?? {}), ...u };
}

function currentUserData(): Partial<UserData> {
  return (typeof window !== "undefined" && window.__brwz_user_data) || {};
}

export function trackEvent(
  name: StandardEvent,
  params: Record<string, unknown> = {},
  userData?: Partial<UserData>,
) {
  const cfg = lastConfig;
  if (!cfg) return; // not loaded yet
  const event_id = newEventId();
  const mergedUser = { ...currentUserData(), ...(userData ?? {}) };

  // 1) Browser pixel (with eventID for dedup).
  if (cfg.pixelEnabled && typeof window !== "undefined") {
    try {
      window.fbq?.("track", name, params, { eventID: event_id });
    } catch { /* noop */ }
  }

  // 2) Conversion API (server-side). Best-effort; never blocks UI.
  if (cfg.capiEnabled) {
    const event_source_url = typeof window !== "undefined" ? window.location.href : undefined;
    sendCapiEvent({
      data: {
        event_name: name,
        event_id,
        event_source_url,
        custom_data: params as Record<string, unknown>,
        user_data: cfg.advancedMatchingEnabled ? mergedUser : {},
        client_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      },
    }).catch(() => { /* CAPI is best-effort; pixel covers fallback */ });
  }
}

export { lastConfig as _lastMarketingConfig };