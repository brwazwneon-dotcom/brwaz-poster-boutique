import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isPreviewMode } from "@/lib/preview-mode";

export type HomeSectionKey =
  | "homepage_slider"
  | "hero_banners"
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
  | "recommended-for-you"
  | "frame-sets"
  | "custom-design"
  | "photo-enhancement"
  | "how-it-works"
  | "faq"
  | "quality-section"
  | "wall-of-inspiration"
  | "room-transformation";

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
  id?: string;
  key: HomeSectionKey | string;
  enabled: boolean;
  visible?: boolean;
  sortOrder?: number;
  configuration?: Record<string, unknown>;
  updatedAt?: string;
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
  custom?: boolean;
  label?: string;
};

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  homepage_slider: "Homepage Slider",
  hero_banners: "Hero Banners",
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
  "frame-sets": "Frame Sets",
  "custom-design": "Custom Design",
  "photo-enhancement": "Photo Enhancement Before / After",
  "how-it-works": "How It Works",
  faq: "FAQ",
  "quality-section": "Quality Section",
  "wall-of-inspiration": "Wall of Inspiration",
  "room-transformation": "Room Transformation",
};

export interface HomeSectionRegistryEntry {
  key: HomeSectionKey;
  label: string;
  component?: string;
  defaultOrder?: number;
  defaultEnabled: boolean;
  defaultVisible: boolean;
  adminReorderable: boolean;
  defaultConfig?: Partial<HomeSectionConfig>;
}

