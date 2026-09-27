/**
 * Meta Pixel + Conversion API tracking helper.
 * - Loads fbq lazily once a Pixel ID is known.
 * - Every standard event is sent to both Pixel and CAPI with a shared event_id
 *   so Meta can deduplicate them. If Pixel is blocked, CAPI still arrives.
 */
import { sendCapiEvent } from "./meta-capi.functions";
import type { MarketingConfig } from "./use-marketing";
import { gaEvent, type GAEventName } from "./ga4";
import { isPreviewMode } from "./preview-mode";
import { getAudienceAttribution } from "./landing-pages";
import { emitAnalyticsEvent, dispatchInternalOnly } from "./analytics-events";
import { getMetaIdentifiers } from "./attribution";
import { trackTikTok } from "./tiktok-browser";
import { visitorId } from "./analytics";
import { clientTrackingAllowed } from "./analytics-env";
import {
  isAllowedCustomEvent,
  isRelayedEvent,
  purchaseCustomData,
  sanitizeMetaParams,
  type PurchasePayload,
} from "./meta-events";

/** fbp/fbc/external_id sent with every CAPI event to raise Event Match Quality. */
function capiIdentity() {
  const { fbp, fbc } = getMetaIdentifiers();
  return { fbp, fbc, external_id: visitorId() };
}

function withAudience(params: Record<string, unknown>): Record<string, unknown> {
  const a = getAudienceAttribution();
  if (!a) return params;
  return {
    audience_type: a.audience_type,
    landing_page: a.landing_page,
    utm_campaign: a.utm_campaign,
    ...params, // caller-provided values win
  };
}

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: unknown;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: unknown;
    };
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

// Events fired before the marketing settings arrive (the Boot component defers
// pixel init to browser idle, and the settings request is async) used to be
// dropped — which lost the first PageView/ViewContent of every page load.
// They wait here (bounded) and are replayed once the config is ready.
const pendingUntilReady: Array<{ at: number; run: () => void }> = [];
// Stale entries are dropped rather than replayed (e.g. events queued on admin
// routes, where the config is never applied, must not fire on a later public page).
const PENDING_MAX_AGE_MS = 10_000;

function deferUntilReady(run: () => void) {
  if (pendingUntilReady.length < 30) pendingUntilReady.push({ at: Date.now(), run });
}

export function setMarketingConfig(cfg: MarketingConfig) {
  lastConfig = cfg;
  if (typeof window === "undefined") return;
  if (!cfg.ready) return;
  // Local development and preview deployments share the production Pixel and
  // database: they must never load the Pixel or produce marketing events.
  if (!clientTrackingAllowed()) return;
  if (cfg.pixelEnabled && cfg.pixelId) loadPixel(cfg.pixelId);
  const now = Date.now();
  for (const p of pendingUntilReady.splice(0, pendingUntilReady.length)) {
    if (now - p.at <= PENDING_MAX_AGE_MS) p.run();
  }
}

