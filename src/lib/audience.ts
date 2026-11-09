/**
 * The two campaign audiences of the store, and how a visitor is told apart.
 *
 *   youth - young people who like loud, quirky, unusual posters
 *   album - people who want to print many photos and keep them in an album instead of on the phone
 *
 * A visitor is tagged ONLY by the ad link that brought them, never guessed from behaviour: the link carries
 * `?aud=youth` or `?aud=album` and may point at any existing page. No page of its own is needed.
 *
 * Like the traffic source (attribution.ts), the audience has a first touch (what brought them first, kept 90 days) and
 * a last touch (the campaign that brought them back most recently, kept 30 days). Ad events use the LAST one, so a
 * retargeting audience in Meta follows what the person came for most recently; the FIRST is kept for reports.
 *
 * Pure and storage-safe: it only touches this browser's localStorage, never throws, never sends anything anywhere.
 */

export const AUDIENCES = ["youth", "album"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** The query parameter an ad link uses: ?aud=youth */
export const AUDIENCE_PARAM = "aud";

const STORAGE_KEY = "brw-audience-v2";
const FIRST_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LAST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The existing page each campaign's ads point at (there are no campaign-only pages). */
export const AUDIENCE_DESTINATION_PATH: Record<Audience, string> = {
  youth: "/",
  album: "/photo-printing",
};

export const AUDIENCE_LABEL: Record<Audience, { ar: string; en: string }> = {
  youth: { ar: "الشباب - بوسترات مطرقعة", en: "Youth - bold & quirky posters" },
  album: { ar: "ألبوم الصور - اطبع صورك", en: "Photo albums - print your photos" },
};

/** Accepts exactly the known audiences (any case, surrounding spaces); everything else is "not an audience". */
export function parseAudience(value: unknown): Audience | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (AUDIENCES as readonly string[]).includes(v) ? (v as Audience) : null;
}

export type AudienceLocation = { pathname: string; search: string };

/**
 * Which campaign audience does this page load belong to? null = none (an ordinary visit).
 * Only the explicit `?aud=` of the ad link counts: the page itself says nothing about the visitor.
 */
export function classifyAudience({ search }: AudienceLocation): Audience | null {
  return parseAudience(new URLSearchParams(search || "").get(AUDIENCE_PARAM));
}

type Touch = { a: Audience; ts: number };
type Stored = { first?: Touch; last?: Touch };

export type AudienceSnapshot = { first: Audience | null; last: Audience | null };

function readStored(now: number): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : {};
    const valid = (t: unknown, ttl: number): Touch | undefined => {
      if (!t || typeof t !== "object") return undefined;
      const { a, ts } = t as Touch;
      if (!parseAudience(a) || typeof ts !== "number" || now - ts > ttl) return undefined;
      return { a, ts };
    };
    const out: Stored = {};
    const first = valid(parsed.first, FIRST_TTL_MS);
    const last = valid(parsed.last, LAST_TTL_MS);
    if (first) out.first = first;
    if (last) out.last = last;
    return out;
  } catch {
    return {};
  }
}

/** The visitor's current audiences (first / last), or nulls. Safe on the server. */
export function getAudiences(now = Date.now()): AudienceSnapshot {
  if (typeof window === "undefined") return { first: null, last: null };
  const s = readStored(now);
  return { first: s.first?.a ?? null, last: s.last?.a ?? null };
}

/**
 * Records the audience of the CURRENT page load, if it has one. Safe to call on every page view: a page that belongs to
 * no audience changes nothing (a returning visitor keeps the audience they came in with). Never throws.
 */
export function recordAudience(now = Date.now(), location?: AudienceLocation): AudienceSnapshot {
  if (typeof window === "undefined") return { first: null, last: null };
  try {
    const loc = location ?? { pathname: window.location.pathname, search: window.location.search };
    const audience = classifyAudience(loc);
    const stored = readStored(now);
    if (audience) {
      if (!stored.first) stored.first = { a: audience, ts: now };
      stored.last = { a: audience, ts: now };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        /* storage blocked: the audience then only lasts for this page's events */
      }
    }
    return { first: stored.first?.a ?? null, last: stored.last?.a ?? null };
  } catch {
    return { first: null, last: null };
  }
}

/**
 * The ad-link parameters for a campaign, ready to paste into Meta's "URL parameters" box.
 * Meta fills {{campaign.id}} and {{ad.id}} itself; the site already reads them as the campaign and ad ids
 * (order-attribution.ts), so each campaign is told apart by its own ids AND by `aud`.
 */
export function campaignUrlParameters(audience: Audience): string {
  return `utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&${AUDIENCE_PARAM}=${audience}`;
}

/** The full destination link for a campaign (no Meta placeholders: a plain, testable URL). */
export function campaignDestinationUrl(origin: string, audience: Audience): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${AUDIENCE_DESTINATION_PATH[audience]}?${AUDIENCE_PARAM}=${audience}`;
}
