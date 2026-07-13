import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Variant } from "@/lib/image-pipeline";

/**
 * Fetch the URL for a specific display variant of an image.
 * Falls back to the original if the variant hasn't been generated yet.
 */
export function useImageVariant(
  sourceTable: string,
  sourceId: string | null | undefined,
  variant: Variant,
  fallbackUrl?: string | null,
) {
  const { data } = useQuery({
    queryKey: ["image-variant", sourceTable, sourceId, variant],
    enabled: !!sourceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!sourceId) return null;
      const { data, error } = await supabase
        .from("image_variants")
        .select("url")
        .eq("source_table", sourceTable)
        .eq("source_id", sourceId)
        .eq("variant", variant)
        .eq("status", "done")
        .maybeSingle();
      if (error || !data) return null;
      return data.url as string | null;
    },
  });
  return data || fallbackUrl || null;
}

export type ImageStats = {
  posters_total: number;
  posters_with_thumb: number;
  posters_missing_thumb: number;
  variants_total: number;
  variants_done: number;
  variants_failed: number;
  variants_pending: number;
  variants_bytes: number;
  heavy_variants: number;
};

export function useImageStats() {
  return useQuery({
    queryKey: ["admin-image-stats"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_image_stats");
      if (error) throw error;
      return (data ?? {}) as ImageStats;
    },
  });
}