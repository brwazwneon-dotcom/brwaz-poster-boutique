/**
 * Google Analytics 4 helper.
 * Loads gtag.js once an admin-configured Measurement ID is known and exposes
 * a typed `gaEvent` helper. Safe no-op until configured.
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

type QueuedGA =
  | { kind: "event"; name: GAEventName; params: Record<string, unknown> }
  | { kind: "page"; path: string; title?: string };
const gaQueue: QueuedGA[] = [];

function flushGAQueue() {
  if (!ga4Enabled || !ga4Id || typeof window === "undefined") return;
  while (gaQueue.length > 0) {
    const item = gaQueue.shift()!;
    if (item.kind === "event") gaEvent(item.name, item.params);
    else if (item.kind === "page") gaPageView(item.path, item.title);
  }
}

export function setGA4Config(cfg: MarketingConfig) {
  ga4Enabled = cfg.ga4Enabled;
  ga4Id = cfg.ga4MeasurementId;
  if (typeof window === "undefined") return;
  if (ga4Enabled && ga4Id) {
    loadGA4(ga4Id);
    flushGAQueue();
  }
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
  | "add_to_cart"
  | "add_to_wishlist"
  | "begin_checkout"
  | "purchase"
  | "photo_printing"
  | "custom_design"
  | "contact";

export function gaEvent(name: GAEventName, params: Record<string, unknown> = {}) {
  if (isPreviewMode()) return;
  if (!ga4Enabled || !ga4Id || typeof window === "undefined") {
    gaQueue.push({ kind: "event", name, params });
    return;
  }
  try {
    window.gtag?.("event", name, params);
  } catch {
    /* noop */
  }
}

export function gaPageView(path: string, title?: string) {
  if (isPreviewMode()) return;
  if (!ga4Enabled || !ga4Id || typeof window === "undefined") {
    gaQueue.push({ kind: "page", path, title });
    return;
  }
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
