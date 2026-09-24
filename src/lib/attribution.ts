/**
 * ONE source taxonomy and ONE touch classifier for the whole site.
 *
 * Visits, events, the checkout (orders.utm_*), the admin reports and the ad
 * pixels must all describe a source the same way — `ig`, `instagram` and
 * `l.instagram.com` are all "instagram". Everything that needs to name a
 * source calls normalizeSource() / classifyTouch() from here.
 *
 * First touch = what originally brought the visitor (kept 90 days).
 * Last touch  = the last NON-DIRECT source that brought them back (30 days).
 * Nothing is guessed: an unknown utm_source is "other", an unknown referrer
 * host is "referral", and an internal navigation is not a touch at all.
 */

export const SOURCES = [
  "instagram",
  "facebook",
  "tiktok",
  "google",
  "organic",
  "direct",
  "referral",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];

export type Touch = {
  source: Source;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

const SEARCH_ENGINES = ["bing", "duckduckgo", "yahoo", "ecosia", "yandex", "baidu", "startpage"];
const REFERRAL_HOSTS = [
  "whatsapp",
  "wa.me",
  "l.wl.co",
  "telegram",
  "t.me",
  "twitter",
  "t.co",
  "linkedin",
  "youtube",
  "youtu.be",
  "reddit",
  "pinterest",
  "snapchat",
  "chatgpt",
  "openai",
];
const SOCIAL: readonly Source[] = ["instagram", "facebook", "tiktok"];

const includesAny = (s: string, needles: readonly string[]) => needles.some((n) => s.includes(n));

/**
 * Maps any raw source string (a utm_source value, a referrer host, or a value
 * from the legacy analytics_visits.source column) onto the taxonomy.
 * Returns null for empty input so callers can tell "no value" from "other".
 */
export function normalizeSource(raw: string | null | undefined): Source | null {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s === "(direct)" || s === "direct" || s === "(none)" || s === "none") return "direct";
  if (s === "ig" || s.includes("instagram")) return "instagram";
  // `meta` is the value our own landing-page links use (landingUtmUrl) and the
  // generic Meta Ads default; the Meta family is reported as facebook.
  if (
    s === "fb" ||
    s === "meta" ||
    s === "m.me" ||
    s.startsWith("fb.") ||
    s.startsWith("fb_") ||
    includesAny(s, ["facebook", "messenger"])
  ) {
    return "facebook";
  }
  if (s === "tt" || includesAny(s, ["tiktok", "tik_tok", "tik-tok"])) return "tiktok";
  if (includesAny(s, ["google", "adwords", "gads"])) return "google";
  if (s === "organic" || includesAny(s, SEARCH_ENGINES)) return "organic";
  if (s === "referral") return "referral";
  if (s === "wa" || s === "x" || includesAny(s, REFERRAL_HOSTS)) return "referral";
  return "other";
}

export function isSocialSource(s: Source | null | undefined): boolean {
  return !!s && SOCIAL.includes(s);
}

/** Lower-cased hostname without `www.`, or null when the URL is empty/invalid. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function isOwnHost(refHost: string, hostname: string): boolean {
  const own = hostname.toLowerCase().replace(/^www\./, "");
  return refHost === own || refHost === "brwazwneon.com" || refHost.endsWith(".brwazwneon.com");
}

export type ClassifyInput = { search: string; referrer: string; hostname: string };

const clip = (v: string | null, max = 200): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Classifies one page load. Returns null when it is an internal navigation
 * (referrer is our own site) — that says nothing about where the visitor
 * came from and must never overwrite a real touch.
 */
