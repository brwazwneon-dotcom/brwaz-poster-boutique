// Server-only TikTok Events API sender (the server half of the TikTok pixel).
// Mirrors the Meta Conversions API module's guarantees:
//  - the access token is server-only (TIKTOK_EVENTS_ACCESS_TOKEN) and never
//    logged, returned or stored;
//  - configuration comes from Neon `site_settings`, and everything is OFF until
//    the owner turns it on (`tiktok_events_api_enabled`) AND a token exists;
//  - non-production hosts never send (dev/preview share the production pixel);
//  - a send can never fail or hold up an order: time-boxed, never throws, and a
//    retry re-sends the IDENTICAL payload (same event_id), so TikTok
//    deduplicates it instead of counting it twice;
//  - the public relay accepts only allow-listed events, never Purchase, and
//    answers with the outcome alone.
//
// Endpoint (TikTok's consolidated Events API): POST /open_api/v1.3/event/track/
// with the `Access-Token` header. NOTE: written from TikTok's public integration
// guides — the official portal could not be read when this was built — so the
// first live test must go through Events Manager -> Test Events
// (TIKTOK_TEST_EVENT_CODE) before anything is trusted.
import { sql } from "@/lib/neon.server";
import { isProductionRequest } from "@/lib/analytics-host.server";
import { getRequestContext, normPhone } from "@/lib/meta-capi.server";
import { cleanSourceUrl } from "@/lib/meta-events";
import type { PurchasePayload } from "@/lib/meta-events";
import {
  DEFAULT_TIKTOK_PIXEL_CODE,
  TIKTOK_PURCHASE_EVENT,
  cleanTtclid,
  cleanTtp,
  isTikTokRelayedEvent,
  sanitizeTikTokTracking,
  tiktokEventName,
  tiktokPurchaseProperties,
  toTikTokProperties,
  type TikTokRelayInput,
} from "@/lib/tiktok-events";

const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const SETTING_KEYS = [
  "tiktok_pixel_id",
  "tiktok_events_api_enabled",
  "tiktok_advanced_matching_enabled",
];
const SETTINGS_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 3_000;

type Settings = { pixelCode: string; enabled: boolean; advancedMatching: boolean };
type Config = Settings & { token: string; testEventCode: string };

let settingsCache: { at: number; value: Settings } | null = null;

/** Test hook. */
export function _resetTikTokCacheForTests() {
  settingsCache = null;
  relayHits.clear();
}

async function readSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  let map = new Map<string, unknown>();
  try {
    const rows = (await sql()`
      select key, value from site_settings where key = any(${SETTING_KEYS})
    `) as Array<{ key: string; value: unknown }>;
    map = new Map(rows.map((r) => [r.key, r.value]));
  } catch {
    /* unreadable settings => the Events API stays off (never guess) */
  }
  const bool = (k: string) => map.get(k) === true || map.get(k) === "true";
  const configured = String(map.get("tiktok_pixel_id") ?? "").trim();
  const value: Settings = {
    // TikTok pixel codes are 20 upper-case alphanumerics; anything else falls back to the site's pixel.
    pixelCode: /^[A-Z0-9]{10,30}$/.test(configured) ? configured : DEFAULT_TIKTOK_PIXEL_CODE,
    enabled: bool("tiktok_events_api_enabled"),
    advancedMatching: bool("tiktok_advanced_matching_enabled"),
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

async function loadConfig(): Promise<Config> {
  const s = await readSettings();
  return {
    ...s,
    token: process.env.TIKTOK_EVENTS_ACCESS_TOKEN?.trim() ?? "",
    // Set TIKTOK_TEST_EVENT_CODE only while testing in Events Manager -> Test Events.
    testEventCode: process.env.TIKTOK_TEST_EVENT_CODE?.trim() ?? "",
  };
}

/** Configuration state for the admin — booleans and the public pixel code only, never the token. */
export async function getTikTokEventsStatus(): Promise<{
  pixelCode: string;
  eventsApiEnabled: boolean;
  tokenConfigured: boolean;
  advancedMatching: boolean;
  testModeOn: boolean;
}> {
  const c = await loadConfig();
  return {
    pixelCode: c.pixelCode,
    eventsApiEnabled: c.enabled,
    tokenConfigured: !!c.token,
    advancedMatching: c.advancedMatching,
    testModeOn: !!c.testEventCode,
  };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const normEmail = (v: string) => v.trim().toLowerCase();
/** TikTok hashes phones in E.164 (with the leading "+"). Egyptian 01XXXXXXXXX -> +201XXXXXXXXX. */
export const tiktokPhone = (v: string) => {
  const d = normPhone(v);
  return d ? `+${d}` : "";
};

export type TikTokServerEvent = {
  /** TikTok's event name (e.g. "CompletePayment"). */
  event: string;
  event_id: string;
  event_time?: number; // unix seconds
  event_source_url?: string;
  properties?: Record<string, unknown>;
  user: {
    email?: string;
    phone?: string;
    ttclid?: string;
    ttp?: string;
    external_id?: string;
    ip?: string;
    user_agent?: string;
  };
};

export type TikTokResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  /** TikTok's own response code/message, JSON-stringified (server-side only). */
  body?: string;
  error?: string;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one event. Never throws. A retry re-sends the identical payload; only
 * network errors, HTTP 5xx and 429 are retried — TikTok's business errors
 * (bad token, bad pixel, bad schema) are answered with HTTP 200 and a non-zero
 * `code`, which retrying cannot fix.
 */
export async function sendTikTokEvent(
  e: TikTokServerEvent,
  opts: { retries?: number; timeoutMs?: number; production?: boolean } = {},
): Promise<TikTokResult> {
  if (!(opts.production ?? isProductionRequest()))
    return { ok: true, skipped: true, reason: "non_production_host" };

  const cfg = await loadConfig();
  if (!cfg.enabled) return { ok: true, skipped: true, reason: "events_api_disabled" };
  if (!cfg.token) return { ok: false, skipped: true, reason: "no_access_token" };

  const u = e.user;
  const user: Record<string, unknown> = {};
  const ttclid = cleanTtclid(u.ttclid);
  const ttp = cleanTtp(u.ttp);
  if (ttclid) user.ttclid = ttclid;
  if (ttp) user.ttp = ttp;
  if (u.ip) user.ip = u.ip;
  if (u.user_agent) user.user_agent = u.user_agent;
  if (u.external_id) user.external_id = await sha256Hex(u.external_id.trim());
  if (cfg.advancedMatching) {
    if (u.email) user.email = await sha256Hex(normEmail(u.email));
    const phone = u.phone ? tiktokPhone(u.phone) : "";
    if (phone) user.phone = await sha256Hex(phone);
  }

  const url = cleanSourceUrl(e.event_source_url);
  const payload: Record<string, unknown> = {
    event_source: "web",
    event_source_id: cfg.pixelCode,
    data: [
      {
        event: e.event,
        event_time: e.event_time ?? Math.floor(Date.now() / 1000),
        event_id: e.event_id,
        user,
        ...(url ? { page: { url } } : {}),
        properties: e.properties ?? {},
      },
    ],
  };
  if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;
  const body = JSON.stringify(payload);

  const attempts = 1 + Math.max(0, opts.retries ?? 1);
  let last: TikTokResult = { ok: false, error: "tiktok_failed" };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(300 * attempt);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        // The token travels in a header, never in the URL.
        headers: { "Content-Type": "application/json", "Access-Token": cfg.token },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
      if (res.ok && json.code === 0) return { ok: true };
      last = {
        ok: false,
        status: res.status,
        body: JSON.stringify({ code: json.code ?? null, message: json.message ?? null }).slice(
          0,
          500,
        ),
      };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, error: err instanceof Error ? err.message : "tiktok_failed" };
    }
  }
  return last;
}

