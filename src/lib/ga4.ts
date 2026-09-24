/**
 * Google Analytics 4 helper.
 * Loads gtag.js once an admin-configured Measurement ID is known and exposes
 * a typed `gaEvent` helper. Safe no-op until configured.
 *
 * The site fans every commerce event out from trackEvent() using Meta-style
 * parameters (content_ids, contents, order_id …). GA4 ecommerce reports only
 * understand its own shape (items[], transaction_id …), so gaEvent() converts
 * here — callers keep sending one parameter shape.
 */
import type { MarketingConfig } from "./use-marketing";
import { isPreviewMode } from "./preview-mode";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __brwz_ga4_id?: string;
    __brwz_ga4_loaded?: boolean;
  }
}

let ga4Id = "";
let ga4Enabled = false;

export function setGA4Config(cfg: MarketingConfig) {
  ga4Enabled = cfg.ga4Enabled;
  ga4Id = cfg.ga4MeasurementId;
  if (typeof window === "undefined") return;
  if (ga4Enabled && ga4Id) loadGA4(ga4Id);
}

function loadGA4(id: string) {
  if (typeof window === "undefined") return;
  if (window.__brwz_ga4_loaded && window.__brwz_ga4_id === id) return;
  if (!window.__brwz_ga4_loaded) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    window.__brwz_ga4_loaded = true;
  }
  // Disable automatic page_view; we send it from the router so SPA nav is tracked.
  window.gtag?.("config", id, { send_page_view: false });
  window.__brwz_ga4_id = id;
}

export type GAEventName =
  | "page_view"
  | "search"
  | "view_item"
  | "view_item_list"
  | "select_item"
  | "select_content"
  | "select_promotion"
  | "add_to_cart"
  | "view_cart"
  | "add_to_wishlist"
  | "begin_checkout"
  | "purchase"
  | "photo_printing"
  | "custom_design"
  | "contact"
  | "custom_design_start"
  | "custom_design_upload"
  | "custom_design_completed"
  | "custom_design_add_to_cart";

/* ------------------------------------------------------------------ */
/* Meta-shaped params → GA4 ecommerce                                  */
/* ------------------------------------------------------------------ */

type Params = Record<string, unknown>;
type Ga4Item = {
  item_id: string;
  item_name?: string;
  item_category?: string;
  price?: number;
  quantity: number;
};

const CURRENCY = "EGP";
const ECOMMERCE_EVENTS = new Set<GAEventName>([
  "view_item",
  "select_item",
  "add_to_cart",
  "view_cart",
  "add_to_wishlist",
  "begin_checkout",
  "purchase",
]);
// Meta/enrichment keys that have no meaning in GA4 once converted.
const CONSUMED_KEYS = new Set([
  "content_ids",
  "contents",
  "content_name",
  "content_type",
  "content_category",
  "num_items",
  "order_id",
  "value",
  "currency",
  "search_string",
]);

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Builds GA4 items[]. `contents` (id/quantity/item_price) wins when present;
 * otherwise `content_ids` is used. A multi-id event without per-item prices
 * (a bundle added as one line) is reported as ONE item so its value is not
 * split or repeated per poster.
 */
export function buildGa4Items(p: Params): Ga4Item[] {
  const category = typeof p.content_category === "string" ? p.content_category : undefined;
  if (Array.isArray(p.contents) && p.contents.length > 0) {
    return (p.contents as Array<Record<string, unknown>>).map((c) => ({
      item_id: String(c.id ?? ""),
      ...(category ? { item_category: category } : {}),
      ...(num(c.item_price) !== undefined ? { price: num(c.item_price) } : {}),
      quantity: Math.max(1, Math.round(num(c.quantity) ?? 1)),
    }));
  }
  const ids = Array.isArray(p.content_ids) ? (p.content_ids as unknown[]).map(String) : [];
  if (ids.length === 0) return [];
  const name = typeof p.content_name === "string" ? p.content_name : undefined;
  const value = num(p.value);
  return [
    {
      item_id: ids.join(","),
      ...(name ? { item_name: name } : {}),
      ...(category ? { item_category: category } : {}),
      ...(value !== undefined ? { price: value } : {}),
      quantity: 1,
    },
  ];
}

/**
 * Returns the GA4 parameter object for an event, or null when the event must
 * not be sent (a purchase without a transaction id cannot be deduplicated).
 */
export function toGa4Params(name: GAEventName, p: Params): Params | null {
  const extras: Params = {};
  for (const [k, v] of Object.entries(p)) if (!CONSUMED_KEYS.has(k)) extras[k] = v;

  if (name === "search") {
    return {
      ...extras,
      search_term: typeof p.search_string === "string" ? p.search_string : undefined,
    };
  }
  if (!ECOMMERCE_EVENTS.has(name)) return { ...extras };

  const items = buildGa4Items(p);
  const value =
    num(p.value) ??
    (items.length && items.every((i) => i.price !== undefined)
      ? items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
      : undefined);
  const out: Params = {
    ...extras,
    currency: typeof p.currency === "string" ? p.currency : CURRENCY,
  };
  if (items.length) out.items = items;
  if (value !== undefined) out.value = value;

  if (name === "purchase") {
    const tx = typeof p.order_id === "string" ? p.order_id.trim() : "";
    if (!tx) return null;
    out.transaction_id = tx;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Purchase de-duplication                                             */
/* ------------------------------------------------------------------ */

const PURCHASE_KEY = "brw-ga4-purchases";
const memoryPurchases = new Set<string>();

/** True the first time a transaction id is seen (remembered across reloads). */
function claimPurchase(transactionId: string): boolean {
  if (memoryPurchases.has(transactionId)) return false;
  memoryPurchases.add(transactionId);
  try {
    const seen: string[] = JSON.parse(window.localStorage.getItem(PURCHASE_KEY) || "[]");
    if (seen.includes(transactionId)) return false;
    seen.push(transactionId);
    window.localStorage.setItem(PURCHASE_KEY, JSON.stringify(seen.slice(-50)));
  } catch {
    /* storage blocked — the in-memory set still stops same-page repeats */
  }
  return true;
}

export function gaEvent(name: GAEventName, params: Params = {}) {
  if (!ga4Enabled || !ga4Id || typeof window === "undefined") return;
  if (isPreviewMode()) return;
  try {
    const converted = toGa4Params(name, params);
    if (!converted) return;
    if (name === "purchase" && !claimPurchase(String(converted.transaction_id))) return;
    window.gtag?.("event", name, converted);
  } catch {
    /* noop */
  }
}

export function gaPageView(path: string, title?: string) {
  if (!ga4Enabled || !ga4Id || typeof window === "undefined") return;
  if (isPreviewMode()) return;
  try {
    window.gtag?.("event", "page_view", {
      page_location: window.location.href,
      page_path: path,
      page_title: title ?? document.title,
    });
  } catch {
    /* noop */
  }
}
