import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QuickBarChip = {
  id: string;
  label: string;
  href: string;
  enabled: boolean;
};

export type QuickBarConfig = {
  enabled: boolean;
  chips: QuickBarChip[];
};

export const QUICKBAR_KEY = "collections_quickbar_v1";

export const DEFAULT_QUICKBAR: QuickBarConfig = {
  enabled: true,
  chips: [
    { id: "football", label: "Football", href: "/category/football", enabled: true },
    { id: "movies", label: "Movies", href: "/category/movies", enabled: true },
    { id: "tv-series", label: "TV Series", href: "/category/tv-series", enabled: true },
    { id: "marvel-dc", label: "Marvel & DC", href: "/category/marvel-dc", enabled: true },
    { id: "anime", label: "Anime", href: "/category/anime", enabled: true },
    { id: "cars", label: "Cars", href: "/category/cars", enabled: true },
    { id: "custom-design", label: "Custom Design", href: "/custom-design", enabled: true },
    { id: "photo-printing", label: "Photo Printing", href: "/photo-printing", enabled: true },
    { id: "sets", label: "Sets", href: "/sets", enabled: true },
    { id: "best-sellers", label: "Best Sellers", href: "/#best-sellers", enabled: true },
  ],
};

function normalize(raw: unknown): QuickBarConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_QUICKBAR;
  const v = raw as Partial<QuickBarConfig>;
  const chips = Array.isArray(v.chips)
    ? v.chips
        .filter((c): c is QuickBarChip => !!c && typeof c === "object" && typeof (c as QuickBarChip).id === "string")
        .map((c) => ({
          id: String(c.id),
          label: String(c.label ?? c.id),
          href: String(c.href ?? "/"),
          enabled: c.enabled !== false,
        }))
    : DEFAULT_QUICKBAR.chips;
  return {
    enabled: v.enabled !== false,
    chips: chips.length ? chips : DEFAULT_QUICKBAR.chips,
  };
}

export function useQuickBar() {
  const q = useQuery({
    queryKey: ["collections-quickbar"],
    staleTime: 60_000,
    queryFn: async (): Promise<QuickBarConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", QUICKBAR_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalize(data?.value);
    },
  });
  return q.data ?? DEFAULT_QUICKBAR;
}