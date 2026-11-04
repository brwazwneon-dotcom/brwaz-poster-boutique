import { clientTrackingAllowed } from "./analytics-env";

/**
 * The one rule for the TikTok pixel in the browser: it may load, and anything may be sent to it or relayed to the
 * Events API, only on a production hostname (brwazwneon.com, www.brwazwneon.com and VITE_ANALYTICS_EXTRA_HOSTS) and
 * never on the admin. It is the same rule the Meta Pixel and the internal analytics already use
 * (clientTrackingAllowed), so localhost, a *.vercel.app Preview and every other host stay out of the ad account.
 *
 * Both browser entry points use it: TikTokPixelBoot (routes/__root.tsx) before the script is even created, and
 * trackTikTok (tiktok-browser.ts) before an event is queued, sent to the pixel or relayed to the server.
 * (The server side has its own host check: isProductionRequest in tiktok-events.server.ts.)
 */
export function tiktokPixelAllowed(disabled = false): boolean {
  return !disabled && clientTrackingAllowed();
}
