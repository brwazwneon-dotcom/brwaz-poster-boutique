import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomeSectionKey =
  | "hero"
  | "trust"
  | "trusted-quality"
  | "about"
  | "highlights"
  | "best-sellers"
  | "benefits"
  | "collections"
  | "categories"
  | "offers"
  | "recently-viewed"
  | "before-after"
  | "reviews"
  | "trending-now"
  | "for-you"
  | "because-you-liked"
  | "recommended-for-you";

export type SectionSourceType =
  | "manual"
  | "trending"
  | "best_sellers"
  | "recently_viewed"
  | "category"
  | "personalized"
  | "mixed";

export type SectionDisplayType = "slider" | "grid" | "carousel";

export type HomeSectionConfig = {
  key: HomeSectionKey | string; // string allows custom-<id>
  enabled: boolean;
  title?: string;
  subtitle?: string;
  title_en?: string;
  title_ar?: string;
  subtitle_en?: string;
  subtitle_ar?: string;
  items_count?: number;
  source_type?: SectionSourceType;
  display_type?: SectionDisplayType;
  manual_ids?: string[];
  custom?: boolean; // true for admin-created sections
  label?: string; // display name for custom sections
};

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  hero: "Hero",
  trust: "Trust statement",
  "trusted-quality": "Trusted Quality",
  about: "About BRWAZWNEON",
  highlights: "Highlights",
  "best-sellers": "Best Sellers",
  benefits: "Benefits bar",
  collections: "Shop by Collection",
  categories: "Category grids",
  offers: "Special Offers",
  "recently-viewed": "Recently Viewed",
  "before-after": "Before / After",
  reviews: "Customer Reviews",
  "trending-now": "Trending Now",
  "for-you": "For You",
  "because-you-liked": "Because You Liked",
  "recommended-for-you": "Recommended For You",
};

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = [
  { key: "hero", enabled: true },
  { key: "trust", enabled: true },
  {
    key: "trending-now",
    enabled: true,
    title_en: "Trending Now",
    title_ar: "الترند الآن",
    source_type: "trending",
    display_type: "slider",
    items_count: 12,
  },
  {
    key: "for-you",
    enabled: true,
    title_en: "For You",
    title_ar: "مختار لك",
    source_type: "personalized",
    display_type: "carousel",
    items_count: 12,
  },
  {
    key: "because-you-liked",
    enabled: true,
    title_en: "Because You Liked",
    title_ar: "لأنك أعجبت بـ",
    source_type: "personalized",
    display_type: "carousel",
    items_count: 12,
  },
  {
    key: "recommended-for-you",
    enabled: true,
    title_en: "Recommended For You",
    title_ar: "موصى به لك",
    source_type: "best_sellers",
    display_type: "carousel",
    items_count: 12,
  },
  { key: "collections", enabled: true },
  { key: "offers", enabled: true },
  { key: "trusted-quality", enabled: true, title: "Trusted Quality", subtitle: "Why BRWAZWNEON" },
  { key: "about", enabled: true },
  { key: "best-sellers", enabled: true, title: "Best Sellers", subtitle: "Our top picks — hand-selected." },
  { key: "highlights", enabled: true },
  { key: "benefits", enabled: true },
  { key: "categories", enabled: true },
  { key: "recently-viewed", enabled: true },
  { key: "before-after", enabled: true },
  { key: "reviews", enabled: true },
];

export const HOME_SECTIONS_KEY = "homepage_sections_v1";

