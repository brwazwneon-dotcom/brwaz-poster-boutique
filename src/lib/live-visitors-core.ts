// Pure helpers for Live Visitors (no I/O, safe on server and client, unit-tested).
//
// Privacy contract: nothing here ever sees an IP address. Location arrives as
// the platform's approximate geolocation headers, and only country / region /
// city names are kept.

export const DEFAULT_ACTIVE_WINDOW_SECONDS = 90;
export const MIN_ACTIVE_WINDOW_SECONDS = 30;
export const MAX_ACTIVE_WINDOW_SECONDS = 600;
/** Rows older than this are deleted — live presence is never a visitor log. */
export const LIVE_RETENTION_MINUTES = 60;
/** Heartbeats closer together than this are cheap no-ops on the server. */
export const MIN_PING_INTERVAL_SECONDS = 10;

export type Device = "mobile" | "tablet" | "desktop";

export type LivePing = {
  visitorId: string;
  path: string;
  title: string | null;
  source: string | null;
  screen: string | null;
  device: Device;
};

export function clampWindowSeconds(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_ACTIVE_WINDOW_SECONDS;
  return Math.min(MAX_ACTIVE_WINDOW_SECONDS, Math.max(MIN_ACTIVE_WINDOW_SECONDS, Math.round(n)));
}

export function cleanVisitorId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** Path only: no query string, no hash (they can carry tokens or personal data). */
export function cleanPath(v: unknown): string {
  if (typeof v !== "string") return "/";
  const p = v.split("?")[0].split("#")[0].trim();
  return p.startsWith("/") ? p.slice(0, 200) : "/";
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = [...v]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

export function deviceFromUserAgent(ua: string | null | undefined): Device {
  const s = ua ?? "";
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T\d/i.test(s)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(s)) return "mobile";
  return "desktop";
}

export function browserFromUserAgent(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (/Instagram|FBAN|FBAV/i.test(s)) return "In-app";
  if (/Edg\//i.test(s)) return "Edge";
  if (/OPR\//i.test(s) || /Opera/i.test(s)) return "Opera";
  if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) return "Chrome";
  if (/Firefox\//i.test(s)) return "Firefox";
  if (/Safari\//i.test(s) && !/Chrome/i.test(s)) return "Safari";
  return "Other";
}

/** Validates + trims an untrusted ping body. Returns null when unusable. */
export function sanitizePing(raw: unknown): LivePing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const visitorId = cleanVisitorId(r.visitorId);
  if (!visitorId) return null;
  const device: Device = r.device === "mobile" || r.device === "tablet" ? r.device : "desktop";
  return {
    visitorId,
    path: cleanPath(r.path),
    title: cleanText(r.title, 120),
    source: cleanText(r.source, 40),
    screen: ["small", "medium", "large"].includes(String(r.screen)) ? String(r.screen) : null,
    device,
  };
}

export type GeoHeaders = {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
};

function decodeHeader(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v;
  try {
    s = decodeURIComponent(v);
  } catch {
    /* keep raw */
  }
  return cleanText(s, 80);
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Approximate location from the hosting platform's geolocation headers
 * (Vercel: x-vercel-ip-country, x-vercel-ip-country-region, x-vercel-ip-city —
 * the city is URL-encoded). Missing headers (local dev, unknown network) give
 * nulls; nothing is looked up from an IP address.
 */
export function geoFromHeaders(get: (name: string) => string | null | undefined): GeoHeaders {
  const code = (get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(code) ? code : null;
  return {
    countryCode,
    country: countryName(countryCode),
    region: decodeHeader(get("x-vercel-ip-country-region")),
    city: decodeHeader(get("x-vercel-ip-city")),
  };
}

export type LiveRow = {
  visitor_id: string;
  first_seen: string | Date;
  last_seen: string | Date;
  path: string | null;
  title: string | null;
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  source: string | null;
  screen: string | null;
};

export type LiveVisitor = {
  /** Short anonymous label (first 6 chars of the id). Never an IP. */
  label: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  path: string;
  title: string | null;
  device: Device;
  browser: string | null;
  source: string | null;
  screen: string | null;
  secondsAgo: number;
  secondsOnSite: number;
};

export type Tally = { key: string; label: string; count: number };

export type LiveSnapshot = {
  windowSeconds: number;
  online: number;
  countries: Tally[];
  cities: Tally[];
  devices: { mobile: number; tablet: number; desktop: number };
  pages: Tally[];
  visitors: LiveVisitor[];
};

function ms(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function tally(items: Array<{ key: string; label: string }>, top = 10): Tally[] {
  const m = new Map<string, Tally>();
  for (const it of items) {
    const cur = m.get(it.key);
    if (cur) cur.count += 1;
    else m.set(it.key, { key: it.key, label: it.label, count: 1 });
  }
  return [...m.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, top);
}

/** Friendly page name from a path: "/category/movies" -> "Category: movies". */
export function pageLabel(path: string): string {
  if (path === "/" || path === "") return "Homepage";
  const seg = path.split("/").filter(Boolean);
  const rest = decodeSeg(seg.slice(1).join("/"));
  switch (seg[0]) {
    case "category":
      return `Category: ${rest}`;
    case "poster":
      return `Poster: ${rest}`;
    case "cart":
      return "Cart";
    case "offers":
      return "Offers";
    case "sets":
      return "Sets";
    case "search":
      return "Search";
    case "best-sellers":
      return "Best sellers";
    case "trending":
      return "Trending";
    case "wishlist":
      return "Wishlist";
    case "track-order":
      return "Track order";
    case "custom-design":
      return "Custom design";
    case "photo-printing":
      return "Photo printing";
    case "photo-4x6":
      return "Photo 4x6";
    default:
      return path;
  }
}

function decodeSeg(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Active = last_seen within the window. Pure so the definition is testable. */
export function buildLiveSnapshot(
  rows: LiveRow[],
  now: number,
  windowSecondsInput: number = DEFAULT_ACTIVE_WINDOW_SECONDS,
): LiveSnapshot {
  const windowSeconds = clampWindowSeconds(windowSecondsInput);
  const active = rows
    .filter((r) => now - ms(r.last_seen) <= windowSeconds * 1000)
    .sort((a, b) => ms(b.last_seen) - ms(a.last_seen));

  const visitors: LiveVisitor[] = active.map((r) => ({
    label: r.visitor_id.slice(0, 6),
    country: r.country,
    countryCode: r.country_code,
    region: r.region,
    city: r.city,
    path: r.path ?? "/",
    title: r.title,
    device: r.device === "mobile" || r.device === "tablet" ? r.device : "desktop",
    browser: r.browser,
    source: r.source,
    screen: r.screen,
    secondsAgo: Math.max(0, Math.round((now - ms(r.last_seen)) / 1000)),
    secondsOnSite: Math.max(0, Math.round((ms(r.last_seen) - ms(r.first_seen)) / 1000)),
  }));

  const devices = { mobile: 0, tablet: 0, desktop: 0 };
  for (const v of visitors) devices[v.device] += 1;

  return {
    windowSeconds,
    online: visitors.length,
    countries: tally(
      visitors.map((v) => ({ key: v.countryCode ?? "??", label: v.country ?? "Unknown" })),
    ),
    cities: tally(
      visitors.map((v) => ({
        key: `${v.countryCode ?? "??"}|${v.city ?? ""}`,
        label: v.city ? `${v.city}${v.country ? `, ${v.country}` : ""}` : "Unknown",
      })),
    ),
    devices,
    pages: tally(visitors.map((v) => ({ key: v.path, label: pageLabel(v.path) }))),
    visitors,
  };
}