export function classifyTouch({ search, referrer, hostname }: ClassifyInput): Touch | null {
  const p = new URLSearchParams(search);
  const utmSource = clip(p.get("utm_source"), 100);
  const medium = clip(p.get("utm_medium"), 100)?.toLowerCase() ?? null;
  const campaign = clip(p.get("utm_campaign"));
  const content = clip(p.get("utm_content"));
  const term = clip(p.get("utm_term"));
  const refHost = hostOf(referrer);

  if (utmSource) {
    let source: Source = normalizeSource(utmSource) ?? "other";
    if (source === "google" && medium && /organic|seo/.test(medium)) source = "organic";
    return { source, medium, campaign, content, term };
  }
  // Ad-platform click ids identify the platform even when UTMs were stripped.
  if (p.get("gclid")) return { source: "google", medium: null, campaign, content, term };
  if (p.get("ttclid")) return { source: "tiktok", medium: null, campaign, content, term };
  if (p.get("fbclid")) {
    const fromInstagram = !!refHost && refHost.includes("instagram");
    return {
      source: fromInstagram ? "instagram" : "facebook",
      medium: null,
      campaign,
      content,
      term,
    };
  }

  if (!refHost)
    return { source: "direct", medium: null, campaign: null, content: null, term: null };
  if (isOwnHost(refHost, hostname)) return null;

  const norm = normalizeSource(refHost);
  // A Google referrer without a click id or UTM is an organic search result —
  // paid Google traffic carries gclid/utm and was classified above.
  const source: Source =
    norm === "google"
      ? "organic"
      : !norm || norm === "other" || norm === "direct"
        ? "referral"
        : norm;
  const refMedium = isSocialSource(source)
    ? "social"
    : source === "organic"
      ? "organic"
      : "referral";
  return { source, medium: refMedium, campaign: null, content: null, term: null };
}

/* ---------------- client storage: first / last touch ---------------- */

const STORAGE_KEY = "brw-attribution-v1";
const SESSION_FLAG = "brw-attr-eval";
const FIRST_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LAST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredTouch = Touch & { ts: number };
// The Meta click id lives in the same record as the touches (one store, one
// expiry policy). `fbclid` is only in the landing URL, so it must be kept to
// build the `fbc` value the Conversions API needs at checkout time.
type Stored = {
  first?: StoredTouch;
  last?: StoredTouch;
  clickIds?: { fbclid: string; ts: number };
};

export type AttributionSnapshot = { first: Touch | null; last: Touch | null };

/** Flat columns as stored in analytics_visits / analytics_poster_events. */
export type AttributionFields = {
  first_source?: string;
  first_medium?: string;
  first_campaign?: string;
  first_content?: string;
  first_term?: string;
  last_source?: string;
  last_medium?: string;
  last_campaign?: string;
  last_content?: string;
  last_term?: string;
};

let evaluatedThisPageLifetime = false;

function readStored(now: number): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Stored) : {};
    if (s.first && now - s.first.ts > FIRST_TTL_MS) delete s.first;
    if (s.last && now - s.last.ts > LAST_TTL_MS) delete s.last;
    // Same window Meta uses for the _fbc cookie.
    if (s.clickIds && now - s.clickIds.ts > FIRST_TTL_MS) delete s.clickIds;
    return s;
  } catch {
    return {};
  }
}

function toTouch(t: StoredTouch | undefined): Touch | null {
  if (!t) return null;
  return {
    source: t.source,
    medium: t.medium,
    campaign: t.campaign,
    content: t.content,
    term: t.term,
  };
}

/**
 * Evaluates the current page load and updates first/last touch when it is a
 * new session or the URL carries campaign parameters. Safe to call on every
 * page view. Never throws.
 */
