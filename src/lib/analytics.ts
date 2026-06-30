import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "brw-visitor-id";
const SESSION_KEY = "brw-session-id";
const UNIQUE_VIEW_KEY = "brw-unique-viewed";

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

export function detectSource(referrer: string, search: string): string {
  const params = new URLSearchParams(search);
  const utm = (params.get("utm_source") || "").toLowerCase();
  if (utm) {
    if (utm.includes("facebook") || utm === "fb") return "facebook";
    if (utm.includes("instagram") || utm === "ig") return "instagram";
    if (utm.includes("google")) return "google";
    if (utm.includes("whatsapp") || utm === "wa") return "whatsapp";
    return utm;
  }
  if (!referrer) return "direct";
  const r = referrer.toLowerCase();
  if (r.includes("facebook.") || r.includes("fb.")) return "facebook";
  if (r.includes("instagram.")) return "instagram";
  if (r.includes("whatsapp.") || r.includes("wa.me")) return "whatsapp";
  if (r.includes("t.co") || r.includes("twitter.") || r.includes("x.com")) return "twitter";
  if (r.includes("tiktok.")) return "tiktok";
  if (r.includes("google.")) {
    // Organic Google search has no gclid in referrer chain
    return params.get("gclid") ? "google" : "organic";
  }
  if (r.includes("bing.") || r.includes("duckduckgo.") || r.includes("yahoo.")) return "organic";
  return "other";
}

let visitFiredFor: string | null = null;

/** Record a page view in analytics_visits. Dedupes per path per call. */
export function trackVisit(path: string): void {
  if (typeof window === "undefined") return;
  if (visitFiredFor === path) return;
  visitFiredFor = path;
  const referrer = document.referrer || "";
  const search = window.location.search || "";
  const source = detectSource(referrer, search);
  const device = detectDevice();
  void supabase.from("analytics_visits").insert({
    visitor_id: visitorId(),
    session_id: sessionId(),
    path,
    referrer: referrer.slice(0, 500),
    source,
    device,
    user_agent: (navigator.userAgent || "").slice(0, 500),
  });
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
  } catch { /* ignore */ }
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
  eventType: "view" | "unique_view" | "cart_add" | "wishlist_add",
  durationSeconds?: number,
): void {
  if (!posterId) return;
  void supabase.from("analytics_poster_events").insert({
    poster_id: posterId,
    visitor_id: visitorId(),
    session_id: sessionId(),
    event_type: eventType,
    duration_seconds: typeof durationSeconds === "number" ? Math.round(durationSeconds) : null,
  });
}

export function logSearchQuery(query: string, resultsCount: number): void {
  const clean = (query || "").trim();
  if (clean.length < 2) return;
  void supabase.from("search_queries").insert({
    query: clean.slice(0, 200),
    results_count: Math.max(0, resultsCount | 0),
    visitor_id: visitorId(),
  });
}