// Server-only Meta Conversions API sender. Shared by:
//  - browser-relayed events (sendCapiEvent in meta-capi.functions.ts — allow-listed,
//    never Purchase),
//  - the trusted server-side Purchase (sent from the order functions, from STORED
//    order data), and
//  - the admin-triggered "OrderConfirmed" event (customer confirmed on WhatsApp).
//
// Configuration (no Supabase): pixel id + flags come from Neon `site_settings`,
// the access token only from the META_PIXEL_ACCESS_TOKEN environment variable.
// The token never leaves this file and is never logged.
import { sql } from "@/lib/neon.server";
import { isProductionRequest } from "@/lib/analytics-host.server";
import { sanitizeOrderAttribution } from "@/lib/order-attribution";
import {
  cleanFbc,
  cleanFbclid,
  cleanFbp,
  cleanSourceUrl,
  isRelayedEvent,
  purchaseCustomData,
  sanitizeMetaParams,
  type PurchasePayload,
  type RelayInput,
} from "@/lib/meta-events";

const GRAPH_VERSION = "v23.0";
const SETTING_KEYS = ["meta_pixel_id", "meta_capi_enabled", "meta_advanced_matching_enabled"];
const SETTINGS_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 3_000;

type CapiConfig = {
  pixelId: string;
  capiEnabled: boolean;
  advancedMatching: boolean;
  token: string;
  testEventCode: string;
};

type Settings = Pick<CapiConfig, "pixelId" | "capiEnabled" | "advancedMatching">;
let settingsCache: { at: number; value: Settings } | null = null;

/** Test hook. */
export function _resetMetaCapiCacheForTests() {
  settingsCache = null;
}

