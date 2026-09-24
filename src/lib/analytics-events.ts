/**
 * The Neon + GA4 arm of the central tracking fan-out.
 *
 *   trackEvent()/trackCustom()  (src/lib/meta-pixel.ts — the one entry point)
 *      ├── Meta Pixel + Conversions API
 *      ├── TikTok
 *      ├── GA4            (src/lib/ga4.ts converts to the GA4 ecommerce shape)
 *      └── Neon           (this file → logAnalyticsEventsPublic)
 *
 * Only events that have no internal equivalent yet are written to Neon:
 * product views, cart adds, wishlist adds, checkout starts, searches and page
 * views already have their own writers, and purchases are read from `orders`
 * (the source of truth). Re-recording any of those would double count.
 *
 * Everything here is non-blocking and swallowed on failure — an analytics
 * problem must never affect browsing, the cart or checkout.
 */
import { logAnalyticsEventsPublic } from "@/lib/db-public.functions";
import { visitorId, sessionId } from "@/lib/analytics";
import { clientTrackingAllowed } from "@/lib/analytics-env";
import { isPreviewMode } from "@/lib/preview-mode";
import { getAttribution, toAttributionFields } from "@/lib/attribution";
import { gaEvent } from "@/lib/ga4";
import {
  INTERNAL_EVENT_NAMES,
  MAX_EVENTS_PER_BATCH,
  sanitizeProps,
  type CleanEvent,
} from "@/lib/analytics-events-schema";

type Params = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Events that exist only for internal analytics + GA4. They are NOT sent to
 * Meta/TikTok — those platforms optimise on commerce events and would only
 * receive noise from UI interactions.
 */
const INTERNAL_ONLY: ReadonlySet<string> = new Set([
  "select_item",
  "select_category",
  "select_subcategory",
  "select_banner",
  "select_offer",
  "custom_design_start",
  "custom_design_upload",
  "custom_design_completed",
  "custom_design_add_to_cart",
]);

export type InternalDraft = Omit<CleanEvent, "path">;

/**
 * Maps a tracking call onto the internal vocabulary, or null when it has no
 * internal representation. Pure — unit tested.
 */
export function toInternalEvent(name: string, p: Params): InternalDraft | null {
  switch (name) {
    case "ViewCart":
      return {
        event_type: "view_cart",
        poster_id: null,
        value: num(p.value),
        quantity: num(p.num_items),
        props: sanitizeProps({
          items: Array.isArray(p.contents) ? p.contents.length : undefined,
        }),
      };
    case "ViewCategory":
      return {
        event_type: "view_item_list",
        poster_id: null,
        value: null,
        quantity: null,
        props: sanitizeProps({
          list: "category",
          category: str(p.category_slug) ?? str(p.category_name) ?? undefined,
        }),
      };
    case "Contact":
      // Landing pages and floating buttons send Contact + Lead + (custom)
      // WhatsAppClick for one tap; only Contact maps, so it is counted once.
      return p.method === "whatsapp"
        ? {
            event_type: "whatsapp_click",
            poster_id: null,
            value: null,
            quantity: null,
            props: sanitizeProps({ method: "whatsapp" }),
          }
        : null;
    default:
      if (!(INTERNAL_EVENT_NAMES as readonly string[]).includes(name)) return null;
      return {
        event_type: name,
        poster_id: str(p.poster_id),
        value: num(p.value),
        quantity: num(p.quantity),
        props: sanitizeProps(p),
      };
  }
}

/** GA4 side of the custom events (standard commerce events are mirrored by trackEvent). */
function mirrorToGa(name: string, p: Params): void {
  switch (name) {
    case "ViewCart":
      gaEvent("view_cart", p);
      break;
    case "ViewCategory":
      gaEvent("view_item_list", {
        item_list_id: p.category_slug,
        item_list_name: p.category_name,
      });
      break;
    case "select_item":
      gaEvent("select_item", {
        content_ids: p.poster_id ? [String(p.poster_id)] : undefined,
        content_name: p.title,
        content_category: p.category,
        item_list_name: p.list,
      });
      break;
    case "select_banner":
    case "select_offer":
      gaEvent("select_promotion", {
        promotion_id: p.banner_id ?? p.offer_id,
        promotion_name: p.label,
      });
      break;
    case "select_category":
    case "select_subcategory":
      gaEvent("select_content", {
        content_type: name === "select_category" ? "category" : "subcategory",
        content_id: p.category ?? p.subcategory,
      });
      break;
    case "custom_design_start":
    case "custom_design_upload":
    case "custom_design_completed":
    case "custom_design_add_to_cart":
      gaEvent(name, { value: p.value, size: p.size, frame_type: p.frame_type, count: p.count });
      break;
    default:
      break;
  }
}

/* ---------------- batching queue ---------------- */

const FLUSH_DELAY_MS = 1500;
const DEDUPE_WINDOW_MS = 8000;

const queue: Array<InternalDraft & { path: string }> = [];
const recent = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | undefined;
let visibilityHooked = false;

function isDuplicate(d: InternalDraft, path: string): boolean {
  const key = `${d.event_type}|${path}|${d.poster_id ?? ""}|${d.value ?? ""}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  recent.set(key, now);
  if (recent.size > 200) {
    for (const [k, t] of recent) if (now - t > DEDUPE_WINDOW_MS) recent.delete(k);
  }
  return false;
}

function flush(): void {
  timer = undefined;
  const batch = queue.splice(0, MAX_EVENTS_PER_BATCH);
  if (batch.length === 0) return;
  try {
    logAnalyticsEventsPublic({
      data: {
        visitor_id: visitorId(),
        session_id: sessionId(),
        attribution: toAttributionFields(getAttribution()),
        events: batch,
      },
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* best-effort */
  }
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (timer !== undefined) return;
  timer = setTimeout(flush, FLUSH_DELAY_MS);
  if (!visibilityHooked && typeof document !== "undefined") {
    visibilityHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (timer !== undefined) clearTimeout(timer);
        flush();
      }
    });
  }
}

/**
 * Called from trackEvent()/trackCustom(). `ga` is true for custom events
 * (trackEvent already mirrors the standard commerce events to GA4 itself).
 */
export function emitAnalyticsEvent(
  name: string,
  params: Params,
  opts: { ga?: boolean } = {},
): void {
  try {
    if (typeof window === "undefined") return;
    if (opts.ga) mirrorToGa(name, params);
    const draft = toInternalEvent(name, params);
    if (!draft) return;
    if (!clientTrackingAllowed() || isPreviewMode()) return;
    const path = window.location.pathname;
    if (isDuplicate(draft, path)) return;
    queue.push({ ...draft, path });
    if (queue.length >= MAX_EVENTS_PER_BATCH) flush();
    else schedule();
  } catch {
    /* analytics must never break the site */
  }
}

/**
 * For events that go to Neon + GA4 only. Returns true when handled, so
 * trackCustom() can stop before the Meta/TikTok side.
 */
export function dispatchInternalOnly(name: string, params: Params): boolean {
  if (!INTERNAL_ONLY.has(name)) return false;
  emitAnalyticsEvent(name, params, { ga: true });
  return true;
}
