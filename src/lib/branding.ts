import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LOGO_URL as DEFAULT_LOGO } from "@/lib/site";
import { useIsMobile } from "@/hooks/use-mobile";

export const BRANDING_KEY = "branding_v1";

export type BrandingConfig = {
  logoUrl: string;
  keepAspect: boolean;
  /** Explicit ratio (width/height) captured when uploading a logo. Optional. */
  aspectRatio: number | null;
  headerDesktop: number;
  headerMobile: number;
  footerDesktop: number;
  footerMobile: number;
  maintenance: number;
  pwa: number;
};

export const DEFAULT_BRANDING: BrandingConfig = {
  logoUrl: DEFAULT_LOGO,
  keepAspect: true,
  aspectRatio: null,
  headerDesktop: 45,
  headerMobile: 36,
  footerDesktop: 45,
  footerMobile: 36,
  maintenance: 64,
  pwa: 192,
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeBranding(raw: unknown): BrandingConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_BRANDING;
  const v = raw as Partial<BrandingConfig>;
  return {
    logoUrl: typeof v.logoUrl === "string" && v.logoUrl ? v.logoUrl : DEFAULT_BRANDING.logoUrl,
    keepAspect: v.keepAspect !== false,
    aspectRatio:
      typeof v.aspectRatio === "number" && Number.isFinite(v.aspectRatio) && v.aspectRatio > 0
        ? v.aspectRatio
        : null,
    headerDesktop: num(v.headerDesktop, DEFAULT_BRANDING.headerDesktop, 40, 300),
    headerMobile: num(v.headerMobile, DEFAULT_BRANDING.headerMobile, 30, 200),
    footerDesktop: num(v.footerDesktop, DEFAULT_BRANDING.footerDesktop, 40, 250),
    footerMobile: num(v.footerMobile, DEFAULT_BRANDING.footerMobile, 30, 200),
    maintenance: num(v.maintenance, DEFAULT_BRANDING.maintenance, 40, 400),
    pwa: num(v.pwa, DEFAULT_BRANDING.pwa, 64, 512),
  };
}

export function useBranding(): BrandingConfig {
  const q = useQuery({
    queryKey: ["branding", BRANDING_KEY],
    staleTime: 60_000,
    queryFn: async (): Promise<BrandingConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", BRANDING_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeBranding(data?.value);
    },
  });
  return q.data ?? DEFAULT_BRANDING;
}

/** Compute logo size for a given surface, respecting current viewport. */
export function useLogoSize(surface: "header" | "footer" | "maintenance") {
  const b = useBranding();
  const isMobile = useIsMobile();
  let height = b.headerDesktop;
  if (surface === "header") height = isMobile ? b.headerMobile : b.headerDesktop;
  else if (surface === "footer") height = isMobile ? b.footerMobile : b.footerDesktop;
  else height = b.maintenance;
  const style: React.CSSProperties = {
    height: `${height}px`,
    width: b.keepAspect ? "auto" : undefined,
    maxWidth: "100%",
    objectFit: "contain",
  };
  return { src: b.logoUrl, style, height };
}

export function useSaveBranding() {
  const qc = useQueryClient();
  return async (next: BrandingConfig) => {
    const clean = normalizeBranding(next);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: BRANDING_KEY, value: clean as unknown as never }, { onConflict: "key" });
    if (error) throw error;
    qc.setQueryData(["branding", BRANDING_KEY], clean);
    await qc.invalidateQueries({ queryKey: ["branding"] });
  };
}

/** Preloads current branding into cache — call once per session if needed. */
export function useBrandingBoot() {
  useBranding();
  useEffect(() => {}, []);
}
