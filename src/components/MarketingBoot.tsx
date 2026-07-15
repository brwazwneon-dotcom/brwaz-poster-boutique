import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useMarketingConfig } from "@/lib/use-marketing";
import { setMarketingConfig, trackEvent, trackCustom } from "@/lib/meta-pixel";
import { setGA4Config, gaPageView } from "@/lib/ga4";
import { trackVisit } from "@/lib/analytics";
import { rememberPublicRoute } from "@/lib/preview-mode";
import { usePerformanceFlags } from "@/lib/performance-flags";

/**
 * True for URLs where marketing/pixel tracking must NEVER run
 * (admin dashboard and its APIs).
 */
function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin");
}

/**
 * Loads the Meta Pixel based on admin settings and fires PageView on every
 * route change. Safe to render unconditionally; renders nothing.
 */
export function MarketingBoot() {
  const cfg = useMarketingConfig();
  const perf = usePerformanceFlags();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastPath = useRef<string | null>(null);
  const lastFired = useRef<string | null>(null); // last path a PageView actually fired for

  useEffect(() => {
    // Never inject the Pixel script on admin routes.
    if (isAdminPath(pathname)) return;
    // Defer script injection until the browser is idle so it never blocks
    // first paint / LCP. Falls back to a short timeout on unsupported browsers.
    const run = () => {
      setMarketingConfig(cfg);
      setGA4Config(cfg);
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let toId: number | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(run, { timeout: Math.max(500, perf.analytics_defer_ms) });
    } else {
      toId = window.setTimeout(run, Math.max(500, perf.analytics_defer_ms));
    }
    return () => {
      if (idleId != null && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      if (toId != null) window.clearTimeout(toId);
    };
  }, [pathname, perf.analytics_defer_ms, cfg.pixelId, cfg.pixelEnabled, cfg.capiEnabled, cfg.advancedMatchingEnabled, cfg.ga4MeasurementId, cfg.ga4Enabled]);

  useEffect(() => {
    // Always update lastPath so we don't spam internal analytics.
    const routeChanged = lastPath.current !== pathname;
    lastPath.current = pathname;

    // Never fire marketing on admin routes.
    if (isAdminPath(pathname)) return;

    if (routeChanged) {
      rememberPublicRoute(pathname);
      // Always record internal analytics regardless of Pixel/GA toggles.
      try { trackVisit(pathname); } catch { /* noop */ }
    }

    // Fire PageView whenever we haven't fired it yet for this path AND
    // tracking is enabled — this covers the "config arrived late" case
    // where the effect first ran with pixelEnabled=false.
    if ((cfg.pixelEnabled || cfg.capiEnabled || cfg.ga4Enabled) && lastFired.current !== pathname) {
      lastFired.current = pathname;
      try { trackEvent("PageView"); } catch { /* noop */ }
      try { gaPageView(pathname); } catch { /* noop */ }

      // Route-specific auto events for cart / checkout so Meta Pixel Helper
      // and audiences pick them up without requiring in-page code.
      if (pathname === "/cart" || pathname.startsWith("/cart")) {
        try { trackCustom("ViewCart"); } catch { /* noop */ }
      }
      if (pathname === "/checkout" || pathname.startsWith("/checkout")) {
        try { trackEvent("InitiateCheckout"); } catch { /* noop */ }
      }
    }
  }, [pathname, cfg.pixelEnabled, cfg.capiEnabled, cfg.ga4Enabled]);

  return null;
}