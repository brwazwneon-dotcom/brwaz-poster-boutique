import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", MAINTENANCE_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeMaintenance(data?.value);
    },
  });
}

/**
 * Returns whether the current viewer is allowed to bypass maintenance mode.
 * Bypasses: admin role, whitelisted email, matching localStorage password.
 */
export function useMaintenanceBypass(cfg: MaintenanceConfig | undefined) {
  const [bypass, setBypass] = useState<{ ready: boolean; allowed: boolean }>({
    ready: false,
    allowed: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cfg) return;
      // 1) Query param password → persist
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const provided = params.get("preview") ?? params.get("bypass");
        if (provided) {
          try {
            localStorage.setItem(MAINTENANCE_BYPASS_STORAGE, provided);
          } catch { /* noop */ }
        }
      }
      // 2) Local password matches
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(MAINTENANCE_BYPASS_STORAGE);
      } catch { /* noop */ }
      if (cfg.bypassPassword && stored && stored === cfg.bypassPassword) {
        if (!cancelled) setBypass({ ready: true, allowed: true });
        return;
      }

      // 3) Auth-based checks (admin role or whitelisted email)
      const { data: session } = await supabase.auth.getSession();
      const user = session.session?.user;
      if (!user) {
        if (!cancelled) setBypass({ ready: true, allowed: false });
        return;
      }
      const email = (user.email ?? "").toLowerCase();
      if (email && cfg.whitelistEmails.some((e) => e.trim().toLowerCase() === email)) {
        if (!cancelled) setBypass({ ready: true, allowed: true });
        return;
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setBypass({ ready: true, allowed: !!role });
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg]);

  return bypass;
}