/**
 * The server-side CompletePayment. `purchase` must come from buildPurchasePayload()
 * (stored order values); its deterministic event_id matches the browser pixel's,
 * so TikTok counts the order once. Time-boxed and never throws.
 */
export async function sendTikTokPurchase(
  args: {
    purchase: PurchasePayload;
    tracking?: Record<string, unknown>;
    guestSessionId?: string | null;
    phone?: string;
    /** Request facts captured before the response (work after it cannot read the request). */
    facts?: { ctx: { ip?: string; ua?: string }; production: boolean };
  },
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<TikTokResult> {
  const t = sanitizeTikTokTracking(args.tracking);
  const ctx = args.facts?.ctx ?? (await getRequestContext());
  const sourceUrl =
    typeof args.tracking?.event_source_url === "string"
      ? args.tracking.event_source_url
      : undefined;
  return sendTikTokEvent(
    {
      event: TIKTOK_PURCHASE_EVENT,
      event_id: args.purchase.event_id,
      event_source_url: sourceUrl,
      properties: tiktokPurchaseProperties(args.purchase),
      user: {
        phone: args.phone,
        ttclid: t.ttclid,
        ttp: t.ttp,
        external_id: args.guestSessionId ?? undefined,
        ip: ctx.ip,
        user_agent: ctx.ua,
      },
    },
    {
      retries: opts.retries ?? 0,
      timeoutMs: opts.timeoutMs ?? 2_500,
      production: args.facts?.production,
    },
  );
}

/* ------------------------------ public relay ------------------------------ */

const RELAY_LIMIT = 120; // events per minute per client
const RELAY_WINDOW_MS = 60_000;
const relayHits = new Map<string, number[]>();

function allowRelay(key: string, now = Date.now()): boolean {
  const recent = (relayHits.get(key) ?? []).filter((t) => now - t < RELAY_WINDOW_MS);
  if (recent.length >= RELAY_LIMIT) {
    relayHits.set(key, recent);
    return false;
  }
  recent.push(now);
  relayHits.set(key, recent);
  if (relayHits.size > 5_000) {
    for (const [k, v] of relayHits)
      if (!v.some((t) => now - t < RELAY_WINDOW_MS)) relayHits.delete(k);
  }
  return true;
}

/** What the public relay returns: deliberately nothing but the outcome. */
export type TikTokRelayResult = { ok: boolean; skipped?: boolean };

/**
 * Forwards one browser event. The name was validated by the schema; the payload is
 * sanitised again here (the browser is never trusted), the IP / user agent come
 * from the request itself, and Purchase can never arrive this way.
 */
export async function relayTikTokBrowserEvent(data: TikTokRelayInput): Promise<TikTokRelayResult> {
  const event = tiktokEventName(data.event_name);
  if (!event || !isTikTokRelayedEvent(data.event_name)) return { ok: false, skipped: true };
  const ctx = await getRequestContext();
  if (!allowRelay(ctx.ip ?? "unknown")) return { ok: true, skipped: true };
  const r = await sendTikTokEvent({
    event,
    event_id: data.event_id,
    event_source_url: data.event_source_url,
    properties: toTikTokProperties(data.custom_data),
    user: {
      email: data.user_data.email,
      phone: data.user_data.phone,
      ttclid: data.ttclid,
      ttp: data.ttp,
      external_id: data.external_id,
      ip: ctx.ip,
      user_agent: data.client_user_agent ?? ctx.ua,
    },
  });
  // Public endpoint: only whether it went through. TikTok's error text, the reason
  // code and the configuration state stay on the server.
  return r.skipped ? { ok: r.ok, skipped: true } : { ok: r.ok };
}