export const HOME_SECTION_REGISTRY: HomeSectionRegistryEntry[] = [
  { key: "homepage_slider", label: "Homepage Slider", component: "HomepageSlider", defaultOrder: 1, defaultEnabled: true, defaultVisible: true, adminReorderable: true, defaultConfig: { display_type: "slider" } },
  { key: "hero_banners", label: "Hero Banners", component: "HeroBannerSection", defaultOrder: 2, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "trending-now", label: "Trending Now", component: "TrendingNow", defaultOrder: 3, defaultEnabled: true, defaultVisible: true, adminReorderable: true, defaultConfig: { title_en: "Trending Now", title_ar: "الترند الآن", source_type: "trending", display_type: "slider", items_count: 12 } },
  { key: "collections", label: "Shop by Collection", component: "ShopByCollection", defaultOrder: 4, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "best-sellers", label: "Best Sellers", component: "BestSellers", defaultOrder: 5, defaultEnabled: true, defaultVisible: true, adminReorderable: true, defaultConfig: { title_en: "Best Sellers", title_ar: "الأكثر مبيعاً", subtitle_en: "Our top picks — hand-selected.", subtitle_ar: "اختياراتنا المميزة", source_type: "best_sellers", display_type: "carousel", items_count: 12 } },
  { key: "custom-design", label: "Custom Design", component: "CustomDesignSection", defaultOrder: 5, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "photo-enhancement", label: "Photo Enhancement Before / After", component: "PhotoEnhancementBeforeAfter", defaultOrder: 6, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "reviews", label: "Customer Reviews", component: "CustomerReviews", defaultOrder: 7, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "how-it-works", label: "How It Works", component: "HowItWorksSection", defaultOrder: 8, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "trusted-quality", label: "Trusted Quality", component: "TrustedQuality", defaultOrder: 9, defaultEnabled: true, defaultVisible: true, adminReorderable: true, defaultConfig: { title_en: "Why Choose Us", title_ar: "ليه تختار برواز نيون", subtitle_en: "We deliver quality, not just frames.", subtitle_ar: "بنقدم جودة مش براويز بس" } },
  { key: "quality-section", label: "Quality Section", component: "QualitySection", defaultOrder: 10, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "faq", label: "FAQ", component: "StorefrontFAQ", defaultOrder: 11, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "wall-of-inspiration", label: "Wall of Inspiration", component: "WallOfInspiration", defaultOrder: 12, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "room-transformation", label: "Room Transformation", component: "RoomTransformation", defaultOrder: 13, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "highlights", label: "Highlights", component: "Highlights", defaultOrder: 14, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "frame-sets", label: "Frame Sets", component: "FrameSetsHome", defaultOrder: 15, defaultEnabled: true, defaultVisible: true, adminReorderable: true },
  { key: "before-after", label: "Before / After", component: "BeforeAfter", defaultOrder: 16, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "recently-viewed", label: "Recently Viewed", component: "PersonalizedSections", defaultOrder: 17, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "for-you", label: "For You", component: "PersonalizedSections", defaultOrder: 18, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "because-you-liked", label: "Because You Liked", component: "PersonalizedSections", defaultOrder: 19, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "recommended-for-you", label: "Recommended For You", component: "PersonalizedSections", defaultOrder: 20, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "trust", label: "Trust statement", component: "—", defaultOrder: 21, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "about", label: "About BRWAZWNEON", component: "—", defaultOrder: 22, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "benefits", label: "Benefits bar", component: "—", defaultOrder: 23, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
  { key: "categories", label: "Category grids", component: "CategoryGrids", defaultOrder: 24, defaultEnabled: true, defaultVisible: true, adminReorderable: true, defaultConfig: { display_type: "grid", items_count: 8 } },
  { key: "offers", label: "Special Offers", component: "—", defaultOrder: 25, defaultEnabled: false, defaultVisible: true, adminReorderable: true },
];

export function registryEntryToSection(entry: HomeSectionRegistryEntry): HomeSectionConfig {
  return {
    key: entry.key,
    enabled: entry.defaultEnabled,
    visible: entry.defaultVisible,
    ...entry.defaultConfig,
  };
}

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = HOME_SECTION_REGISTRY
  .filter((e) => e.defaultEnabled)
  .map(registryEntryToSection);

export const HOME_SECTIONS_KEY = "homepage_sections_v1";
export const HOME_SECTIONS_DRAFT_KEY = "homepage_sections_draft_v1";

export function normalizeHomeSectionKey(key: string) {
  return key === "hero" ? "hero_banners" : key;
}

export function normalizeHomeSections(raw: unknown): HomeSectionConfig[] {
  if (!Array.isArray(raw)) return withLayoutMetadata(DEFAULT_HOME_SECTIONS);
  const seen = new Set<string>();
  const out: HomeSectionConfig[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const key = typeof it.key === "string" ? normalizeHomeSectionKey(it.key) : undefined;
    if (!key) continue;
    const isCustom = it.custom === true || key.startsWith("custom-");
    if (seen.has(key)) continue;
    seen.add(key);
    const reg = !isCustom ? HOME_SECTION_REGISTRY.find((r) => r.key === key) : undefined;
    const def = reg ? registryEntryToSection(reg) : DEFAULT_HOME_SECTIONS.find((d) => d.key === key);
    out.push({
      id: typeof it.id === "string" ? it.id : key,
      key,
      enabled: it.enabled !== false,
      visible: it.visible !== false,
      sortOrder: typeof it.sortOrder === "number" ? it.sortOrder : index,
      configuration:
        it.configuration && typeof it.configuration === "object"
          ? (it.configuration as Record<string, unknown>)
          : undefined,
      updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : undefined,
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
  // Append any missing registry sections at the end (new sections auto-added).
  for (const reg of HOME_SECTION_REGISTRY) {
    if (!seen.has(reg.key)) {
      out.push(registryEntryToSection(reg));
      seen.add(reg.key);
    }
  }
  return withLayoutMetadata(out);
}

export function withLayoutMetadata(sections: HomeSectionConfig[]): HomeSectionConfig[] {
  return sections.map((section, index) => {
    const reg = !section.custom ? HOME_SECTION_REGISTRY.find((r) => r.key === section.key) : undefined;
    return {
      ...section,
      id: section.id ?? section.key,
      title:
        section.title ??
        section.title_en ??
        section.label ??
        reg?.label ??
        (HOME_SECTION_LABELS as Record<string, string>)[section.key] ??
        section.key,
      visible: section.visible !== false,
      sortOrder: index,
      configuration: section.configuration ?? {},
    };
  });
}

export function useHomeSections() {
  const preview = isPreviewMode();
  const q = useQuery({
    queryKey: ["homepage-sections", preview ? "draft" : "published"],
    staleTime: 60_000,
    queryFn: async (): Promise<HomeSectionConfig[]> => {
      if (preview) {
        const { data: draft } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", HOME_SECTIONS_DRAFT_KEY)
          .maybeSingle();
        if (draft?.value) return normalizeHomeSections(draft.value);
      }
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HOME_SECTIONS_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeHomeSections(data?.value);
    },
  });
  return q.data ?? normalizeHomeSections(DEFAULT_HOME_SECTIONS);
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
        homepage_count:
          Number.isFinite(hc) && hc > 0 && hc <= 24
            ? Math.floor(hc)
            : DEFAULT_BS_CONFIG.homepage_count,
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
