import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const FEATURED_SLUGS = [
  "football",
  "movies",
  "tv-series",
  "marvel-dc",
  "anime",
  "cars",
] as const;

export type FeaturedSlug = (typeof FEATURED_SLUGS)[number];

export const HOME_CATEGORY_PICKS_KEY = "home_category_picks_v1";

export type HomeCategoryPicks = Record<string, string[]>;

function normalize(raw: unknown): HomeCategoryPicks {
  const out: HomeCategoryPicks = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[k] = v.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
  }
  return out;
}

export function useHomeCategoryPicks() {
  return useQuery({
    queryKey: ["home-category-picks"],
    staleTime: 60_000,
    queryFn: async (): Promise<HomeCategoryPicks> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HOME_CATEGORY_PICKS_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalize(data?.value);
    },
  });
}