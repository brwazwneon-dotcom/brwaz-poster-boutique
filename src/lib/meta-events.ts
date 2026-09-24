/**
 * The ONE definition of what the site may send to Meta (browser Pixel and the
 * server-side Conversions API). Isomorphic and pure: the browser sanitises with
 * it before it fires, and the server re-applies it — the browser is never
 * trusted.
 *
 * Rules that live here:
 *  - only listed event names are forwarded;
 *  - Purchase / OrderConfirmed are SERVER-ONLY: the browser may not ask the
 *    Conversions API to record revenue (a public endpoint that accepted
 *    `Purchase` would let anyone fabricate conversions);
 *  - every parameter is allow-listed, typed and bounded — anything else
 *    (customer file names, titles, free text) is dropped;
 *  - currency is always EGP, money is always a number;
 *  - content ids are stable catalog ids only: never a custom-design line id,
 *    a temporary id, or a title.
 */
import { z } from "zod";
import { isProductionHostname } from "./analytics-env";

export const META_CURRENCY = "EGP" as const;

/** Standard events the browser may relay to the Conversions API. */
export const RELAYED_STANDARD_EVENTS = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToWishlist",
  "AddToCart",
  "InitiateCheckout",
  "Lead",
  "Contact",
  "CompleteRegistration",
] as const;

/**
 * Custom events the site really sends today (Meta has no standard
 * ViewCategory / ViewCart, so these are the correct way to send them).
 * Custom-design events are internal-only analytics and are not listed.
 */
export const CUSTOM_META_EVENTS = [
  "ViewCategory",
  "ViewCart",
  "CartUpdated",
  "RemoveFromCart",
  "AddPhoneNumber",
  "LandingPageView",
  "WhatsAppClick",
  "photo_page_view",
  "photo_upload_started",
  "photo_quality_warning",
  "photo_upload_failed",
  "photo_upload_completed",
  "photo_added_to_cart",
  "photo_checkout_started",
  "photo_order_completed",
  "photo_size_selected",
  "photo_editor_opened",
  "photo_editor_completed",
] as const;

/** Sent only by the server, from stored order data. */
export const SERVER_ONLY_EVENTS = ["Purchase", "OrderConfirmed"] as const;

const RELAYED = new Set<string>([...RELAYED_STANDARD_EVENTS, ...CUSTOM_META_EVENTS]);
const CUSTOM = new Set<string>(CUSTOM_META_EVENTS);

/** May the browser ask the server to forward this event to the Conversions API? */
export function isRelayedEvent(name: string): boolean {
  return RELAYED.has(name);
}

export function isAllowedCustomEvent(name: string): boolean {
  return CUSTOM.has(name);
}

/* ------------------------------ value cleaning ------------------------------ */

const MAX_MONEY = 1_000_000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ORDER_REF_RE = /^[A-Za-z0-9_-]{1,40}$/;
const NON_CATALOG_PREFIXES = ["custom-", "photo-print-"];

/** A stable catalog id: not a custom-design / service line id, not free text. */
export function isCatalogId(id: unknown): id is string {
  return (
    typeof id === "string" && ID_RE.test(id) && !NON_CATALOG_PREFIXES.some((p) => id.startsWith(p))
  );
}

export function cleanMoney(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_MONEY) return undefined;
  return Math.round(n * 100) / 100;
}

function cleanInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const n = Math.trunc(v);
  return n >= min && n <= max ? n : undefined;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(CONTROL_CHARS, " ").trim().slice(0, max);
  return s || undefined;
}

export type MetaContent = { id: string; quantity: number; item_price?: number };

function cleanContents(v: unknown): MetaContent[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MetaContent[] = [];
  for (const raw of v.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!isCatalogId(r.id)) continue;
    const quantity = cleanInt(r.quantity, 1, 999);
    if (quantity === undefined) continue;
    const price = cleanMoney(r.item_price);
    out.push(
      price === undefined ? { id: r.id, quantity } : { id: r.id, quantity, item_price: price },
    );
  }
  return out.length ? out : undefined;
}

/**
 * Allow-list + type-check the custom_data of an event. Unknown keys are
 * dropped; bad values are dropped rather than repaired.
 */
