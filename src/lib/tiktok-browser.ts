// The browser half of the TikTok integration: fires the TikTok pixel event and, for
// conversion-relevant events, asks the server to send the SAME event (same name,
// same event_id) through the Events API, so TikTok deduplicates the pair.
//
// Called from ONE place — trackEvent() in meta-pixel.ts — so every storefront event
// keeps a single source. The base pixel (page view, script loading) is booted by
// TikTokPixelBoot in routes/__root.tsx; this file never loads the script.
//
// Purchase is never relayed: its server event is built from the stored order
// (see order-tracking.server.ts) and shares the deterministic event_id
// `purchase_<order number>`.
import { getTikTokIdentifiers } from "./attribution";
import { visitorId } from "./analytics";
import { sendTikTokEventFromBrowser } from "./tiktok-events.functions";
import { isTikTokRelayedEvent, tiktokEventName, toTikTokProperties } from "./tiktok-events";

type Ttq = {
  track?: (event: string, params?: Record<string, unknown>, opts?: { event_id?: string }) => void;
};

const READY_POLL_MS = 400;
const READY_POLL_MAX = 40; // ~16 s: the pixel boots when the browser is idle
const PENDING_MAX = 50;

const pending: Array<() => void> = [];
let polling = false;
let polls = 0;

const pixelReady = () =>
  typeof window !== "undefined" &&
  !!(window as unknown as { __brwz_tiktok_pixel_loaded?: boolean }).__brwz_tiktok_pixel_loaded;

const ttq = () => (window as unknown as { ttq?: Ttq }).ttq;

function flush() {
  for (const send of pending.splice(0, pending.length)) send();
}

// Early events wait (bounded) for the pixel to boot instead of being lost.
function startPolling() {
  if (polling || typeof window === "undefined") return;
  polling = true;
  polls = 0;
  const tick = () => {
    if (pixelReady()) {
      polling = false;
      flush();
      return;
    }
    if (++polls >= READY_POLL_MAX) {
      polling = false;
      pending.length = 0; // the pixel never came up (blocked / offline): drop, never leak
      return;
    }
    setTimeout(tick, READY_POLL_MS);
  };
  setTimeout(tick, READY_POLL_MS);
}

export type TikTokTrackOptions = {
  /** Also send the event server-side (Events API is enabled in settings). */
  relay?: boolean;
  /** Advanced Matching data, only ever forwarded when the owner enabled it. */
  userData?: { email?: string; phone?: string };
};

/**
 * Sends one storefront event to TikTok (pixel, and optionally the Events API).
 * Never throws and never blocks the UI.
 */
export function trackTikTok(
  name: string,
  params: Record<string, unknown>,
  eventId: string,
  opts: TikTokTrackOptions = {},
): void {
  const event = tiktokEventName(name);
  if (!event || typeof window === "undefined") return;

  const properties = toTikTokProperties(params);
  const send = () => {
    try {
      ttq()?.track?.(event, properties, { event_id: eventId });
    } catch {
      /* best-effort */
    }
  };
  if (pixelReady()) send();
  else if (pending.length < PENDING_MAX) {
    pending.push(send);
    startPolling();
  }

  if (opts.relay && isTikTokRelayedEvent(name)) {
    try {
      const { ttclid, ttp } = getTikTokIdentifiers();
      sendTikTokEventFromBrowser({
        data: {
          event_name: name,
          event_id: eventId,
          event_source_url: window.location.href,
          custom_data: params,
          user_data: opts.userData ?? {},
          client_user_agent: navigator.userAgent,
          ttclid,
          ttp,
          external_id: visitorId(),
        },
      }).catch(() => {
        /* the pixel already covers it */
      });
    } catch {
      /* best-effort */
    }
  }
}

/** Test hook. */
export function _resetTikTokBrowserForTests() {
  pending.length = 0;
  polling = false;
  polls = 0;
}
