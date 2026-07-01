import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomeSectionKey =
  | "hero"
  | "trust"
  | "trusted-quality"
  | "highlights"
  | "best-sellers"
  | "benefits"
  | "collections"
  | "categories"
  | "offers"
  | "recently-viewed"
  | "before-after"
  | "reviews";

export type HomeSectionConfig = {
  key: HomeSectionKey;
  enabled: boolean;
  title?: string;
  subtitle?: string;
};

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  hero: "Hero",
  trust: "Trust statement",
  "trusted-quality": "Trusted Quality",
  highlights: "Highlights",
  "best-sellers": "Best Sellers",
  benefits: "Benefits bar",
  collections: "Shop by Collection",
  categories: "Category grids",
  offers: "Special Offers",
  "recently-viewed": "Recently Viewed",
  "before-after": "Before / After",
  reviews: "Customer Reviews",
};

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = [
  { key: "hero", enabled: true },
  { key: "trust", enabled: true },
  { key: "trusted-quality", enabled: true, title: "Trusted Quality", subtitle: "Why BRWAZWNEON" },
  { key: "highlights", enabled: true },
  { key: "best-sellers", enabled: true, title: "Best Sellers", subtitle: "Our top picks — hand-selected." },
  { key: "benefits", enabled: true },
  { key: "collections", enabled: true },
  { key: "categories", enabled: true },
  { key: "offers", enabled: true },
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
    const key = (item as { key?: string }).key as HomeSectionKey | undefined;
    if (!key || !(key in HOME_SECTION_LABELS)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const def = DEFAULT_HOME_SECTIONS.find((d) => d.key === key);
    out.push({
      key,
      enabled: (item as { enabled?: unknown }).enabled !== false,
      title: (item as { title?: string }).title ?? def?.title,
      subtitle: (item as { subtitle?: string }).subtitle ?? def?.subtitle,
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
};

export const BEST_SELLERS_CONFIG_KEY = "best_sellers_config_v1";

const DEFAULT_BS_CONFIG: BestSellersConfig = {
  max: 12,
  autoplay: false,
  loop: true,
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
      return {
        max,
        autoplay: v.autoplay === true,
        loop: v.loop !== false,
      };
    },
  });
  return q.data ?? DEFAULT_BS_CONFIG;
}

export { DEFAULT_BS_CONFIG };