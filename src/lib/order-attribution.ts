// The attribution state of a visitor AT THE MOMENT THEY PLACED AN ORDER,
// stored with the order (orders.ad_tracking -> "attribution").
//
// Why a snapshot: reports that re-derive an order's source later from the
// visitor's sessions can drift (sessions expire, more visits arrive, first/last
// touch move on). The snapshot freezes what the browser knew when the order
// was created and is never rewritten.
//
// Pure module (no server or browser APIs): the browser builds the payload from
// the existing attribution store (attribution.ts — still the ONLY attribution
// system), the server allow-lists it, and the reports read it back.
//
// Meta ids are NOT guessed. The live ad links carry Meta's own ids
// (utm_campaign = campaign id, utm_content = ad id — verified against Ads
// Manager), so for Facebook/Instagram touches whose campaign / content are pure
// digits they are recorded as `meta_campaign_id` / `meta_ad_id` with
// `ids_source: "utm"`. The ad set id is not in the link and is left out; it is
// resolved later from the synced Meta ad record.
import { normalizeSource } from "@/lib/attribution";

export const ORDER_ATTRIBUTION_VERSION = 1;

export type TouchSnapshot = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

/** What the browser sends: the two touches and the Meta click id, nothing personal. */
export type OrderAttributionInput = {
  v: 1;
  first: TouchSnapshot | null;
  last: TouchSnapshot | null;
  fbclid?: string;
};

export type StoredTouch = TouchSnapshot & {
  meta_campaign_id?: string;
  meta_ad_id?: string;
};

/** What is persisted. `recorded_at` is the SERVER's clock, never the browser's. */
export type StoredOrderAttribution = {
  v: 1;
  recorded_at: string;
  first: StoredTouch | null;
  last: StoredTouch | null;
  fbclid?: string;
  ids_source: "utm";
};

const MAX_FIELD = 120;
const META_SOURCES = new Set(["facebook", "instagram"]);
const META_ID = /^\d{8,20}$/;

const clean = (v: unknown, max = MAX_FIELD): string | null => {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, max) : null;
};

function cleanTouch(raw: unknown): TouchSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawSource = clean(r.source, 60);
  if (!rawSource) return null;
  return {
    source: normalizeSource(rawSource) ?? "other",
    medium: clean(r.medium, 60)?.toLowerCase() ?? null,
    campaign: clean(r.campaign),
    content: clean(r.content),
    term: clean(r.term),
  };
}

/** Adds the Meta ids only when the link itself carries them (see the header). */
export function withMetaIds(t: TouchSnapshot | null): StoredTouch | null {
  if (!t) return null;
  const out: StoredTouch = { ...t };
  if (META_SOURCES.has(t.source)) {
    if (t.campaign && META_ID.test(t.campaign)) out.meta_campaign_id = t.campaign;
    if (t.content && META_ID.test(t.content)) out.meta_ad_id = t.content;
  }
  return out;
}

const FBCLID = /^[A-Za-z0-9_-]{10,500}$/;

/**
 * Allow-lists whatever the browser sent. Anything not on the list is dropped;
 * returns undefined when there is nothing worth storing (both touches absent).
 */
export function sanitizeOrderAttribution(
  raw: unknown,
  now: Date = new Date(),
): StoredOrderAttribution | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const first = withMetaIds(cleanTouch(r.first));
  const last = withMetaIds(cleanTouch(r.last));
  if (!first && !last) return undefined;
  const fbclid = typeof r.fbclid === "string" && FBCLID.test(r.fbclid) ? r.fbclid : undefined;
  return {
    v: ORDER_ATTRIBUTION_VERSION,
    recorded_at: now.toISOString(),
    first,
    last,
    ...(fbclid ? { fbclid } : {}),
    ids_source: "utm",
  };
}

/**
 * Reads a stored snapshot back defensively (it is JSON from the database).
 * Returns null for anything that is not a v1 snapshot.
 */
export function readStoredAttribution(raw: unknown): StoredOrderAttribution | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== ORDER_ATTRIBUTION_VERSION) return null;
  const touch = (x: unknown): StoredTouch | null => {
    const t = withMetaIds(cleanTouch(x));
    return t;
  };
  const first = touch(r.first);
  const last = touch(r.last);
  if (!first && !last) return null;
  return {
    v: ORDER_ATTRIBUTION_VERSION,
    recorded_at: typeof r.recorded_at === "string" ? r.recorded_at : "",
    first,
    last,
    ...(typeof r.fbclid === "string" && FBCLID.test(r.fbclid) ? { fbclid: r.fbclid } : {}),
    ids_source: "utm",
  };
}
