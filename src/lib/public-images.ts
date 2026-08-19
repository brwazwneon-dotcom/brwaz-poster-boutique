import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Variant = "thumb" | "small" | "medium" | "large";
type Format = "avif" | "webp";

export type ResponsivePosterImage = {
  src: string;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes: string;
};

export type VariantMap = Record<string, string>;
export type ResponsiveMap = Record<string, ResponsivePosterImage>;

export function resolveProductArtwork(
  product: { id: string; image_url?: string | null },
  variants?: VariantMap | ResponsiveMap,
): string {
  const v = variants?.[product.id];
  if (typeof v === "string") return v;
  if (v?.src) return v.src;
  return product.image_url ?? "";
}

const WIDTHS: Record<Variant, number> = {
  thumb: 240,
  small: 320,
  medium: 640,
  large: 1200,
};

const VARIANTS: Variant[] = ["thumb", "small", "medium", "large"];

function keysFor(variant: Variant) {
  return [`${variant}_avif`, `${variant}_webp`, variant];
}

/**
 * Public storefront image rule: use generated display variants only.
 * Uses generated display variants only. It intentionally does not fall back to
 * posters.image_url because that may be the private print-quality original.
 */
export function usePosterImageVariants(
  ids: string[],
  variant: Variant = "thumb",
  format: Format = "webp",
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const key = uniqueIds.join(",");
  const { data = {} } = useQuery({
    queryKey: ["public-poster-image-variants", variant, format, key],
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      const priority: Record<string, number> = {
        [`${variant}_${format}`]: 0,
        [`${variant}_avif`]: format === "avif" ? 1 : 2,
        [`${variant}_webp`]: format === "webp" ? 1 : 2,
        [variant]: 3,
        medium_webp: 4,
        medium_avif: 5,
        medium: 6,
        small_webp: 7,
        small_avif: 8,
        small: 9,
        thumb_webp: 10,
        thumb_avif: 11,
        thumb: 12,
      };
      const best: Record<string, { url: string; rank: number }> = {};
      const variantTypes = [
        `${variant}_${format}`,
        ...keysFor(variant),
        ...keysFor("medium"),
        ...keysFor("small"),
        ...keysFor("thumb"),
      ];
      for (let i = 0; i < uniqueIds.length; i += 80) {
        const batch = uniqueIds.slice(i, i + 80);
        const { data: variantRows } = await supabase
          .from("image_variants")
          .select("source_id,url,variant")
          .eq("source_table", "posters")
          .in("variant", variantTypes)
          .eq("status", "done")
          .in("source_id", batch)
          .limit(10000);
        for (const row of variantRows ?? []) {
          const id = String(row.source_id ?? "");
          const url = String(row.url ?? "");
          if (!id || !url) continue;
          const rank = priority[String(row.variant)] ?? 9;
          if (!best[id] || rank < best[id].rank) best[id] = { url, rank };
        }
      }
      for (const id of uniqueIds) if (best[id]) out[id] = best[id].url;
      return out;
    },
  });
  return data;
}

export const usePosterThumbs = (ids: string[]) => usePosterImageVariants(ids, "thumb");
export const usePosterSmalls = (ids: string[]) => usePosterImageVariants(ids, "small");
export const usePosterPreviews = (ids: string[]) => usePosterImageVariants(ids, "medium");

async function fetchVariantsBatch(ids: string[]) {
  const rows: Array<{ source_id: string | null; url: string | null; variant: string }> = [];
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    const { data } = await supabase
      .from("image_variants")
      .select("source_id,url,variant")
      .eq("source_table", "posters")
      .in("variant", VARIANTS.flatMap((v) => [`${v}_avif`, `${v}_webp`, v]))
      .eq("status", "done")
      .in("source_id", batch)
      .limit(10000);
    rows.push(...(data ?? []));
  }
  return rows;
}

export function usePosterResponsiveImages(
  ids: string[],
  sizes = "(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 16vw",
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const key = uniqueIds.join(",");
  const { data = {} } = useQuery({
    queryKey: ["public-poster-responsive-images", key, sizes],
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Record<string, ResponsivePosterImage>> => {
      const rows = await fetchVariantsBatch(uniqueIds);

      const byId: Record<string, Partial<Record<`${Variant}_${Format}` | Variant, string>>> = {};
      for (const row of rows) {
        const id = String(row.source_id ?? "");
        const variant = String(row.variant ?? "") as `${Variant}_${Format}` | Variant;
        const url = String(row.url ?? "");
        if (!id || !url) continue;
        byId[id] = byId[id] ?? {};
        byId[id][variant] = url;
      }

      const out: Record<string, ResponsivePosterImage> = {};
      for (const id of uniqueIds) {
        const found = byId[id];
        if (!found) continue;
        const src =
          found.medium_webp ??
          found.medium_avif ??
          found.medium ??
          found.small_webp ??
          found.small_avif ??
          found.small ??
          found.thumb_webp ??
          found.thumb_avif ??
          found.thumb;
        if (!src) continue;
        const avifSrcSet = VARIANTS.map((v) =>
          found[`${v}_avif`] ? `${found[`${v}_avif`]} ${WIDTHS[v]}w` : "",
        )
          .filter(Boolean)
          .join(", ");
        const webpSrcSet = VARIANTS.map((v) =>
          (found[`${v}_webp`] ?? found[v]) ? `${found[`${v}_webp`] ?? found[v]} ${WIDTHS[v]}w` : "",
        )
          .filter(Boolean)
          .join(", ");
        out[id] = {
          src,
          avifSrcSet: avifSrcSet || undefined,
          webpSrcSet: webpSrcSet || undefined,
          sizes,
        };
      }
      return out;
    },
  });
  return data;
}

/**
 * Accumulates variant image data across renders so that existing products
 * keep their resolved URLs stable. Only fetches variants for NEW poster IDs.
 *
 * Uses a `requestedRef` Set to track which IDs have been dispatched for
 * fetching. This prevents query key churn: `newIds` is computed from IDs that
 * have never been requested rather than from what `allImages` currently holds,
 * so an in-flight query is never orphaned by a concurrent `allImages` update.
 */
export function useAccumulatedResponsiveImages(
  ids: string[],
  sizes = "(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 16vw",
): Record<string, ResponsivePosterImage> {
  const uniqueIds = useMemo(() => Array.from(new Set(ids.filter(Boolean))), [ids]);
  const [allImages, setAllImages] = useState<Record<string, ResponsivePosterImage>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const stableSizes = useMemo(() => sizes, [sizes]);

  const newIds = useMemo(() => {
    const requested = requestedRef.current;
    return uniqueIds.filter((id) => !requested.has(id));
  }, [uniqueIds]);

  if (newIds.length > 0) {
    for (const id of newIds) requestedRef.current.add(id);
  }

  const newData = usePosterResponsiveImages(newIds, stableSizes);

  useEffect(() => {
    if (Object.keys(newData).length === 0) return;
    setAllImages((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, val] of Object.entries(newData)) {
        if (!next[id] || next[id].src !== val.src) {
          next[id] = val;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [newData]);

  return useMemo(() => {
    const result: Record<string, ResponsivePosterImage> = {};
    for (const id of uniqueIds) {
      if (allImages[id]) result[id] = allImages[id];
    }
    return result;
  }, [uniqueIds, allImages]);
}
