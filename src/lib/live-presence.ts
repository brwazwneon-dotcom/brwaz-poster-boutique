// Live Visitors heartbeat (browser side).
//
// Contract: this can never slow down or break the storefront.
//   - nothing renders or waits on it; every call is fire-and-forget
//   - first ping is deferred to browser idle time
//   - one tiny POST (id, path, title, device, source, screen bucket) every
//     ~40s, only while the tab is visible; a hidden tab sends nothing
//   - a route change pings straight away (throttled to once per 5s)
//   - runs only on production hostnames and never in admin preview mode
//     (same gate as the rest of analytics)
//   - any failure is swallowed
import { livePingPublic } from "@/lib/live-visitors.functions";
import { clientTrackingAllowed } from "./analytics-env";
import { isPreviewMode } from "./preview-mode";
import { detectDevice, visitorId } from "./analytics";
import { getAttribution } from "./attribution";

// Kept here (not in live-visitors-core) so the public bundle does not pull in the
// admin-side aggregation code.
function screenBucket(width: number): "small" | "medium" | "large" | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  if (width < 600) return "small";
  if (width < 1024) return "medium";
  return "large";
}

const HEARTBEAT_MS = 40_000;
const MIN_GAP_MS = 5_000;

let timer: number | null = null;
let listening = false;
let lastSentAt = 0;
let lastPath: string | null = null;
let currentPath = "/";

function send(path: string): void {
  const now = Date.now();
  if (path === lastPath && now - lastSentAt < MIN_GAP_MS) return;
  lastSentAt = now;
  lastPath = path;
  try {
    void livePingPublic({
      data: {
        visitorId: visitorId(),
        path,
        title: document.title,
        device: detectDevice(),
        source: getAttribution().last?.source ?? "direct",
        screen: screenBucket(window.innerWidth),
      },
    }).catch(() => {
      /* presence must never break the page */
    });
  } catch {
    /* ignore */
  }
}

function onIdle(fn: () => void): void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(fn, { timeout: 3000 });
  else window.setTimeout(fn, 1500);
}

function onVisibility(): void {
  if (document.visibilityState === "visible") send(currentPath);
}

/** Call on every public route (not admin). Safe to call repeatedly. */
export function notifyLivePresence(path: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!clientTrackingAllowed() || isPreviewMode()) return;
    currentPath = path;
    if (!listening) {
      listening = true;
      document.addEventListener("visibilitychange", onVisibility);
      onIdle(() => {
        send(currentPath);
        timer = window.setInterval(() => {
          if (document.visibilityState === "visible") send(currentPath);
        }, HEARTBEAT_MS);
      });
    } else {
      send(path);
    }
  } catch {
    /* ignore */
  }
}

/** Test hook: stop timers/listeners and reset module state. */
export function stopLivePresenceForTests(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (listening) document.removeEventListener("visibilitychange", onVisibility);
  listening = false;
  lastSentAt = 0;
  lastPath = null;
  currentPath = "/";
}
