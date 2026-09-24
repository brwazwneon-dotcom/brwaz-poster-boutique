/**
 * The internal (Neon) event vocabulary and its validation. Pure — shared by
 * the browser sink, the public server function and the unit tests.
 *
 * Only business events with no existing internal equivalent live here.
 * Product views, cart adds, wishlist adds, checkout starts, searches and page
 * views are already recorded by their own writers (analytics_poster_events /
 * search_queries / analytics_visits) — re-recording them would double count.
 */
import { normalizeSource, SOURCES } from "./attribution";
import type { AttributionFields } from "./attribution";

/** Event types written by the pre-existing poster tracking (unchanged). */
export const LEGACY_POSTER_EVENT_TYPES = [
  "view",
  "unique_view",
  "cart_add",
  "wishlist_add",
  "checkout_start",
  "checkout_complete",
] as const;

/** New funnel / click events recorded by the unified sink. */
export const INTERNAL_EVENT_NAMES = [
  "view_cart",
  "view_item_list",
  "select_item",
  "select_category",
  "select_subcategory",
  "select_banner",
  "select_offer",
  "whatsapp_click",
  "custom_design_start",
  "custom_design_upload",
  "custom_design_completed",
  "custom_design_add_to_cart",
] as const;
export type InternalEventName = (typeof INTERNAL_EVENT_NAMES)[number];

export const ALLOWED_EVENT_TYPES: readonly string[] = [
  ...LEGACY_POSTER_EVENT_TYPES,
  ...INTERNAL_EVENT_NAMES,
];

/** Business context only — never names, phones, addresses or free text. */
export const ALLOWED_PROP_KEYS = [
  "category",
  "subcategory",
  "banner_id",
  "offer_id",
  "list",
  "size",
  "frame_type",
  "color",
  "method",
  "items",
  "type",
  "label",
  "position",
  "count",
] as const;

export type PropValue = string | number | boolean;
export type EventProps = Record<string, PropValue>;

export type CleanEvent = {
  event_type: string;
  poster_id: string | null;
  value: number | null;
  quantity: number | null;
  props: EventProps | null;
  path: string | null;
};

export const MAX_EVENTS_PER_BATCH = 25;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export function sanitizeProps(input: unknown): EventProps | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: EventProps = {};
  for (const key of ALLOWED_PROP_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string") {
      const t = v.trim().slice(0, 100);
      if (t) out[key] = t;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    } else if (typeof v === "boolean") {
      out[key] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Pathname only — query strings can carry tokens or personal data. */
export function cleanPath(v: unknown): string | null {
  const s = str(v, 400);
  if (!s) return null;
  return s.split("?")[0].split("#")[0].slice(0, 300) || null;
}

export function sanitizeEvent(input: unknown): CleanEvent | null {
  if (!input || typeof input !== "object") return null;
  const e = input as Record<string, unknown>;
  const event_type = typeof e.event_type === "string" ? e.event_type : "";
  if (!ALLOWED_EVENT_TYPES.includes(event_type)) return null;
  const value =
    typeof e.value === "number" && Number.isFinite(e.value) && e.value >= 0 && e.value < 1e8
      ? Math.round(e.value * 100) / 100
      : null;
  const quantity =
    typeof e.quantity === "number" &&
    Number.isFinite(e.quantity) &&
    e.quantity >= 0 &&
    e.quantity < 1e5
      ? Math.round(e.quantity)
      : null;
  return {
    event_type,
    poster_id: isUuid(e.poster_id) ? e.poster_id : null,
    value,
    quantity,
    props: sanitizeProps(e.props),
    path: cleanPath(e.path),
  };
}

export type CleanAttribution = {
  first_source: string | null;
  first_medium: string | null;
  first_campaign: string | null;
  first_content: string | null;
  first_term: string | null;
  last_source: string | null;
  last_medium: string | null;
  last_campaign: string | null;
  last_content: string | null;
  last_term: string | null;
};

/**
 * Re-applies the source taxonomy on the server: whatever the browser sent,
 * only taxonomy values are stored, so visits and orders can never disagree.
 */
export function sanitizeAttribution(input: unknown): CleanAttribution {
  const a = (input ?? {}) as AttributionFields & Record<string, unknown>;
  const src = (v: unknown) => {
    const n = normalizeSource(typeof v === "string" ? v : null);
    return n && (SOURCES as readonly string[]).includes(n) ? n : null;
  };
  return {
    first_source: src(a.first_source),
    first_medium: str(a.first_medium, 100)?.toLowerCase() ?? null,
    first_campaign: str(a.first_campaign, 200),
    first_content: str(a.first_content, 200),
    first_term: str(a.first_term, 200),
    last_source: src(a.last_source),
    last_medium: str(a.last_medium, 100)?.toLowerCase() ?? null,
    last_campaign: str(a.last_campaign, 200),
    last_content: str(a.last_content, 200),
    last_term: str(a.last_term, 200),
  };
}

export const cleanId = (v: unknown): string | null => str(v, 100);
