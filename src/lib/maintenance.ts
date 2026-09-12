import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";

export const MAINTENANCE_KEY = "maintenance_mode";
export const MAINTENANCE_BYPASS_STORAGE = "brwaz_maintenance_bypass";

export type MaintenanceConfig = {
  enabled: boolean;
  title: string;
  subtitle: string;
  endTime: string | null; // ISO string
  backgroundImage: string | null;
  backgroundVideo: string | null;
  overlayOpacity: number; // 0..1
  bypassPassword: string; // whitelist password
  whitelistEmails: string[];
  buttons: {
    contactLabel: string;
    contactHref: string;
    whatsappLabel: string;
    whatsappHref: string;
    instagramLabel: string;
    instagramHref: string;
    facebookLabel: string;
    facebookHref: string;
  };
};

export const DEFAULT_MAINTENANCE: MaintenanceConfig = {
  enabled: false,
  title: "We'll Be Back Soon",
  subtitle: "We're currently improving your shopping experience. Please check back shortly.",
  endTime: null,
  backgroundImage: null,
  backgroundVideo: null,
  overlayOpacity: 0.75,
  bypassPassword: "",
  whitelistEmails: [],
  buttons: {
    contactLabel: "Contact Us",
    contactHref: "mailto:brwazwneon@gmail.com",
    whatsappLabel: "WhatsApp",
    whatsappHref: "https://wa.me/201148370194",
    instagramLabel: "Instagram",
    instagramHref: "https://www.instagram.com/brwazwneon/",
    facebookLabel: "Facebook",
    facebookHref: "https://www.facebook.com/profile.php?id=61568610092142",
  },
};

export function normalizeMaintenance(v: unknown): MaintenanceConfig {
  const raw = (v ?? {}) as Partial<MaintenanceConfig>;
  return {
    ...DEFAULT_MAINTENANCE,
    ...raw,
    buttons: { ...DEFAULT_MAINTENANCE.buttons, ...(raw.buttons ?? {}) },
    whitelistEmails: Array.isArray(raw.whitelistEmails) ? raw.whitelistEmails : [],
    overlayOpacity:
      typeof raw.overlayOpacity === "number" && raw.overlayOpacity >= 0 && raw.overlayOpacity <= 1
        ? raw.overlayOpacity
        : DEFAULT_MAINTENANCE.overlayOpacity,
  };
}

export function useMaintenanceConfig() {
  return useQuery({
    queryKey: ["maintenance-mode"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MaintenanceConfig> => {
      const settings = await getSiteSettingsPublic({ data: { keys: [MAINTENANCE_KEY] } });
      return normalizeMaintenance(settings[MAINTENANCE_KEY]);
    },
  });
}

/**
 * Returns whether the current viewer is allowed to bypass maintenance mode.
 * Bypass is password-only now — there's no customer auth system, just the
 * single Neon-backed admin account, which already bypasses maintenance via
 * the /admin route check in MaintenanceGate itself.
 */
export function useMaintenanceBypass(cfg: MaintenanceConfig | undefined) {
  const [bypass, setBypass] = useState<{ ready: boolean; allowed: boolean }>({
    ready: false,
    allowed: false,
  });

  useEffect(() => {
    if (!cfg) return;
    // Query param password → persist
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const provided = params.get("preview") ?? params.get("bypass");
      if (provided) {
        try {
          localStorage.setItem(MAINTENANCE_BYPASS_STORAGE, provided);
        } catch {
          /* noop */
        }
      }
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MAINTENANCE_BYPASS_STORAGE);
    } catch {
      /* noop */
    }
    const allowed = Boolean(cfg.bypassPassword && stored && stored === cfg.bypassPassword);
    setBypass({ ready: true, allowed });
  }, [cfg]);

  return bypass;
}
