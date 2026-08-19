import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ensureSignedUrl, signStoragePath } from "@/lib/storage-url";

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

type HeroVariantRow = {
  source_id: string | null;
  url: string | null;
  variant: string | null;
  variant_path?: string | null;
  bucket?: string | null;
};

function isStoragePath(value: string) {
  return value.length > 0 && !/^https?:\/\//i.test(value) && !value.startsWith("data:");
}

async function resolveHeroUrl(url: string | null | undefined, bucket = "slider") {
  if (!url) return "";
  try {
    if (isStoragePath(url)) return await signStoragePath(bucket, url);
    return await ensureSignedUrl(url, bucket);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[HeroBanner] failed to sign image URL", { url, bucket, err });
    }
    return url;
  }
}

async function resolveVariantUrl(row: HeroVariantRow) {
  const bucket = row.bucket || "slider";
  if (row.variant_path) return resolveHeroUrl(row.variant_path, bucket);
  return resolveHeroUrl(row.url, bucket);
}

export function useHeroBanners() {
  return useQuery({
    queryKey: ["hero-banners"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_banners")
        .select("id,image_url,title,subtitle,button_text,button_link,enabled,sort_order")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const banners = (data ?? []) as HeroBanner[];
      const ids = banners.map((b) => b.id).filter(Boolean);
      if (ids.length === 0) return banners;

      const { data: variants } = await supabase
        .from("image_variants")
        .select("source_id,url,variant,variant_path,bucket")
        .eq("source_table", "hero_banners")
        .in("variant", [
          "small_avif",
          "small_webp",
          "medium_avif",
          "medium_webp",
          "large_avif",
          "large_webp",
        ])
        .eq("status", "done")
        .in("source_id", ids);

      const byId: Record<string, Record<string, string>> = {};
      for (const row of (variants ?? []) as HeroVariantRow[]) {
        const id = String(row.source_id ?? "");
        const variant = String(row.variant ?? "");
        const url = await resolveVariantUrl(row);
        if (!id || !variant || !url) continue;
        byId[id] = byId[id] ?? {};
        byId[id][variant] = url;
      }

      return Promise.all(
        banners.map(async (banner) => {
          const originalSrc = await resolveHeroUrl(banner.image_url, "slider");
          const mobileSrc = await resolveHeroUrl(banner.mobile_image_url, "slider");
          const found = byId[banner.id];
          if (!found) return { ...banner, src: originalSrc, mobileSrc: mobileSrc || undefined };
          const src = found.medium_webp ?? found.small_webp ?? found.large_webp;
          if (!src) return { ...banner, src: originalSrc, mobileSrc: mobileSrc || undefined };
          const avifSrcSet = [
            found.small_avif ? `${found.small_avif} 480w` : "",
            found.medium_avif ? `${found.medium_avif} 800w` : "",
            found.large_avif ? `${found.large_avif} 1200w` : "",
          ]
            .filter(Boolean)
            .join(", ");
          const webpSrcSet = [
            found.small_webp ? `${found.small_webp} 480w` : "",
            found.medium_webp ? `${found.medium_webp} 800w` : "",
            found.large_webp ? `${found.large_webp} 1200w` : "",
          ]
            .filter(Boolean)
            .join(", ");
          return {
            ...banner,
            src,
            mobileSrc: mobileSrc || undefined,
            avifSrcSet: avifSrcSet || undefined,
            webpSrcSet: webpSrcSet || undefined,
            sizes: "100vw",
          };
        }),
      );
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
