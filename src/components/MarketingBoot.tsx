import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useMarketingConfig } from "@/lib/use-marketing";
import { setMarketingConfig, trackEvent } from "@/lib/meta-pixel";

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
  }, [cfg.pixelId, cfg.pixelEnabled, cfg.capiEnabled, cfg.advancedMatchingEnabled]);

  useEffect(() => {
    if (!cfg.pixelEnabled && !cfg.capiEnabled) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackEvent("PageView");
  }, [pathname, cfg.pixelEnabled, cfg.capiEnabled]);

  return null;
}