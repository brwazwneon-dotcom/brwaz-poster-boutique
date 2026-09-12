import { useQuery } from "@tanstack/react-query";
import { getHeroBannersPublic, getSiteSettingsPublic } from "@/lib/db-public.functions";

export type HeroBanner = {
  id: string;
  image_url: string;
  mobile_image_url?: string | null;
  src?: string;
  mobileSrc?: string;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes?: string;
  focal_x?: number | null;
  focal_y?: number | null;
  alt_text?: string | null;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  link_url?: string | null;
  enabled: boolean;
  sort_order: number;
};

export type HeroBannerConfig = {
  autoplay_ms: number;
  overlay_opacity: number;
};

export const HERO_BANNER_CONFIG_KEY = "hero_banner_config_v1";
export const DEFAULT_HERO_BANNER_CONFIG: HeroBannerConfig = {
  autoplay_ms: 5000,
  overlay_opacity: 0.55,
};

// Vercel Blob URLs are already public and permanent, so unlike the old
// Supabase Storage version there's no signing step and no image_variants
// join — `image_url` doubles as `src` directly.
export function useHeroBanners() {
  return useQuery({
    queryKey: ["hero-banners"],
    staleTime: 60_000,
    queryFn: async () => {
      const banners = await getHeroBannersPublic();
      return banners.map((b) => ({ ...b, src: b.image_url })) as HeroBanner[];
    },
  });
}

export function useHeroBannerConfig() {
  return useQuery({
    queryKey: ["hero-banner-config"],
    staleTime: 60_000,
    queryFn: async () => {
      const settings = await getSiteSettingsPublic({ data: { keys: [HERO_BANNER_CONFIG_KEY] } });
      const v = (settings[HERO_BANNER_CONFIG_KEY] ?? {}) as Partial<HeroBannerConfig>;
      return {
        autoplay_ms:
          Number(v.autoplay_ms) > 0
            ? Number(v.autoplay_ms)
            : DEFAULT_HERO_BANNER_CONFIG.autoplay_ms,
        overlay_opacity:
          typeof v.overlay_opacity === "number"
            ? v.overlay_opacity
            : DEFAULT_HERO_BANNER_CONFIG.overlay_opacity,
      } as HeroBannerConfig;
    },
  });
}
