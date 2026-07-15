import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Variant = "thumb" | "medium" | "large";

/**
 * Public storefront image rule: use generated display variants only.
 * Falls back to the poster's stored image_url when a variant hasn't been
 * generated yet — better than an empty frame on the storefront.
 * Original/print-quality URLs are never used here.
 */
export function usePosterImageVariants(ids: string[], variant: Variant = "thumb") {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 80);
  const key = uniqueIds.join(",");
  const { data = {} } = useQuery({
    queryKey: ["public-poster-image-variants", variant, key],
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      // 1) Preferred: the requested display variant.
      const { data: variantRows } = await supabase
        .from("image_variants")
        .select("source_id,url,variant")
        .eq("source_table", "posters")
        .in("variant", [variant, "medium", "thumb"])
        .eq("status", "done")
        .in("source_id", uniqueIds);
      // Priority per id: requested variant > medium > thumb
      const priority: Record<string, number> = { [variant]: 0, medium: 1, thumb: 2 };
      const best: Record<string, { url: string; rank: number }> = {};
      for (const row of variantRows ?? []) {
        const id = String(row.source_id ?? "");
        const url = String(row.url ?? "");
        if (!id || !url) continue;
        const rank = priority[String(row.variant)] ?? 9;
        if (!best[id] || rank < best[id].rank) best[id] = { url, rank };
      }
      for (const id of uniqueIds) if (best[id]) out[id] = best[id].url;
      // 2) Fallback: poster's own image_url for anything still missing.
      const missing = uniqueIds.filter((id) => !out[id]);
      if (missing.length > 0) {
        const { data: posterRows } = await supabase
          .from("posters")
          .select("id,image_url")
          .in("id", missing);
        for (const row of posterRows ?? []) {
          const id = String(row.id ?? "");
          const url = String(row.image_url ?? "");
          if (id && url) out[id] = url;
        }
      }
      return out;
    },
  });
  return data;
}

export const usePosterThumbs = (ids: string[]) => usePosterImageVariants(ids, "thumb");
export const usePosterPreviews = (ids: string[]) => usePosterImageVariants(ids, "medium");