import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useMarketingConfig } from "@/lib/use-marketing";
import { setMarketingConfig, trackEvent } from "@/lib/meta-pixel";
import { setGA4Config, gaPageView } from "@/lib/ga4";
import { trackVisit } from "@/lib/analytics";
import { rememberPublicRoute } from "@/lib/preview-mode";

/**
 * Loads the Meta Pixel based on admin settings and fires PageView on every
 * route change. Safe to render unconditionally; renders nothing.
 */
export function MarketingBoot() {
  const cfg = useMarketingConfig();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    setMarketingConfig(cfg);
    setGA4Config(cfg);
  }, [cfg.pixelId, cfg.pixelEnabled, cfg.capiEnabled, cfg.advancedMatchingEnabled, cfg.ga4MeasurementId, cfg.ga4Enabled]);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    rememberPublicRoute(pathname);
    // Always record internal analytics regardless of Pixel/GA toggles.
    try { trackVisit(pathname); } catch { /* noop */ }
    if (cfg.pixelEnabled || cfg.capiEnabled || cfg.ga4Enabled) {
      trackEvent("PageView");
      gaPageView(pathname);
    }
  }, [pathname, cfg.pixelEnabled, cfg.capiEnabled, cfg.ga4Enabled]);

  return null;
}