export function sanitizeMetaParams(params: Record<string, unknown> | undefined | null) {
  const p = params ?? {};
  const out: Record<string, unknown> = {};

  if (Array.isArray(p.content_ids)) {
    const ids = [...new Set(p.content_ids.filter(isCatalogId))].slice(0, 50);
    if (ids.length) out.content_ids = ids;
  }
  const contents = cleanContents(p.contents);
  if (contents) out.contents = contents;
  if (p.content_type === "product" || p.content_type === "product_group")
    out.content_type = p.content_type;

  for (const key of ["content_name", "content_category", "category_name"] as const) {
    const s = cleanText(p[key], 120);
    if (s) out[key] = s;
  }
  for (const key of ["audience_type", "landing_page", "utm_campaign", "category_slug"] as const) {
    const s = cleanText(p[key], 150);
    if (s) out[key] = s;
  }
  for (const key of ["source", "method", "status", "size"] as const) {
    const s = cleanText(p[key], 40);
    if (s && /^[A-Za-z0-9_ .-]+$/.test(s)) out[key] = s;
  }
  const search = cleanText(p.search_string, 100);
  if (search) out.search_string = search;
  if (typeof p.category_id === "string" && ID_RE.test(p.category_id))
    out.category_id = p.category_id;
  for (const key of ["order_id", "order_number"] as const) {
    if (typeof p[key] === "string" && ORDER_REF_RE.test(p[key] as string)) out[key] = p[key];
  }

  const value = cleanMoney(p.value);
  if (value !== undefined) out.value = value;
  const total = cleanMoney(p.total);
  if (total !== undefined) out.total = total;
  if (value !== undefined || total !== undefined || p.currency !== undefined)
    out.currency = META_CURRENCY;

  for (const [key, max] of [
    ["num_items", 999],
    ["quantity", 999],
    ["count", 999],
    ["photos", 999],
  ] as const) {
    const n = cleanInt(p[key], 0, max);
    if (n !== undefined) out[key] = n;
  }
  return out;
}

/* ------------------------ browser identifiers / source ------------------------ */

/** `_fbp` cookie value: fb.<subdomain index>.<creation ms>.<random number>. */
export function cleanFbp(v: unknown): string | undefined {
  return typeof v === "string" && /^fb\.\d\.\d{10,14}\.\d{1,20}$/.test(v) ? v : undefined;
}

/** `_fbc` value: fb.<subdomain index>.<click ms>.<fbclid>. */
export function cleanFbc(v: unknown): string | undefined {
  return typeof v === "string" && /^fb\.\d\.\d{10,14}\.[A-Za-z0-9_-]{5,512}$/.test(v)
    ? v
    : undefined;
}

export function cleanFbclid(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Za-z0-9_-]{5,512}$/.test(v) ? v : undefined;
}

/** The page URL of an event: https, on a production host, no fragment. */
export function cleanSourceUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 1000) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || !isProductionHostname(u.hostname)) return undefined;
    u.hash = "";
    return u.toString();
  } catch {
    return undefined;
  }
}

/* ------------------------------ cart contents ------------------------------ */

export type CartLike = {
  posterId?: string;
  qty: number;
  price: number;
  customImagePath?: string;
  customImageMeta?: unknown;
  bundle?: { posters: Array<{ posterId: string }> };
};

/** A custom-design line is not a catalog product and has no catalog id. */
export function isCustomDesignItem(
  i: Pick<CartLike, "posterId" | "customImagePath" | "customImageMeta">,
) {
  return (
    !!i.customImagePath || !!i.customImageMeta || String(i.posterId ?? "").startsWith("custom-")
  );
}

export type CartContentsPayload = {
  content_ids: string[];
  contents: MetaContent[];
  content_type: "product";
  num_items: number;
};

/**
 * Meta content fields for a set of cart lines:
 *  - normal poster → its id, quantity and unit price;
 *  - bundle        → every poster in the bundle (× line quantity), no per-poster price;
 *  - custom design → no id at all (counted in num_items only).
 */
