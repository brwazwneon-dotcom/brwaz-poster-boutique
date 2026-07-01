import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HeroBanner = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  enabled: boolean;
  sort_order: number;
};

export type HeroBannerConfig = {
  autoplay_ms: number;
  overlay_opacity: number;
};

export const HERO_BANNER_CONFIG_KEY = "hero_banner_config_v1";
export const DEFAULT_HERO_BANNER_CONFIG: HeroBannerConfig = {
  autoplay_ms: 4000,
  overlay_opacity: 0.55,
};

export function useHeroBanners() {
  return useQuery({
    queryKey: ["hero-banners"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_banners" as never)
        .select("id,image_url,title,subtitle,button_text,button_link,enabled,sort_order")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HeroBanner[];
    },
  });
}

export function useHeroBannerConfig() {
  return useQuery({
    queryKey: ["hero-banner-config"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HERO_BANNER_CONFIG_KEY)
        .maybeSingle();
      const v = (data?.value ?? {}) as Partial<HeroBannerConfig>;
      return {
        autoplay_ms: Number(v.autoplay_ms) > 0 ? Number(v.autoplay_ms) : DEFAULT_HERO_BANNER_CONFIG.autoplay_ms,
        overlay_opacity: typeof v.overlay_opacity === "number" ? v.overlay_opacity : DEFAULT_HERO_BANNER_CONFIG.overlay_opacity,
      } as HeroBannerConfig;
    },
  });
}