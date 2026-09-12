import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPosterImagesByIdsPublic } from "@/lib/db-public.functions";

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

// Stable (referentially-identical-across-renders) empty fallbacks for the
// `data = {}` destructuring default below. A fresh `{}` literal there would
// get a NEW object identity on every render while the query is still
// loading (data === undefined), which breaks any useMemo/useEffect that
// takes the returned map as a dependency — the dependency "changes" every
// render, the effect re-runs, and if that effect also calls setState you
// get a render loop (`Maximum update depth exceeded`). See WallOfInspiration
// and HeroBannerSlider fixes from the same audit for a hit of this pattern.
const EMPTY_VARIANT_MAP: VariantMap = {};
const EMPTY_RESPONSIVE_MAP: ResponsiveMap = {};

export function resolveProductArtwork(
  product: { id: string; image_url?: string | null },
  variants?: VariantMap | ResponsiveMap,
): string {
  const v = variants?.[product.id];
  if (typeof v === "string") return v;
  if (v?.src) return v.src;
  return product.image_url ?? "";
}


/**
 * Public storefront image rule: use generated display variants only.
 *
 * TEMPORARY (Phase 1, no image_variants pipeline yet on the new database):
 * returns each poster's plain image_url directly, ignoring variant/format —
 * there is only one image per poster today, uploaded as a URL by the admin.
 * Once Phase 4 adds real AVIF/WebP variant generation, only the queryFn
 * body below needs to change back to a real variant lookup — every caller
 * of this hook stays the same.
 */
export function usePosterImageVariants(
  ids: string[],
  variant: Variant = "thumb",
  format: Format = "webp",
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const key = uniqueIds.join(",");
  const { data = EMPTY_VARIANT_MAP } = useQuery({
    queryKey: ["public-poster-image-variants", variant, format, key],
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Record<string, string>> => {
      return getPosterImagesByIdsPublic({ data: { ids: uniqueIds } });
    },
  });
  return data;
}

export const usePosterThumbs = (ids: string[]) => usePosterImageVariants(ids, "thumb");
export const usePosterSmalls = (ids: string[]) => usePosterImageVariants(ids, "small");
export const usePosterPreviews = (ids: string[]) => usePosterImageVariants(ids, "medium");

/**
 * TEMPORARY (Phase 1, see usePosterImageVariants above): no srcset yet,
 * every poster resolves to a single plain image_url as `src`.
 */
export function usePosterResponsiveImages(
  ids: string[],
  sizes = "(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 16vw",
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const key = uniqueIds.join(",");
  const { data = EMPTY_RESPONSIVE_MAP } = useQuery({
    queryKey: ["public-poster-responsive-images", key, sizes],
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Record<string, ResponsivePosterImage>> => {
      const urls = await getPosterImagesByIdsPublic({ data: { ids: uniqueIds } });
      const out: Record<string, ResponsivePosterImage> = {};
      for (const id of uniqueIds) {
        if (urls[id]) out[id] = { src: urls[id], sizes };
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