// Neon is the single source of truth: the browser reads the same rows. Cached
// briefly so a burst of page views does not turn into a burst of queries.
async function readSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  let map = new Map<string, unknown>();
  try {
    const rows = (await sql()`
      select key, value from site_settings where key = any(${SETTING_KEYS})
    `) as Array<{ key: string; value: unknown }>;
    map = new Map(rows.map((r) => [r.key, r.value]));
  } catch {
    /* unreadable settings => CAPI stays off (never guess) */
  }
  const bool = (k: string) => map.get(k) === true || map.get(k) === "true";
  const value: Settings = {
    pixelId: String(map.get("meta_pixel_id") ?? "").trim(),
    capiEnabled: bool("meta_capi_enabled"),
    advancedMatching: bool("meta_advanced_matching_enabled"),
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

async function loadCapiConfig(): Promise<CapiConfig> {
  const settings = await readSettings();
  return {
    ...settings,
    token: process.env.META_PIXEL_ACCESS_TOKEN?.trim() ?? "",
    // Set META_CAPI_TEST_EVENT_CODE only while testing in Events Manager → Test Events.
    testEventCode: process.env.META_CAPI_TEST_EVENT_CODE?.trim() ?? "",
  };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const normEmail = (v: string) => v.trim().toLowerCase();
const normName = (v: string) => v.trim().toLowerCase();
// Meta hashes phones with the country code and no leading zero. Egyptian mobiles
// are stored as 01XXXXXXXXX (11 digits) → 201XXXXXXXXX. Without this the hash
// never matches Meta's own.
export function normPhone(v: string) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = "20" + d.slice(1);
  return d;
}

export type MetaServerEvent = {
  event_name: string;
  event_id: string;
  event_time?: number; // unix seconds; defaults to now
  action_source?: "website" | "system_generated";
  event_source_url?: string;
  custom_data?: Record<string, unknown>;
  user: {
    // Hashed only when the owner enabled Advanced Matching:
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
    // Sent as-is / hashed here regardless:
    fbp?: string;
    fbc?: string;
    external_id?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  };
};

export type CapiResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  body?: string; // Meta's error response, JSON-stringified so the result stays serializable
  error?: string;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one event. Never throws. A retry re-sends the IDENTICAL payload (same
 * event_id), so Meta deduplicates it instead of counting it twice. Each attempt
 * is time-boxed so a Meta outage cannot hold a request open.
 */
export async function sendMetaEvent(
  e: MetaServerEvent,
  opts: {
    retries?: number;
    timeoutMs?: number;
    /** The production-host decision, when the caller captured it while the request
     *  was still in scope (work that runs after the response cannot read headers). */
    production?: boolean;
  } = {},
): Promise<CapiResult> {
  // Local development and preview deployments share the production database and
  // pixel: they must never produce real conversions.
  if (!(opts.production ?? isProductionRequest()))
    return { ok: true, skipped: true, reason: "non_production_host" };

  const cfg = await loadCapiConfig();
  if (!cfg.capiEnabled) return { ok: true, skipped: true, reason: "capi_disabled" };
  if (!/^\d{6,20}$/.test(cfg.pixelId)) {
    return { ok: false, skipped: true, reason: "invalid_pixel_id" };
  }
  if (!cfg.token) return { ok: false, skipped: true, reason: "no_access_token" };

  const u = e.user;
  const user_data: Record<string, unknown> = {};
  if (u.client_user_agent) user_data.client_user_agent = u.client_user_agent;
  if (u.client_ip_address) user_data.client_ip_address = u.client_ip_address;
  const fbp = cleanFbp(u.fbp);
  const fbc = cleanFbc(u.fbc);
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;
  if (u.external_id) user_data.external_id = [await sha256Hex(u.external_id)];
  if (cfg.advancedMatching) {
    if (u.email) user_data.em = [await sha256Hex(normEmail(u.email))];
    if (u.phone) user_data.ph = [await sha256Hex(normPhone(u.phone))];
    if (u.city) user_data.ct = [await sha256Hex(normName(u.city))];
    if (u.country) user_data.country = [await sha256Hex(normName(u.country))];
  }

  const payload: Record<string, unknown> = {
    // Token in the body, not the URL, so it can't leak into access logs.
    access_token: cfg.token,
    data: [
      {
        event_name: e.event_name,
        event_time: e.event_time ?? Math.floor(Date.now() / 1000),
        event_id: e.event_id,
        event_source_url: cleanSourceUrl(e.event_source_url),
        action_source: e.action_source ?? "website",
        user_data,
        custom_data: e.custom_data ?? {},
      },
    ],
  };
  if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;
  const body = JSON.stringify(payload);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(cfg.pixelId)}/events`;

  const attempts = 1 + Math.max(0, opts.retries ?? 1);
  let last: CapiResult = { ok: false, error: "capi_failed" };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(300 * attempt);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (res.ok) return { ok: true };
      const errBody = await res.json().catch(() => ({}));
      last = { ok: false, status: res.status, body: JSON.stringify(errBody).slice(0, 1000) };
      // A 4xx (other than rate limiting) will not succeed by trying again.
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, error: err instanceof Error ? err.message : "capi_failed" };
    }
  }
  return last;
}

/** Client IP + user agent from the incoming request (the browser can't know its public IP). */
export async function getRequestContext(): Promise<{ ip?: string; ua?: string }> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const h = getRequest().headers;
    const ip = (
      h.get("x-forwarded-for")?.split(",")[0] ??
      h.get("x-real-ip") ??
      h.get("cf-connecting-ip") ??
      ""
    ).trim();
    return { ip: ip || undefined, ua: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

/**
 * Everything about the current request that Meta work needs. Call it BEFORE
 * deferring work past the response: request headers are not available afterwards.
 */
export async function captureRequestFacts(): Promise<{
  ctx: { ip?: string; ua?: string };
  production: boolean;
}> {
  return { ctx: await getRequestContext(), production: isProductionRequest() };
}

export type CleanTracking = {
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  event_source_url?: string;
};

/** Validate the client-supplied tracking blob: only well-formed Meta identifiers survive. */
export function sanitizeTracking(raw: Record<string, unknown> | undefined | null): CleanTracking {
  const out: CleanTracking = {};
  const fbp = cleanFbp(raw?.fbp);
  const fbc = cleanFbc(raw?.fbc);
  const fbclid = cleanFbclid(raw?.fbclid);
  const url = cleanSourceUrl(raw?.event_source_url);
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  if (fbclid) out.fbclid = fbclid;
  if (url) out.event_source_url = url;
  return out;
}

/** Whitelist + validate the client-supplied tracking blob, then add server-observed fields. */
export async function buildAdTracking(
  raw: Record<string, unknown> | undefined,
  purchaseRef: string | undefined,
  facts?: { ip?: string; ua?: string },
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...sanitizeTracking(raw) };
  // The attribution state at order time (first/last touch, Meta ids from the ad
  // link, click id): allow-listed, and stamped with the SERVER's clock.
  const attribution = sanitizeOrderAttribution(raw?.attribution);
  if (attribution) out.attribution = attribution;
  const ctx = facts ?? (await getRequestContext());
  if (ctx.ip) out.ip = ctx.ip;
  if (ctx.ua) out.ua = ctx.ua.slice(0, 1024);
  if (purchaseRef) out.purchase_ref = purchaseRef;
  return out;
}

/**
 * The server-side Purchase. `purchase` must come from buildPurchasePayload()
 * (stored order values); the deterministic event_id lets it deduplicate with
 * the browser Pixel event of the same order. Time-boxed and never throws, so
 * order creation cannot depend on Meta.
 */
export async function sendPurchaseToMeta(
  args: {
    purchase: PurchasePayload;
    tracking?: Record<string, unknown>;
    guestSessionId?: string | null;
    phone?: string;
    city?: string;
    /** Request facts captured before the response (see captureRequestFacts). */
    facts?: { ctx: { ip?: string; ua?: string }; production: boolean };
  },
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<CapiResult> {
  const t = sanitizeTracking(args.tracking);
  const ctx = args.facts?.ctx ?? (await getRequestContext());
  return sendMetaEvent(
    {
      event_name: "Purchase",
      event_id: args.purchase.event_id,
      event_source_url: t.event_source_url,
      custom_data: purchaseCustomData(args.purchase),
      user: {
        phone: args.phone,
        city: args.city,
        country: "EG",
        fbp: t.fbp,
        fbc: t.fbc,
        external_id: args.guestSessionId ?? undefined,
        client_ip_address: ctx.ip,
        client_user_agent: ctx.ua,
      },
    },
    {
      retries: opts.retries ?? 0,
      timeoutMs: opts.timeoutMs ?? 2_500,
      production: args.facts?.production,
    },
  );
}

type OrderRow = {
  id: string;
  order_number: string;
  phone: string;
  governorate: string;
  total_price: string | number;
  guest_session_id: string | null;
  is_test: boolean;
  ad_tracking: Record<string, string> | null;
};

/**
 * Sends one `OrderConfirmed` custom event per checkout when the customer
 * confirms. Custom (not Purchase) on purpose: Purchase was already sent at order
 * time, and a second Purchase would double-count revenue. Idempotent: the first
 * caller atomically claims the group; a failed send releases the claim so
 * re-confirming retries (with the same event_id).
 */
export async function sendOrderConfirmedToMeta(
  orderIds: string[],
  opts: { production?: boolean } = {},
): Promise<CapiResult> {
  const client = sql();
  const rows = (await client`
    select id, order_number, phone, governorate, total_price, guest_session_id, is_test, ad_tracking
    from orders where id = any(${orderIds}) order by created_at, order_number
  `) as OrderRow[];
  if (!rows.length) return { ok: true, skipped: true, reason: "no_orders" };
  if (rows.some((r) => r.is_test)) return { ok: true, skipped: true, reason: "test_order" };

  const claimed = (await client`
    update orders
    set ad_tracking = coalesce(ad_tracking, '{}'::jsonb) || jsonb_build_object('confirmed_event_sent_at', now()::text)
    where id = any(${orderIds}) and not (coalesce(ad_tracking, '{}'::jsonb) ? 'confirmed_event_sent_at')
    returning id
  `) as Array<{ id: string }>;
  if (!claimed.length) return { ok: true, skipped: true, reason: "already_sent" };

  const t = rows.find((r) => r.ad_tracking)?.ad_tracking ?? {};
  const purchaseRef = t.purchase_ref ?? rows[0].order_number;
  const value = rows.reduce((s, r) => s + Number(r.total_price || 0), 0);

  const result = await sendMetaEvent(
    {
      event_name: "OrderConfirmed",
      event_id: `confirmed_${purchaseRef}`,
      action_source: "system_generated",
      custom_data: {
        value,
        currency: "EGP",
        order_id: purchaseRef,
        content_type: "product",
        num_items: rows.length,
      },
      user: {
        phone: rows[0].phone,
        city: rows[0].governorate,
        country: "EG",
        fbp: t.fbp,
        fbc: t.fbc,
        external_id: rows[0].guest_session_id ?? undefined,
        client_ip_address: t.ip,
        client_user_agent: t.ua,
      },
    },
    { production: opts.production },
  );

  if (!result.ok || result.skipped) {
    await client`
      update orders set ad_tracking = ad_tracking - 'confirmed_event_sent_at'
      where id = any(${orderIds})
    `;
  }
  return result;
}

/* --------------------- public browser → Conversions API relay --------------------- */

// A best-effort, per-instance limiter: it caps how fast a single client can push
// events through this public endpoint (the allow-list is the real protection).
const RELAY_LIMIT = 120; // events
const RELAY_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function _resetRelayLimiterForTests() {
  hits.clear();
}

function allowRelay(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RELAY_WINDOW_MS);
  if (recent.length >= RELAY_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RELAY_WINDOW_MS)) hits.delete(k);
  }
  return true;
}

/** What the public relay returns: deliberately nothing but the outcome. */
export type RelayResult = { ok: boolean; skipped?: boolean };

/**
 * Forwards one browser event. The name was validated by the schema; here the
 * payload is sanitised again server-side (the browser is never trusted), the
 * IP / user agent come from the request itself, and Purchase can never arrive
 * this way.
 */
export async function relayBrowserEvent(data: RelayInput): Promise<RelayResult> {
  if (!isRelayedEvent(data.event_name)) return { ok: false, skipped: true };
  const ctx = await getRequestContext();
  if (!allowRelay(ctx.ip ?? "unknown")) return { ok: true, skipped: true };
  const r = await sendMetaEvent({
    event_name: data.event_name,
    event_id: data.event_id,
    event_source_url: data.event_source_url,
    custom_data: sanitizeMetaParams(data.custom_data),
    user: {
      email: data.user_data.email,
      phone: data.user_data.phone,
      city: data.user_data.city,
      country: data.user_data.country,
      fbp: data.fbp,
      fbc: data.fbc,
      external_id: data.external_id,
      client_ip_address: ctx.ip,
      client_user_agent: data.client_user_agent ?? ctx.ua,
    },
  });
  // Public endpoint: say only whether it went through. Meta's error text, the
  // reason code and the CAPI configuration state stay on the server.
  return r.skipped ? { ok: r.ok, skipped: true } : { ok: r.ok };
}
