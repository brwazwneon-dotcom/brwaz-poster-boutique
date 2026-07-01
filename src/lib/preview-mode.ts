/**
 * Preview-as-Client mode. Activated when the URL contains `?preview=1` or the
 * sessionStorage flag `brwz-preview-mode` is set. Used to:
 *  - short-circuit analytics / marketing / view counters
 *  - render the floating "Preview Mode" badge
 *  - hide admin-only affordances on the public site
 *
 * The flag is scoped to the browser tab (sessionStorage) so the original admin
 * tab stays unaffected.
 */

const FLAG_KEY = "brwz-preview-mode";
const LAST_PUBLIC_ROUTE_KEY = "brwz-last-public-route";

export type PreviewDevice = "mobile" | "tablet" | "desktop";

export const PREVIEW_VIEWPORTS: Record<PreviewDevice, { w: number; h: number }> = {
  mobile: { w: 414, h: 896 },
  tablet: { w: 834, h: 1112 },
  desktop: { w: 1440, h: 900 },
};

function readSearchFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("preview") === "1";
  } catch {
    return false;
  }
}

/** Sync check — safe on SSR (returns false). */
export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  if (readSearchFlag()) {
    try { window.sessionStorage.setItem(FLAG_KEY, "1"); } catch { /* noop */ }
    return true;
  }
  try {
    return window.sessionStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function exitPreviewMode(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(FLAG_KEY); } catch { /* noop */ }
}

/** Remember the last customer-facing route the visitor was on (for "Preview Current Page"). */
export function rememberPublicRoute(path: string): void {
  if (typeof window === "undefined") return;
  if (!path || path.startsWith("/admin")) return;
  try { window.localStorage.setItem(LAST_PUBLIC_ROUTE_KEY, path); } catch { /* noop */ }
}

export function getLastPublicRoute(): string {
  if (typeof window === "undefined") return "/";
  try {
    return window.localStorage.getItem(LAST_PUBLIC_ROUTE_KEY) || "/";
  } catch {
    return "/";
  }
}

/** Open a URL in a new tab/window sized to the target device. */
export function openPreviewWindow(path: string, device: PreviewDevice = "desktop"): void {
  if (typeof window === "undefined") return;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewDevice", device);
  const { w, h } = PREVIEW_VIEWPORTS[device];
  const features = `noopener,width=${w},height=${h},resizable=yes,scrollbars=yes`;
  window.open(url.toString(), `brwz-preview-${device}`, features);
}