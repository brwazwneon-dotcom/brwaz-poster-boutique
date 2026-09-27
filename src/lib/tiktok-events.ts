// TikTok events shared by the browser pixel layer and the server Events API.
// Pure: no browser or server APIs, so every rule here is unit-tested.
//
// One event vocabulary for the whole site (the "Meta-style" names the storefront
// already fires), mapped onto TikTok's standard events:
//   Purchase  -> CompletePayment  (TikTok's purchase / optimisation event)
//   Lead      -> SubmitForm
// The browser pixel and the Events API send the SAME event name with the SAME
// event_id, which is how TikTok deduplicates them (event_id + event name, within
// 48 hours). Purchase ids are the deterministic `purchase_<order number>` used
// for Meta, so one order = one id on every channel.
import { z } from "zod";
import {
  META_CURRENCY,
  cleanSourceUrl,
  purchaseCustomData,
  sanitizeMetaParams,
  type MetaContent,
  type PurchasePayload,
} from "@/lib/meta-events";

/** The site's default TikTok pixel (public: it is already in every page's HTML). */
export const DEFAULT_TIKTOK_PIXEL_CODE = "D9E35TRC77UDPAPRP140";

export const TIKTOK_EVENT_MAP: Readonly<Record<string, string>> = {
  ViewContent: "ViewContent",
  Search: "Search",
  AddToCart: "AddToCart",
  AddToWishlist: "AddToWishlist",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "CompletePayment",
  Lead: "SubmitForm",
  Contact: "Contact",
  CompleteRegistration: "CompleteRegistration",
};

/** Events the browser may ask the server to forward. Purchase is NOT one: revenue is built server-side. */
export const TIKTOK_RELAYED_EVENTS = [
  "ViewContent",
  "Search",
  "AddToCart",
  "AddToWishlist",
  "InitiateCheckout",
  "Lead",
  "Contact",
  "CompleteRegistration",
] as const;

const RELAYED = new Set<string>(TIKTOK_RELAYED_EVENTS);

/** The TikTok event a site event maps to, or undefined when TikTok does not get it. */
export function tiktokEventName(siteEvent: string): string | undefined {
  return TIKTOK_EVENT_MAP[siteEvent];
}

export function isTikTokRelayedEvent(siteEvent: string): boolean {
  return RELAYED.has(siteEvent);
}

export const TIKTOK_PURCHASE_EVENT = TIKTOK_EVENT_MAP.Purchase;

/* ------------------------------ properties ------------------------------ */

export type TikTokContent = {
  content_id: string;
  content_type: "product";
  content_name?: string;
  quantity: number;
  price?: number;
};

const toContent = (c: MetaContent): TikTokContent => ({
  content_id: c.id,
  content_type: "product",
  quantity: c.quantity,
  ...(typeof c.item_price === "number" ? { price: c.item_price } : {}),
});

/**
 * The properties TikTok gets for a browser event. Starts from the SAME allow-list
 * the Meta path uses (sanitizeMetaParams) and forwards only what TikTok's schema
 * knows: never the audience / UTM enrichment, never customer data.
 */
export function toTikTokProperties(
  params: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const p = sanitizeMetaParams(params);
  const out: Record<string, unknown> = { content_type: "product" };
  const contents = Array.isArray(p.contents)
    ? (p.contents as MetaContent[]).map(toContent)
    : Array.isArray(p.content_ids)
      ? (p.content_ids as string[]).map((id) => toContent({ id, quantity: 1 }))
      : [];
  if (contents.length) out.contents = contents;
  if (typeof p.content_name === "string") out.content_name = p.content_name;
  const value =
    typeof p.value === "number" ? p.value : typeof p.total === "number" ? p.total : undefined;
  if (value !== undefined) {
    out.value = value;
    out.currency = META_CURRENCY;
  }
  if (typeof p.search_string === "string") out.query = p.search_string;
  return out;
}

/** What the server CompletePayment carries: stored-order values only. */
export function tiktokPurchaseProperties(p: PurchasePayload): Record<string, unknown> {
  const c = purchaseCustomData(p);
  const contents = Array.isArray(c.contents) ? (c.contents as MetaContent[]).map(toContent) : [];
  return {
    value: c.value,
    currency: c.currency,
    content_type: "product",
    order_id: p.order_id,
    ...(contents.length ? { contents } : {}),
  };
}

/* ----------------------------- click identifiers ----------------------------- */

/** `ttclid` from the landing URL, e.g. "E.C.P.CjwK...". Kept as TikTok issued it. */
export function cleanTtclid(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Za-z0-9._-]{8,300}$/.test(v) ? v : undefined;
}

/** `_ttp` cookie set by the TikTok pixel. */
export function cleanTtp(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Za-z0-9._-]{10,128}$/.test(v) ? v : undefined;
}

export type TikTokTracking = { ttclid?: string; ttp?: string };

/** Only well-formed TikTok identifiers survive from a client-supplied tracking blob. */
export function sanitizeTikTokTracking(
  raw: Record<string, unknown> | undefined | null,
): TikTokTracking {
  const out: TikTokTracking = {};
  const ttclid = cleanTtclid(raw?.ttclid);
  const ttp = cleanTtp(raw?.ttp);
  if (ttclid) out.ttclid = ttclid;
  if (ttp) out.ttp = ttp;
  return out;
}

/* ------------------------- the public relay's input ------------------------- */

export const TikTokRelayInputSchema = z.object({
  // Site event names on the allow-list only. Purchase (and every other name) is rejected.
  event_name: z
    .string()
    .min(1)
    .max(64)
    .refine(isTikTokRelayedEvent, { message: "event_not_allowed" }),
  // The id also given to ttq.track(). Server-issued ids are not accepted from a browser.
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
    })
    .default({}),
  client_user_agent: z.string().max(1024).optional(),
  ttclid: z.string().max(300).optional(),
  ttp: z.string().max(128).optional(),
  external_id: z.string().max(128).optional(),
});
export type TikTokRelayInput = z.infer<typeof TikTokRelayInputSchema>;

export { cleanSourceUrl };