function loadPixel(pixelId: string) {
  if (typeof window === "undefined") return;
  if (window.__brwz_pixel_loaded && window.__brwz_pixel_id === pixelId) return;
  if (window.__brwz_pixel_loaded && window.__brwz_pixel_id !== pixelId) {
    // Different ID — initialise additional pixel.
    try {
      window.fbq?.("init", pixelId);
    } catch {
      /* noop */
    }
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
  try {
    window.fbq?.("init", pixelId);
  } catch {
    /* noop */
  }
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
  /** A deterministic eventId (purchase_<order_number>) is REQUIRED for Purchase:
   *  the server sends the same event and Meta deduplicates them by this id. */
  opts?: { eventId?: string },
) {
  if (typeof window === "undefined" || isPreviewMode() || !clientTrackingAllowed()) return;
  // A Purchase without an order-derived id would be a fabricated/duplicable
  // conversion — never send one.
  if (name === "Purchase" && !opts?.eventId) return;
  const cfg = lastConfig;
  if (!cfg || !cfg.ready) {
    deferUntilReady(() => trackEvent(name, params, userData, opts));
    return;
  }
  const event_id = opts?.eventId ?? newEventId();
  const mergedUser = { ...currentUserData(), ...(userData ?? {}) };
  // One canonical, allow-listed payload for the Pixel, the relay and GA4.
  const enriched = sanitizeMetaParams(withAudience(params));

  // Internal analytics (Neon) — only events with no existing internal writer.
  emitAnalyticsEvent(name, params);

  // 0) TikTok: the pixel event and, when its Events API is on, the same event
  // relayed server-side with the SAME event_id. Independent of the Meta toggles.
  // PageView is booted by TikTokPixelBoot; Purchase is server-only for the relay.
  if (name !== "PageView") {
    trackTikTok(name, params, event_id, {
      relay: cfg.tiktokEventsEnabled === true,
      userData: cfg.tiktokAdvancedMatchingEnabled
        ? { email: mergedUser.email, phone: mergedUser.phone }
        : undefined,
    });
  }

  // 1) Browser pixel (with eventID for dedup).
  if (cfg.pixelEnabled && typeof window !== "undefined") {
    try {
      window.fbq?.("track", name, enriched, { eventID: event_id });
    } catch {
      /* noop */
    }
  }

  // 2) Conversion API (server-side), same event_id. Best-effort; never blocks
  // the UI. Purchase is NOT relayed from the browser: the server sends it from
  // the stored order (same deterministic event_id), so the browser cannot
  // manufacture revenue.
  if (cfg.capiEnabled && isRelayedEvent(name)) {
    const event_source_url = typeof window !== "undefined" ? window.location.href : undefined;
    sendCapiEvent({
      data: {
        event_name: name,
        event_id,
        event_source_url,
        custom_data: enriched,
        user_data: cfg.advancedMatchingEnabled ? mergedUser : {},
        client_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        ...capiIdentity(),
      },
    }).catch(() => {
      /* CAPI is best-effort; pixel covers fallback */
    });
  }

  // 3) Mirror to GA4 (page_view handled separately by router).
  const ga = META_TO_GA[name];
  if (ga && name !== "PageView") gaEvent(ga, enriched);
}

/**
 * The browser side of a Purchase. `purchase` is the payload the SERVER built
 * from the stored order (createOrderRows / createPhoto4x6Order): real order
 * number, deterministic event id, persisted value. The server has already sent
 * the same event to the Conversions API, so this is Pixel-only and deduplicates
 * by event_id. There is no other way to send a Purchase.
 */
export function trackPurchase(purchase: PurchasePayload, userData?: Partial<UserData>) {
  try {
    trackEvent("Purchase", purchaseCustomData(purchase), userData, { eventId: purchase.event_id });
  } catch {
    /* tracking must never affect checkout */
  }
}

const META_TO_GA: Partial<Record<StandardEvent, GAEventName>> = {
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  AddToWishlist: "add_to_wishlist",
  InitiateCheckout: "begin_checkout",
  Purchase: "purchase",
  Contact: "contact",
};

export { lastConfig as _lastMarketingConfig };

/* ---------- Custom events + background queue ---------- */

/**
 * Custom Meta events used for retargeting / lookalike audiences.
 * fbq supports trackCustom for these alongside the standard list.
 */
export type CustomEvent =
  "ViewCategory" | "ViewCart" | "CartUpdated" | "RemoveFromCart" | "AddPhoneNumber";

type QueuedEvent = {
  kind: "std" | "custom";
  name: string;
  params: Record<string, unknown>;
  userData?: Partial<UserData>;
};

const queue: QueuedEvent[] = [];
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled || typeof window === "undefined") return;
  flushScheduled = true;
  const run = () => {
    flushScheduled = false;
    const batch = queue.splice(0, queue.length);
    for (const e of batch) {
      if (e.kind === "std") trackEvent(e.name as StandardEvent, e.params, e.userData);
      else trackCustom(e.name, e.params, e.userData);
    }
  };
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 1500 });
  else setTimeout(run, 200);
}

/** Fire-and-forget: enqueues an event to be flushed on the next idle tick. */
const STANDARD_NAMES: readonly StandardEvent[] = [
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
];

export function enqueueEvent(
  name: StandardEvent | CustomEvent,
  params: Record<string, unknown> = {},
  userData?: Partial<UserData>,
) {
  const isStd = (STANDARD_NAMES as readonly string[]).includes(name);
  queue.push({ kind: isStd ? "std" : "custom", name, params, userData });
  scheduleFlush();
}

/** Send a custom Meta event (fbq trackCustom) + mirror to CAPI for retargeting. */
export function trackCustom(
  name: string,
  params: Record<string, unknown> = {},
  userData?: Partial<UserData>,
) {
  // Internal-only events (select_item, custom_design_*, …) go to Neon + GA4 and
  // never to Meta/TikTok.
  if (dispatchInternalOnly(name, params)) return;
  if (typeof window === "undefined" || isPreviewMode() || !clientTrackingAllowed()) return;
  // Only the custom events the site really uses may reach Meta.
  if (!isAllowedCustomEvent(name)) return;
  const cfg = lastConfig;
  if (!cfg || !cfg.ready) {
    deferUntilReady(() => trackCustom(name, params, userData));
    return;
  }
  const event_id = newEventId();
  const mergedUser = { ...currentUserData(), ...(userData ?? {}) };
  const enriched = sanitizeMetaParams(withAudience(params));

  // Internal analytics (Neon) + GA4 for the custom events that also go to Meta.
  emitAnalyticsEvent(name, params, { ga: true });

  if (cfg.pixelEnabled && typeof window !== "undefined") {
    try {
      window.fbq?.("trackCustom", name, enriched, { eventID: event_id });
    } catch {
      /* noop */
    }
  }
  if (cfg.capiEnabled) {
    const event_source_url = typeof window !== "undefined" ? window.location.href : undefined;
    sendCapiEvent({
      data: {
        event_name: name,
        event_id,
        event_source_url,
        custom_data: enriched,
        user_data: cfg.advancedMatchingEnabled ? mergedUser : {},
        client_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        ...capiIdentity(),
      },
    }).catch(() => {
      /* best-effort */
    });
  }
}