export function captureAttribution(now = Date.now()): AttributionSnapshot {
  if (typeof window === "undefined") return { first: null, last: null };
  try {
    const stored = readStored(now);
    const search = window.location.search || "";
    const explicit = /[?&](utm_source|gclid|fbclid|ttclid)=/.test(search);

    // A fresh Meta click id is remembered immediately (it is not a "touch":
    // it never changes first/last touch, it only feeds the `fbc` value).
    const fbclid = new URLSearchParams(search).get("fbclid")?.trim().slice(0, 512);
    if (fbclid && fbclid !== stored.clickIds?.fbclid) {
      stored.clickIds = { fbclid, ts: now };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        /* storage blocked — fbc is then only available from the _fbc cookie */
      }
    }

    let sessionSeen = evaluatedThisPageLifetime;
    try {
      sessionSeen = sessionSeen || window.sessionStorage.getItem(SESSION_FLAG) === "1";
    } catch {
      /* session storage blocked — the in-memory flag still protects SPA navigation */
    }
    if (sessionSeen && !explicit)
      return { first: toTouch(stored.first), last: toTouch(stored.last) };

    const touch = classifyTouch({
      search,
      referrer: document.referrer || "",
      hostname: window.location.hostname,
    });
    if (!touch) return { first: toTouch(stored.first), last: toTouch(stored.last) };

    evaluatedThisPageLifetime = true;
    try {
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* ignore */
    }

    if (!stored.first) stored.first = { ...touch, ts: now };
    // Direct visits never overwrite a real last touch (last non-direct click).
    if (touch.source !== "direct" || !stored.last) stored.last = { ...touch, ts: now };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      /* storage blocked — attribution just degrades to per-session */
    }
    return { first: toTouch(stored.first), last: toTouch(stored.last) };
  } catch {
    return { first: null, last: null };
  }
}

/** Current first/last touch without evaluating the page load. */
export function getAttribution(now = Date.now()): AttributionSnapshot {
  if (typeof window === "undefined") return { first: null, last: null };
  const s = readStored(now);
  return { first: toTouch(s.first), last: toTouch(s.last) };
}

export function toAttributionFields(a: AttributionSnapshot): AttributionFields {
  const out: AttributionFields = {};
  if (a.first) {
    out.first_source = a.first.source;
    if (a.first.medium) out.first_medium = a.first.medium;
    if (a.first.campaign) out.first_campaign = a.first.campaign;
    if (a.first.content) out.first_content = a.first.content;
    if (a.first.term) out.first_term = a.first.term;
  }
  if (a.last) {
    out.last_source = a.last.source;
    if (a.last.medium) out.last_medium = a.last.medium;
    if (a.last.campaign) out.last_campaign = a.last.campaign;
    if (a.last.content) out.last_content = a.last.content;
    if (a.last.term) out.last_term = a.last.term;
  }
  return out;
}

/**
 * The order's utm_* columns, from the canonical LAST touch: only a campaign /
 * paid / social touch is stamped (a plain direct or organic visit carries no
 * campaign context). Replaces the separate landing-page-only UTM store.
 */
export function toOrderUtm(a: AttributionSnapshot = getAttribution()): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
} {
  const l = a.last;
  // "organic" / "referral" are the mediums classifyTouch assigns by itself to
  // search and link referrals; only a real campaign, paid or social touch counts.
  const stamp =
    !!l &&
    (!!l.campaign ||
      isSocialSource(l.source) ||
      (!!l.medium && l.medium !== "organic" && l.medium !== "referral"));
  return {
    utm_source: stamp && l ? l.source : null,
    utm_medium: stamp && l ? l.medium : null,
    utm_campaign: stamp && l ? l.campaign : null,
  };
}

function readCookie(name: string): string | undefined {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

export type MetaIdentifiers = { fbp?: string; fbc?: string };

/**
 * Meta's browser identifiers for the Conversions API. Prefers the cookies the
 * Pixel writes itself; otherwise builds `fbc` from the stored fbclid in Meta's
 * documented format `fb.<subdomain index>.<click time in ms>.<fbclid>`.
 */
export function getMetaIdentifiers(now = Date.now()): MetaIdentifiers {
  if (typeof window === "undefined") return {};
  const stored = readStored(now).clickIds;
  const fbc = readCookie("_fbc") ?? (stored ? `fb.1.${stored.ts}.${stored.fbclid}` : undefined);
  return { fbp: readCookie("_fbp"), fbc };
}

/** Test hook — resets the in-memory session flag. */
export function _resetAttributionForTests() {
  evaluatedThisPageLifetime = false;
}