function normalize(raw: unknown): HomeSectionConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_SECTIONS;
  const seen = new Set<string>();
  const out: HomeSectionConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const key = it.key as string | undefined;
    if (!key) continue;
    const isCustom = it.custom === true || key.startsWith("custom-");
    if (!isCustom && !(key in HOME_SECTION_LABELS)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const def = DEFAULT_HOME_SECTIONS.find((d) => d.key === key);
    out.push({
      key,
      enabled: it.enabled !== false,
      title: (it.title as string | undefined) ?? def?.title,
      subtitle: (it.subtitle as string | undefined) ?? def?.subtitle,
      title_en: (it.title_en as string | undefined) ?? def?.title_en,
      title_ar: (it.title_ar as string | undefined) ?? def?.title_ar,
      subtitle_en: (it.subtitle_en as string | undefined) ?? def?.subtitle_en,
      subtitle_ar: (it.subtitle_ar as string | undefined) ?? def?.subtitle_ar,
      items_count: typeof it.items_count === "number" ? it.items_count : def?.items_count,
      source_type: (it.source_type as HomeSectionConfig["source_type"]) ?? def?.source_type,
      display_type: (it.display_type as HomeSectionConfig["display_type"]) ?? def?.display_type,
      manual_ids: Array.isArray(it.manual_ids) ? (it.manual_ids as string[]) : def?.manual_ids,
      custom: isCustom || undefined,
      label: (it.label as string | undefined) ?? def?.label,
    });
  }
  // Append any missing defaults at the end (new sections auto-added).
  for (const d of DEFAULT_HOME_SECTIONS) {
    if (!seen.has(d.key)) out.push(d);
  }
  return out;
}

export function useHomeSections() {
  const q = useQuery({
    queryKey: ["homepage-sections"],
    staleTime: 60_000,
    queryFn: async (): Promise<HomeSectionConfig[]> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HOME_SECTIONS_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalize(data?.value);
    },
  });
  return q.data ?? DEFAULT_HOME_SECTIONS;
}

export type BestSellersConfig = {
  max: 8 | 12 | 16 | 24;
  autoplay: boolean;
  loop: boolean;
  enabled: boolean;
  title: string;
  subtitle: string;
  homepage_count: number;
  auto: boolean;
  show_badges: boolean;
  show_price: boolean;
  show_cart: boolean;
  show_wishlist: boolean;
  show_quick_view: boolean;
};

export const BEST_SELLERS_CONFIG_KEY = "best_sellers_config_v1";

const DEFAULT_BS_CONFIG: BestSellersConfig = {
  max: 12,
  autoplay: false,
  loop: true,
  enabled: true,
  title: "Best Sellers",
  subtitle: "Our top picks — hand-selected.",
  homepage_count: 6,
  auto: true,
  show_badges: true,
  show_price: true,
  show_cart: true,
  show_wishlist: true,
  show_quick_view: true,
};

export function useBestSellersConfig() {
  const q = useQuery({
    queryKey: ["best-sellers-config"],
    staleTime: 60_000,
    queryFn: async (): Promise<BestSellersConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", BEST_SELLERS_CONFIG_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<BestSellersConfig>;
      const allowed = [8, 12, 16, 24] as const;
      const max = allowed.includes(v.max as (typeof allowed)[number])
        ? (v.max as BestSellersConfig["max"])
        : DEFAULT_BS_CONFIG.max;
      const hc = Number(v.homepage_count);
      return {
        max,
        autoplay: v.autoplay === true,
        loop: v.loop !== false,
        enabled: v.enabled !== false,
        title: typeof v.title === "string" && v.title.trim() ? v.title : DEFAULT_BS_CONFIG.title,
        subtitle: typeof v.subtitle === "string" ? v.subtitle : DEFAULT_BS_CONFIG.subtitle,
        homepage_count: Number.isFinite(hc) && hc > 0 && hc <= 24 ? Math.floor(hc) : DEFAULT_BS_CONFIG.homepage_count,
        auto: v.auto !== false,
        show_badges: v.show_badges !== false,
        show_price: v.show_price !== false,
        show_cart: v.show_cart !== false,
        show_wishlist: v.show_wishlist !== false,
        show_quick_view: v.show_quick_view !== false,
      };
    },
  });
  return q.data ?? DEFAULT_BS_CONFIG;
}

export { DEFAULT_BS_CONFIG };