export function metaContentsFromCart(items: readonly CartLike[]): CartContentsPayload {
  const qtyById = new Map<string, MetaContent>();
  let numItems = 0;
  const add = (id: string, quantity: number, price?: number) => {
    if (!isCatalogId(id)) return;
    const cur = qtyById.get(id);
    if (cur) cur.quantity += quantity;
    else
      qtyById.set(id, price === undefined ? { id, quantity } : { id, quantity, item_price: price });
  };
  for (const i of items) {
    const qty = Math.max(1, Math.trunc(i.qty) || 1);
    if (isCustomDesignItem(i)) {
      numItems += qty;
    } else if (i.bundle?.posters?.length) {
      for (const p of i.bundle.posters) add(p.posterId, qty);
      numItems += i.bundle.posters.length * qty;
    } else {
      add(i.posterId ?? "", qty, cleanMoney(i.price));
      numItems += qty;
    }
  }
  const contents = [...qtyById.values()];
  return {
    content_ids: contents.map((c) => c.id),
    contents,
    content_type: "product",
    num_items: numItems,
  };
}

/* --------------------------------- Purchase --------------------------------- */

/** Deterministic id for the browser Pixel + server event of one order. */
export function purchaseEventId(orderRef: string | null | undefined): string | null {
  return typeof orderRef === "string" && ORDER_REF_RE.test(orderRef)
    ? `purchase_${orderRef}`
    : null;
}

export type PurchasePayload = {
  event_id: string;
  order_id: string;
  value: number;
  currency: typeof META_CURRENCY;
  content_type: "product";
  content_ids: string[];
  contents: MetaContent[];
  num_items: number;
  content_category?: string;
};

/**
 * Builds a Purchase from STORED order data only. `storedTotals` are the
 * persisted (price-guarded) `total_price` values of the order's rows; the
 * browser contributes nothing but the (already validated) product ids.
 * Returns null when there is nothing to report.
 */
export function buildPurchasePayload(args: {
  orderRef: string;
  storedTotals: readonly number[];
  items?: ReadonlyArray<{ id: string; quantity: number }>;
  fallbackNumItems: number;
  contentCategory?: string;
}): PurchasePayload | null {
  const event_id = purchaseEventId(args.orderRef);
  if (!event_id) return null;
  const value = cleanMoney(args.storedTotals.reduce((s, n) => s + (Number(n) || 0), 0));
  if (value === undefined || value <= 0) return null;
  const contents = (args.items ?? [])
    .filter((i) => isCatalogId(i.id) && cleanInt(i.quantity, 1, 999) !== undefined)
    .map((i) => ({ id: i.id, quantity: Math.trunc(i.quantity) }));
  const numItems = contents.length
    ? contents.reduce((s, c) => s + c.quantity, 0)
    : Math.max(1, Math.trunc(args.fallbackNumItems) || 1);
  return {
    event_id,
    order_id: args.orderRef,
    value,
    currency: META_CURRENCY,
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: numItems,
    ...(args.contentCategory ? { content_category: args.contentCategory } : {}),
  };
}

/** The custom_data a Purchase carries (browser Pixel and Conversions API use the same). */
export function purchaseCustomData(p: PurchasePayload): Record<string, unknown> {
  return {
    value: p.value,
    currency: p.currency,
    order_id: p.order_id,
    content_type: p.content_type,
    ...(p.content_ids.length ? { content_ids: p.content_ids, contents: p.contents } : {}),
    num_items: p.num_items,
    ...(p.content_category ? { content_category: p.content_category } : {}),
  };
}

/* ---------------- what the public browser→server relay accepts ---------------- */

export const RelayInputSchema = z.object({
  // Anything not on the allow-list (and every server-only event, Purchase
  // included) is rejected before it can reach Meta.
  event_name: z.string().min(1).max(64).refine(isRelayedEvent, { message: "event_not_allowed" }),
  // The shared id also sent to fbq. Server-issued ids (purchase_*, confirmed_*)
  // are not accepted from a browser.
  event_id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .refine((id) => !/^(purchase|confirmed)_/i.test(id), { message: "reserved_event_id" }),
  event_source_url: z.string().max(1000).optional(),
  custom_data: z
    .record(z.string(), z.unknown())
    .default({})
    .refine((o) => Object.keys(o).length <= 40 && JSON.stringify(o).length <= 6000, {
      message: "custom_data_too_large",
    }),
  user_data: z
    .object({
      email: z.string().max(200).optional(),
      phone: z.string().max(40).optional(),
      city: z.string().max(80).optional(),
      country: z.string().max(8).optional(),
    })
    .default({}),
  client_user_agent: z.string().max(1024).optional(),
  fbp: z.string().max(64).optional(),
  fbc: z.string().max(600).optional(),
  external_id: z.string().max(128).optional(),
});
export type RelayInput = z.infer<typeof RelayInputSchema>;
