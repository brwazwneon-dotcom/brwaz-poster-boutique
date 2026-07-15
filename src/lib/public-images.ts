import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Variant = "thumb" | "medium" | "large";

/**
 * Public storefront image rule: use generated display variants only.
 * Never falls back to poster original/image_url; missing variants render the
 * lightweight placeholder from FramePreview/SafeImage instead.
 */
export function usePosterImageVariants(ids: string[], variant: Variant = "thumb") {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 80);
  const key = uniqueIds.join(",");
  const { data = {} } = useQuery({
    queryKey: ["public-poster-image-variants", variant, key],
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("image_variants")
        .select("source_id,url,width")
        .eq("source_table", "posters")
        .eq("variant", variant)
        .eq("status", "done")
        .in("source_id", uniqueIds);
      if (error) return {};
      const out: Record<string, string> = {};
      for (const row of data ?? []) {
        const id = String(row.source_id ?? "");
        const url = String(row.url ?? "");
        if (!id || !url) continue;
        out[id] = url;
      }
      return out;
    },
  });
  return data;
}

export const usePosterThumbs = (ids: string[]) => usePosterImageVariants(ids, "thumb");
export const usePosterPreviews = (ids: string[]) => usePosterImageVariants(ids, "medium");