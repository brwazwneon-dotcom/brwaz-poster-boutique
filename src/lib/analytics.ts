import {
  logVisitPublic,
  logPosterEventPublic,
  logSearchQueryPublic,
} from "@/lib/db-public.functions";
import { isPreviewMode } from "./preview-mode";
import { clientTrackingAllowed } from "./analytics-env";
import { captureAttribution, getAttribution, toAttributionFields } from "./attribution";

/**
 * Preview mode (admin previewing the storefront) and any non-production host
 * (local development, preview deployments — they share the production
 * database) must never be recorded as real visitors.
 */
function trackingAllowed(): boolean {
  return clientTrackingAllowed() && !isPreviewMode();
}

const VISITOR_KEY = "brw-visitor-id";
const SESSION_KEY = "brw-session-id";
const UNIQUE_VIEW_KEY = "brw-unique-viewed";
const GEO_KEY = "brw-geo-v1";
const GEO_TTL_MS = 24 * 60 * 60 * 1000;

type GeoInfo = {
  country?: string | null;
  country_code?: string | null;
  city?: string | null;
  governorate?: string | null;
  ts: number;
};

function readGeo(): GeoInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GEO_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GeoInfo;
    if (!g?.ts || Date.now() - g.ts > GEO_TTL_MS) return null;
    return g;
  } catch {
    return null;
  }
}

async function fetchGeo(): Promise<GeoInfo | null> {
  const cached = readGeo();
  if (cached) return cached;
  try {
    // Free geolocation, no key. Fails silently.
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const g: GeoInfo = {
      country: (j.country_name as string) || null,
      country_code: (j.country_code as string) || null,
      city: (j.city as string) || null,
      governorate: (j.region as string) || null,
      ts: Date.now(),
    };
    try {
      window.localStorage.setItem(GEO_KEY, JSON.stringify(g));
    } catch {
      /* ignore */
    }
    return g;
  } catch {
    return null;
  }
}

export function detectBrowser(): string {
  if (typeof navigator === "undefined") return "Other";
  const ua = navigator.userAgent || "";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/MSIE|Trident/i.test(ua)) return "IE";
  return "Other";
}

export function detectOS(): string {
  if (typeof navigator === "undefined") return "Other";
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function visitorId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let v = window.localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = uid();
      window.localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

export function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let s = window.sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = uid();
      window.sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "anon";
  }
}

export function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|Nexus 7|Nexus 10/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * The session's traffic source in the shared taxonomy (src/lib/attribution.ts).
 * It used to be re-guessed from the current referrer on every page view, which
 * labelled most in-site navigation "other". The source is now the session's
 * last touch, captured once.
 */
export function detectSource(referrer: string, search: string): string {
  const touch = captureAttribution();
  if (touch.last) return touch.last.source;
  void referrer;
  void search;
  return "direct";
}

let visitFiredFor: string | null = null;

/** Record a page view in analytics_visits. Dedupes per path per call. */
export function trackVisit(path: string): void {
  if (typeof window === "undefined") return;
  if (isPreviewMode()) return;
  // Evaluate first/last touch (once per session, or when the URL carries
  // campaign params). This only touches this browser's storage — no network —
  // so it runs on every host; only the recording below is production-gated.
  const attribution = captureAttribution();
  if (!trackingAllowed()) return;
  if (visitFiredFor === path) return;
  visitFiredFor = path;
  const referrer = document.referrer || "";
  const source = attribution.last?.source ?? "direct";
  const device = detectDevice();
  const browser = detectBrowser();
  const os = detectOS();
  void (async () => {
    const geo = await fetchGeo();
    await logVisitPublic({
      data: {
        visitor_id: visitorId(),
        session_id: sessionId(),
        path,
        referrer: referrer.slice(0, 500),
        source,
        device,
        browser,
        os,
        country: geo?.country ?? null,
        country_code: geo?.country_code ?? null,
        city: geo?.city ?? null,
        governorate: geo?.governorate ?? null,
        user_agent: (navigator.userAgent || "").slice(0, 500),
        attribution: toAttributionFields(attribution),
      },
    }).catch(() => {
      /* analytics must never break the page */
    });
  })();
}

function uniqueViewedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(UNIQUE_VIEW_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveUniqueViewedSet(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UNIQUE_VIEW_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore */
  }
}

/** Returns true if this is the visitor's first view of poster (and persists it). */
export function markUniqueView(posterId: string): boolean {
  const s = uniqueViewedSet();
  if (s.has(posterId)) return false;
  s.add(posterId);
  saveUniqueViewedSet(s);
  return true;
}

export function logPosterEvent(
  posterId: string,
  eventType:
    "view" | "unique_view" | "cart_add" | "wishlist_add" | "checkout_start" | "checkout_complete",
  durationSeconds?: number,
): void {
  if (!posterId) return;
  if (!trackingAllowed()) return;
  logPosterEventPublic({
    data: {
      poster_id: posterId,
      visitor_id: visitorId(),
      session_id: sessionId(),
      event_type: eventType,
      duration_seconds: typeof durationSeconds === "number" ? Math.round(durationSeconds) : null,
      path: window.location.pathname,
      attribution: toAttributionFields(getAttribution()),
    },
  }).catch(() => {
    /* analytics must never break the page */
  });
}

/** Log a checkout-started event. Called when the user opens the checkout page. */
export function logCheckoutStart(): void {
  if (!trackingAllowed()) return;
  logPosterEventPublic({
    data: {
      poster_id: null,
      visitor_id: visitorId(),
      session_id: sessionId(),
      event_type: "checkout_start",
      duration_seconds: null,
      path: window.location.pathname,
      attribution: toAttributionFields(getAttribution()),
    },
  }).catch(() => {
    /* analytics must never break checkout */
  });
}

export function logSearchQuery(query: string, resultsCount: number): void {
  const clean = (query || "").trim();
  if (clean.length < 2) return;
  if (!trackingAllowed()) return;
  logSearchQueryPublic({
    data: {
      query: clean.slice(0, 200),
      results_count: Math.max(0, resultsCount | 0),
      visitor_id: visitorId(),
    },
  }).catch(() => {
    /* analytics must never break search */
  });
}
