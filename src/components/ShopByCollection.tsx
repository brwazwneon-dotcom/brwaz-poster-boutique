import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCategories,
  isCategoryVisible,
  descendantIds,
  type Category,
} from "@/lib/use-categories";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { FramePreview } from "@/components/FramePreview";

export type CoverSource = { key: string; categoryId: string };
type ShowcaseSettings = {
  category_id: string;
  selection_mode: "auto" | "manual";
  rotation_enabled: boolean;
  display_mode: "sequential" | "random" | "shuffle_refresh";
  rotation_speed_ms: number;
  transition_type: "fade" | "cross_fade" | "zoom" | "slide_left" | "slide_right" | "scale_fade";
  pause_on_hover: boolean;
  loop_enabled: boolean;
  mockup_style: "black" | "white" | "random" | "global";
};
type ShowcaseImage = {
  id: string;
  category_id: string;
  source_type: "product" | "upload";
  poster_id: string | null;
  image_url: string;
  width: number | null;
  height: number | null;
  sort_order: number;
  enabled: boolean;
};
export type ShowcaseCover = { settings: ShowcaseSettings; images: ShowcaseImage[] };
type ShowcaseFallbackReason =
  | "NO_MATCHED_PRODUCTS"
  | "NO_VALID_IMAGE_URLS"
  | "COLLECTION_RELATIONSHIP_MISSING"
  | "QUERY_FAILED"
  | "IMAGE_LOAD_FAILED"
  | "SPECIAL_DEDICATED_VISUAL";
type ShowcaseAudit = {
  collectionId: string;
  slug: string;
  name: string;
  matchedProductCount: number;
  relationship: string;
  resolvedImageCount: number;
  selectedProductIds: string;
  selectedImageUrls: string;
  fallbackReason: ShowcaseFallbackReason | "";
};
type ShowcaseProduct = {
  id: string;
  title: string;
  category_id: string | null;
  image_url: string | null;
  featured: boolean | null;
  is_best_seller: boolean | null;
  pinned: boolean | null;
  views_count: number | null;
  cart_adds_count: number | null;
  sales_count: number | null;
  created_at: string | null;
};
type CollectionProductMatch = {
  products: ShowcaseProduct[];
  relationship: string;
  fallbackReason?: ShowcaseFallbackReason;
};
type DbError = { code?: string; message: string };
type DbResult<T> = { data: T | null; error: DbError | null };
type DbQuery<T> = PromiseLike<DbResult<T>> & {
  select(columns?: string): DbQuery<T>;
  in(column: string, values: readonly string[]): DbQuery<T>;
  eq(column: string, value: string | number | boolean | null): DbQuery<T>;
  order(column: string, options?: { ascending?: boolean }): DbQuery<T>;
};
type ShowcaseDb = { from<T>(table: string): DbQuery<T> };

function isValidImageUrl(url: string) {
  if (!url || url.startsWith("data:")) return false;
  const lower = url.toLowerCase();
  return (
    !lower.includes("placeholder") &&
    !lower.includes("deleted") &&
    !lower.includes("null") &&
    !lower.includes("undefined")
  );
}

function normalizeSlug(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeImageUrl(raw: unknown) {
  const url = String(raw ?? "").trim();
  if (!isValidImageUrl(url)) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  return `/${url.replace(/^\/+/, "")}`;
}

function db() {
  return supabase as unknown as ShowcaseDb;
}

const DEFAULT_SHOWCASE_SETTINGS = (categoryId: string): ShowcaseSettings => ({
  category_id: categoryId,
  selection_mode: "auto",
  rotation_enabled: true,
  display_mode: "sequential",
  rotation_speed_ms: 6000,
  transition_type: "cross_fade",
  pause_on_hover: true,
  loop_enabled: true,
  mockup_style: "black",
});

function rankingScore(poster: {
  featured: boolean | null;
  is_best_seller: boolean | null;
  pinned: boolean | null;
  views_count: number | null;
  cart_adds_count: number | null;
  sales_count: number | null;
  created_at: string | null;
}) {
  const createdAt = poster.created_at ? new Date(poster.created_at).getTime() : 0;
  const ageDays = createdAt ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : 3650;
  return (
    (poster.featured ? 1_000_000 : 0) +
    (poster.is_best_seller ? 500_000 : 0) +
    (poster.pinned ? 250_000 : 0) +
    (poster.sales_count ?? 0) * 1_000 +
    (poster.cart_adds_count ?? 0) * 100 +
    (poster.views_count ?? 0) +
    Math.max(0, 90 - ageDays)
  );
}

function bestVariants(
  rows: Array<{
    source_id: string | null;
    url: string | null;
    width: number | null;
    height: number | null;
    variant: string;
  }>,
) {
  const priority: Record<string, number> = {
    thumb_avif: 0,
    thumb_webp: 1,
    thumb: 2,
    small_avif: 3,
    small_webp: 4,
    small: 5,
    medium_avif: 6,
    medium_webp: 7,
    medium: 8,
  };
  const best = new Map<
    string,
    { url: string; width: number | null; height: number | null; rank: number }
  >();
  for (const row of rows) {
    const id = String(row.source_id ?? "");
    const url = String(row.url ?? "");
    const rank = priority[row.variant] ?? 99;
    const resolvedUrl = normalizeImageUrl(url);
    if (!id || !resolvedUrl || (best.get(id)?.rank ?? 100) <= rank) continue;
    best.set(id, { url: resolvedUrl, width: row.width, height: row.height, rank });
  }
  return best;
}

const SHOWCASE_VARIANTS = [
  "thumb_avif",
  "thumb_webp",
  "thumb",
  "small_avif",
  "small_webp",
  "small",
  "medium_avif",
  "medium_webp",
  "medium",
];

async function fetchBestVariantsForPosters(posterIds: string[]) {
  const rows: Array<{
    source_id: string | null;
    url: string | null;
    width: number | null;
    height: number | null;
    variant: string;
  }> = [];
  const uniqueIds = Array.from(new Set(posterIds.filter(Boolean)));
  for (let i = 0; i < uniqueIds.length; i += 80) {
    const ids = uniqueIds.slice(i, i + 80);
    const { data, error } = await supabase
      .from("image_variants")
      .select("source_id,url,width,height,variant")
      .eq("source_table", "posters")
      .eq("status", "done")
      .in("source_id", ids)
      .in("variant", SHOWCASE_VARIANTS);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return bestVariants(rows);
}

function getProductsForCollection(
  collection: Category,
  categories: Category[],
  products: ShowcaseProduct[],
): CollectionProductMatch {
  if (!collection.id) {
    return {
      products: [],
      relationship: "none",
      fallbackReason: "COLLECTION_RELATIONSHIP_MISSING",
    };
  }
  const categoryIds = new Set(descendantIds(categories, collection.id));
  const byCategoryHierarchy = products.filter(
    (product) => !!product.category_id && categoryIds.has(product.category_id),
  );
  if (byCategoryHierarchy.length > 0) {
    return {
      products: byCategoryHierarchy,
      relationship:
        categoryIds.size > 1
          ? "posters.category_id IN category+descendants"
          : "posters.category_id",
    };
  }

  return {
    products: [],
    relationship: "posters.category_id",
    fallbackReason: "NO_MATCHED_PRODUCTS",
  };
}

function resolveProductDisplayImage(
  product: ShowcaseProduct,
  variants: Map<string, { url: string; width: number | null; height: number | null; rank: number }>,
) {
  const optimized = variants.get(product.id);
  if (optimized?.url) return optimized;
  const fallback = normalizeImageUrl(product.image_url);
  return fallback ? { url: fallback, width: null, height: null, rank: 99 } : null;
}

function selectShowcaseProducts(products: ShowcaseProduct[]) {
  const seen = new Set<string>();
  return [...products]
    .sort((a, b) => rankingScore(b) - rankingScore(a))
    .filter((product) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    })
    .slice(0, 5);
}

async function fetchVisibleProductsForCategories(categoryIds: string[]) {
  const products: ShowcaseProduct[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select(
        "id,title,category_id,image_url,featured,is_best_seller,pinned,views_count,cart_adds_count,sales_count,created_at",
      )
      .in("category_id", categoryIds)
      .eq("hidden", false)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as ShowcaseProduct[];
    products.push(...rows);
    if (rows.length < pageSize) break;
  }
  return products;
}

export function findCategoryForCard(card: CollectionCard, categories: Category[]) {
  const idMatch = categories.find(
    (category) => isCategoryVisible(category) && category.id === card.id,
  );
  if (idMatch) return idMatch;

  const linkSlug = extractCategorySlug(card.link);
  if (!linkSlug) return null;
  return (
    categories.find((category) => isCategoryVisible(category) && category.slug === linkSlug) ?? null
  );
}

export function isSpecialDedicatedCard(card: CollectionCard, category?: Category | null) {
  const slug = normalizeSlug(extractCategorySlug(card.link) ?? category?.slug ?? card.id);
  return slug === "custom" || slug === "custom-design" || slug === "photo-printing";
}

export function resolveCoverSource(card: CollectionCard, categories: Category[]): CoverSource | null {
  const category = findCategoryForCard(card, categories);
  return category ? { key: category.id, categoryId: category.id } : null;
}

export function useCollectionShowcases(
  sources: CoverSource[],
  categories: Category[],
  cards: CollectionCard[],
) {
  const sourceByCategoryId = useMemo(
    () => new Map(sources.map((source) => [source.categoryId, source])),
    [sources],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const cardsByCategoryId = useMemo(() => {
    const map = new Map<string, CollectionCard>();
    for (const card of cards) {
      const category = findCategoryForCard(card, categories);
      if (category) map.set(category.id, card);
    }
    return map;
  }, [cards, categories]);
  const categoryIds = useMemo(() => Array.from(sourceByCategoryId.keys()), [sourceByCategoryId]);
  const key = categoryIds.join("|");
  const query = useQuery({
    queryKey: ["home-collection-showcase", key],
    enabled: categoryIds.length > 0 && categories.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ShowcaseCover>> => {
      const audits: ShowcaseAudit[] = [];
      const [settingsRes, imagesRes] = await Promise.all([
        db()
          .from<ShowcaseSettings[]>("collection_showcase_settings")
          .select("*")
          .in("category_id", categoryIds),
        db()
          .from<ShowcaseImage[]>("collection_showcase_images")
          .select("id,category_id,source_type,poster_id,image_url,width,height,sort_order,enabled")
          .in("category_id", categoryIds)
          .eq("enabled", true)
          .order("sort_order", { ascending: true }),
      ]);
      // Storefront artwork must still auto-select from posters while the optional
      // admin showcase tables have not yet been deployed to this Supabase project.
      const settingsByCategory = new Map<string, ShowcaseSettings>(
        (settingsRes.error ? [] : (settingsRes.data ?? [])).map((row: ShowcaseSettings) => [
          row.category_id,
          row,
        ]),
      );
      const manualImages = (imagesRes.error ? [] : (imagesRes.data ?? [])).filter(
        (image) => image.source_type === "product",
      );
      const manualPosterIds = manualImages
        .filter((image) => image.source_type === "product" && image.poster_id)
        .map((image) => image.poster_id!);
      const manualVariants = manualPosterIds.length
        ? await fetchBestVariantsForPosters(manualPosterIds)
        : new Map<
            string,
            { url: string; width: number | null; height: number | null; rank: number }
          >();
      const manualBest = manualVariants;
      const imagesByCategory = new Map<string, ShowcaseImage[]>();
      for (const image of manualImages) {
        const optimized = image.poster_id ? manualBest.get(image.poster_id) : undefined;
        const resolved = optimized
          ? { ...image, image_url: optimized.url, width: optimized.width, height: optimized.height }
          : image;
        if (!isValidImageUrl(resolved.image_url)) continue;
        if (!imagesByCategory.has(resolved.category_id))
          imagesByCategory.set(resolved.category_id, []);
        imagesByCategory.get(resolved.category_id)!.push(resolved);
      }
      const autoCategoryIds = categoryIds.filter((categoryId) => {
        const settings = settingsByCategory.get(categoryId);
        const manualImagesForCategory = imagesByCategory.get(categoryId) ?? [];
        const card = cardsByCategoryId.get(categoryId);
        if (card && isSpecialDedicatedCard(card, categoryById.get(categoryId))) return false;
        return (
          (settings?.selection_mode ?? "auto") === "auto" || manualImagesForCategory.length === 0
        );
      });
      const autoImagesByCategory = new Map<string, ShowcaseImage[]>();
      if (autoCategoryIds.length > 0) {
        const allRelevantCategoryIds = Array.from(
          new Set(autoCategoryIds.flatMap((categoryId) => descendantIds(categories, categoryId))),
        );
        const posters = allRelevantCategoryIds.length
          ? await fetchVisibleProductsForCategories(allRelevantCategoryIds)
          : [];
        const posterIds = posters.map((poster) => poster.id);
        let bestByPoster = new Map<
          string,
          { url: string; width: number | null; height: number | null; rank: number }
        >();
        if (posterIds.length > 0) {
          bestByPoster = await fetchBestVariantsForPosters(posterIds);
        }
        for (const categoryId of autoCategoryIds) {
          const category = categoryById.get(categoryId);
          if (!category) continue;
          const match = getProductsForCollection(category, categories, posters);
          const selected = selectShowcaseProducts(match.products);
          const usedUrls = new Set<string>();
          const list: ShowcaseImage[] = [];
          for (const poster of selected) {
            const picked = resolveProductDisplayImage(poster, bestByPoster);
            if (!picked?.url || usedUrls.has(picked.url)) continue;
            if (list.length >= 5) break;
            list.push({
              id: poster.id,
              category_id: categoryId,
              source_type: "product",
              poster_id: poster.id,
              image_url: picked.url,
              width: picked?.width ?? null,
              height: picked?.height ?? null,
              sort_order: list.length,
              enabled: true,
            });
            usedUrls.add(picked.url);
          }
          autoImagesByCategory.set(categoryId, list);
          audits.push({
            collectionId: category.id,
            slug: category.slug,
            name: category.name,
            matchedProductCount: match.products.length,
            relationship: match.relationship,
            resolvedImageCount: list.length,
            selectedProductIds: list
              .map((image) => image.poster_id)
              .filter(Boolean)
              .join(", "),
            selectedImageUrls: list.map((image) => image.image_url).join(" | "),
            fallbackReason:
              match.fallbackReason ??
              (match.products.length > 0 && list.length === 0 ? "NO_VALID_IMAGE_URLS" : ""),
          });
        }
      }

      const out: Record<string, ShowcaseCover> = {};
      for (const [categoryId, source] of sourceByCategoryId) {
        const settings =
          settingsByCategory.get(categoryId) ?? DEFAULT_SHOWCASE_SETTINGS(categoryId);
        const manual = imagesByCategory.get(categoryId) ?? [];
        const automatic = autoImagesByCategory.get(categoryId) ?? [];
        const images =
          settings.selection_mode === "manual" && manual.length > 0 ? manual : automatic;
        const category = categoryById.get(categoryId);
        const card = cardsByCategoryId.get(categoryId);
        if (category && !audits.some((audit) => audit.collectionId === categoryId)) {
          audits.push({
            collectionId: category.id,
            slug: category.slug,
            name: category.name,
            matchedProductCount: manual.length,
            relationship: manual.length
              ? "admin manual collection_showcase_images.poster_id"
              : "manual empty -> auto fallback",
            resolvedImageCount: images.length,
            selectedProductIds: images
              .map((image) => image.poster_id)
              .filter(Boolean)
              .join(", "),
            selectedImageUrls: images.map((image) => image.image_url).join(" | "),
            fallbackReason: images.length
              ? ""
              : card && isSpecialDedicatedCard(card, category)
                ? "SPECIAL_DEDICATED_VISUAL"
                : card?.link.startsWith("/category/")
                  ? "NO_MATCHED_PRODUCTS"
                  : "COLLECTION_RELATIONSHIP_MISSING",
          });
        }
        if (images.length === 0) continue;
        out[source.key] = {
          settings,
          images: images.slice(0, 5),
        };
      }
      if (import.meta.env.DEV) {
        if (typeof window !== "undefined") {
          (
            window as unknown as {
              __collectionShowcaseAudit?: ShowcaseAudit[];
            }
          ).__collectionShowcaseAudit = audits;
        }
        console.info("[Collection Showcase] audit");
        console.table(audits);
      }
      return out;
    },
  });
  return { covers: query.data ?? {}, isLoading: query.isLoading };
}

export type CollectionCard = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  enabled?: boolean;
  /** Cover behavior */
  coverMode?: "auto" | "manual" | "selected";
  /** When coverMode = "selected" */
  coverPosterIds?: string[];
  /** Apply grayscale by default (default true) */
  bw?: boolean;
  /** Milliseconds between rotations (default 6000) */
  transitionMs?: number;
  /** 0..1 dark overlay strength (default 0.55) */
  overlayOpacity?: number;
};

const COVER_DEFAULTS = {
  coverMode: "auto" as const,
  coverPosterIds: [] as string[],
  bw: false,
  transitionMs: 6000,
  overlayOpacity: 0.55,
  enabled: true,
};

export const DEFAULT_COLLECTIONS: CollectionCard[] = [];

function extractCategorySlug(link: string): string | null {
  const m = link.match(/^\/category\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function useHomeCollections() {
  return useQuery({
    queryKey: ["home-collections"],
    staleTime: 60_000,
    initialData: { visible: true, cards: DEFAULT_COLLECTIONS },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", ["home_collections", "home_collections_visible"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const raw = map.get("home_collections");
      const visibleRaw = map.get("home_collections_visible");
      const visible = visibleRaw === undefined ? true : !!visibleRaw;
      let cards: CollectionCard[] = DEFAULT_COLLECTIONS;
      if (Array.isArray(raw) && raw.length > 0) {
        cards = (raw as CollectionCard[]).map((c, i) => ({
          id: c.id ?? String(i),
          title: c.title ?? "",
          subtitle: c.subtitle ?? "",
          image: c.image ?? "",
          link: c.link ?? "/",
          enabled: c.enabled !== false,
          coverMode: c.coverMode ?? "auto",
          coverPosterIds: Array.isArray(c.coverPosterIds) ? c.coverPosterIds : [],
          bw: c.bw === true,
          transitionMs: typeof c.transitionMs === "number" ? c.transitionMs : 6000,
          overlayOpacity: typeof c.overlayOpacity === "number" ? c.overlayOpacity : 0.55,
        }));
      }
      return { visible, cards };
    },
  });
}

const FALLBACK_THEMES = [
  { from: "#0b3d1f", via: "#065f46", to: "#022c22" },
  { from: "#3b0764", via: "#581c87", to: "#1e1b4b" },
  { from: "#1e1b4b", via: "#312e81", to: "#0f172a" },
  { from: "#7f1d1d", via: "#991b1b", to: "#1e3a8a" },
  { from: "#831843", via: "#9d174d", to: "#1e1b4b" },
  { from: "#0c4a6e", via: "#075985", to: "#0f172a" },
  { from: "#78350f", via: "#92400e", to: "#1c1917" },
  { from: "#134e4a", via: "#115e59", to: "#0c0a09" },
];

function themeForCard(card: CollectionCard) {
  const key = `${card.id}:${card.link}`;
  const hash = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return { ...FALLBACK_THEMES[hash % FALLBACK_THEMES.length], emoji: "★" };
}

/** Tracks whether an element is near the viewport via IntersectionObserver. */
function useInViewport(rootMargin = "200px 0px"): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { setInView(entry.isIntersecting); },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, inView];
}

/**
 * Deterministic shuffle seeded by a numeric seed — produces the same order
 * for the same seed + array, avoiding Math.random during render.
 */
export function seedShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (seed + i * 31) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function CollectionCover({
  card,
  showcase,
  loading,
}: {
  card: CollectionCard;
  showcase?: ShowcaseCover;
  loading: boolean;
}) {
  const perf = usePerformanceFlags();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [paused, setPaused] = useState(false);
  const pausedTimerRef = useRef<number | null>(null);
  const PAUSED_SAFETY_MS = 8000;
  const handlePause = useCallback(() => {
    setPaused(true);
    if (pausedTimerRef.current) window.clearTimeout(pausedTimerRef.current);
    pausedTimerRef.current = window.setTimeout(() => {
      setPaused(false);
      pausedTimerRef.current = null;
    }, PAUSED_SAFETY_MS);
  }, []);
  const handleResume = useCallback(() => {
    setPaused(false);
    if (pausedTimerRef.current) {
      window.clearTimeout(pausedTimerRef.current);
      pausedTimerRef.current = null;
    }
  }, []);

  const [coverRef, inViewport] = useInViewport("200px 0px");
  const [mockupColor, setMockupColor] = useState<"black" | "white">("black");
  const [transitioning, setTransitioning] = useState(false);

  const showcaseImages = useMemo(
    () =>
      (showcase?.images ?? []).filter(
        (image) => isValidImageUrl(image.image_url) && !broken[image.image_url],
      ),
    [showcase?.images, broken],
  );
  const fallbackPrimary =
    !extractCategorySlug(card.link) || isSpecialDedicatedCard(card) ? card.image || "" : "";
  const valid = useMemo(() => {
    if (perf.emergency_fast_mode) return [];
    if (showcaseImages.length > 0) return showcaseImages;
    if (!fallbackPrimary || broken[fallbackPrimary]) return [];
    return [
      {
        id: fallbackPrimary,
        category_id: "",
        source_type: "upload" as const,
        poster_id: null,
        image_url: fallbackPrimary,
        width: null,
        height: null,
        sort_order: 0,
        enabled: true,
      },
    ];
  }, [broken, fallbackPrimary, perf.emergency_fast_mode, showcaseImages]);
  const bw = card.bw === true;
  const overlay = Math.max(0, Math.min(1, card.overlayOpacity ?? 0.55));
  const theme = themeForCard(card);
  const settings = showcase?.settings;
  const shouldRotate = !!settings?.rotation_enabled && valid.length > 1 && inViewport;
  const isPhotoPrinting = card.id === "photo-printing" || normalizeSlug(card.link) === "photo-printing";

  const handleImageError = (url: string) => {
    if (import.meta.env.DEV) {
      console.warn(
        "[Collection Showcase] fallback",
        JSON.stringify({
          collectionId: card.id,
          collectionSlug: extractCategorySlug(card.link),
          collectionName: card.title,
          fallbackReason: "IMAGE_LOAD_FAILED" satisfies ShowcaseFallbackReason,
          imageUrl: url,
        }),
      );
    }
    setBroken((b) => ({ ...b, [url]: true }));
  };

  // --- Shuffled queue ---
  const [queueSeed, setQueueSeed] = useState(0);
  const queue = useMemo(() => {
    if (valid.length < 2) return valid.map((img) => img.image_url);
    return seedShuffle(
      valid.map((img) => img.image_url),
      queueSeed,
    );
  }, [valid, queueSeed]);
  const [queueIndex, setQueueIndex] = useState(0);
  const currentUrl = queue[queueIndex % queue.length] || "";
  const nextUrl = queue.length > 1 ? queue[(queueIndex + 1) % queue.length] : currentUrl;

  // Advance the queue — reshuffle when exhausted, avoiding last image repeated.
  const advanceQueue = useCallback(() => {
    setQueueIndex((prev) => {
      const next = prev + 1;
      if (next >= queue.length) {
        setQueueSeed((s) => s + 1);
        return 0;
      }
      return next;
    });
  }, [queue.length]);

  // Reset queue when pool changes
  useEffect(() => {
    setQueueIndex(0);
    setQueueSeed(0);
    setTransitioning(false);
  }, [showcase?.images, fallbackPrimary]);

  // --- Timer-based rotation with stagger ---
  useEffect(() => {
    if (!shouldRotate || (settings?.pause_on_hover && paused)) return;
    const speed = settings?.rotation_speed_ms ?? 6000;
    const stagger =
      500 + (Array.from(card.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2500);
    let interval: number | undefined;
    const transitionDuration = transitionMs + 100;
    const advance = () => {
      setTransitioning(true);
      window.setTimeout(() => {
        advanceQueue();
        setTransitioning(false);
      }, transitionDuration);
    };
    const timeout = window.setTimeout(() => {
      advance();
      interval = window.setInterval(advance, speed);
    }, stagger);
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [
    card.id,
    shouldRotate,
    paused,
    settings?.pause_on_hover,
    settings?.rotation_enabled,
    settings?.rotation_speed_ms,
    advanceQueue,
  ]);

  useEffect(() => {
    return () => {
      if (pausedTimerRef.current) window.clearTimeout(pausedTimerRef.current);
    };
  }, []);

  // --- Preload next image into memory before it becomes current ---
  const preloaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!nextUrl || nextUrl === currentUrl || preloaded.current.has(nextUrl)) return;
    preloaded.current.add(nextUrl);
    const img = new Image();
    img.decoding = "async";
    img.src = nextUrl;
    if (typeof img.decode === "function") img.decode().catch(() => {});
  }, [nextUrl, currentUrl]);

  // Clear preload cache when pool changes
  useEffect(() => { preloaded.current = new Set(); }, [showcase?.images, fallbackPrimary]);

  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;
  const transitionMs = prefersReducedMotion ? 0 : 500;

  useEffect(() => {
    const style = settings?.mockup_style ?? "black";
    setMockupColor(
      style === "white"
        ? "white"
        : style === "random"
          ? Math.random() < 0.5
            ? "black"
            : "white"
          : "black",
    );
  }, [card.id, settings?.mockup_style]);

  return (
    <>
      {/* Themed fallback gradient — always present so gaps are never blank */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.via}, ${theme.to})` }}
      />

      {/* Framed poster cover — centered inside the card */}
      <div
        ref={coverRef}
        className="absolute inset-0 flex items-center justify-center p-5 sm:p-7"
        onMouseEnter={handlePause}
        onMouseLeave={handleResume}
        onTouchStart={handlePause}
        onTouchEnd={handleResume}
        onTouchCancel={handleResume}
      >
        {isPhotoPrinting && valid.length > 0 ? (
          <div className="relative h-full w-full overflow-hidden">
            <img
              src={currentUrl || fallbackPrimary}
              alt={card.title}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={() => handleImageError(currentUrl)}
            />
          </div>
        ) : (
          <div className="relative mx-auto aspect-[2/3] h-full max-h-full w-auto max-w-full transition-transform duration-700 group-hover:scale-[1.04]">
            {valid.length === 0 && loading ? (
              <div className="h-full w-full animate-pulse rounded-sm bg-muted" />
            ) : valid.length === 0 ? (
              <FramePreview
                posterUrl=""
                title={card.title}
                frameType="pvc"
                color={mockupColor}
                aspectClassName="aspect-[2/3]"
                className="h-full w-full"
                artwork={
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
                  >
                    <span className="text-6xl opacity-60 sm:text-7xl">{theme.emoji}</span>
                  </div>
                }
              />
            ) : (
              <FramePreview
                posterUrl=""
                title={card.title}
                frameType="pvc"
                color={mockupColor}
                aspectClassName="aspect-[2/3]"
                className="h-full w-full"
                artwork={
                  <div className="relative h-full w-full overflow-hidden">
                    <img
                      key={`c-${currentUrl}`}
                      src={currentUrl}
                      alt={card.title}
                      decoding="async"
                      className={`absolute inset-0 z-0 h-full w-full ${bw ? "grayscale" : ""}`}
                      style={{ objectFit: "cover", objectPosition: "center", display: "block" }}
                      onError={() => handleImageError(currentUrl)}
                    />
                    {shouldRotate && nextUrl && nextUrl !== currentUrl && (
                      <img
                        key={`n-${nextUrl}`}
                        src={nextUrl}
                        alt=""
                        aria-hidden={true}
                        decoding="async"
                        className={`absolute inset-0 z-10 h-full w-full ${bw ? "grayscale" : ""}`}
                        style={{
                          objectFit: "cover",
                          objectPosition: "center",
                          display: "block",
                          opacity: transitioning ? 1 : 0,
                          transition: `opacity ${transitionMs}ms ease-in-out`,
                        }}
                        onError={() => handleImageError(nextUrl)}
                      />
                    )}
                  </div>
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Dark overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent transition-opacity duration-500 group-hover:opacity-90"
        style={{ opacity: 0.35 + overlay * 0.65 }}
      />
    </>
  );
}

export function ShopByCollection() {
  const perf = usePerformanceFlags();
  const { data } = useHomeCollections();
  const { data: categories = [] } = useCategories();
  const home = data ?? { visible: false, cards: DEFAULT_COLLECTIONS };
  function dedupKey(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/g, "");
  }
  const baseCards = home.cards.filter((c) => c.enabled !== false);
  const existingSlugs = new Set(
    baseCards.map((c) => extractCategorySlug(c.link)).filter((s): s is string => !!s),
  );
  const existingNames = new Set(baseCards.map((c) => dedupKey(c.title)));
  const autoCards: CollectionCard[] = categories
    .filter(
      (c) =>
        !c.parent_id &&
        isCategoryVisible(c) &&
        (c.show_in_collections ?? true) &&
        !existingSlugs.has(c.slug) &&
        !existingNames.has(dedupKey(c.name)),
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.description ?? "Explore the collection",
      image: c.image ?? "",
      link: `/category/${c.slug}`,
      enabled: true,
      coverMode: c.image ? "manual" : "auto",
      coverPosterIds: [],
      bw: false,
      transitionMs: 6000,
      overlayOpacity: 0.55,
    }));
  const cards = [...baseCards, ...autoCards].slice(0, perf.emergency_fast_mode ? 8 : 16);

  // Category cards use admin showcase selections or automatic products from the same category tree.
  const coverSources = useMemo(
    () =>
      Array.from(
        new Map(
          cards
            .map((card) => resolveCoverSource(card, categories))
            .filter((source): source is CoverSource => !!source)
            .map((source) => [source.key, source]),
        ).values(),
      ),
    [cards, categories],
  );
  const { covers: showcaseBySource, isLoading: showcaseLoading } = useCollectionShowcases(
    coverSources,
    categories,
    cards,
  );
  const showcaseFor = (c: CollectionCard) => {
    const source = resolveCoverSource(c, categories);
    return source ? showcaseBySource[source.key] : undefined;
  };

  if (!home.visible || cards.length === 0) return null;

  return (
    <section className="border-b border-border bg-background">
      <div className="container-page py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              Curated · Collections
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">Shop By Collection</h2>
          </div>
        </div>

        {/* Mobile: swipeable cards. Desktop: grid */}
        <div
          className="-mx-4 flex snap-x snap-mandatory scroll-smooth gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 touch-pan-x  [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4"
          style={{ scrollPaddingInline: "1rem" }}
        >
          {cards.map((c) => (
            <a
              key={c.id}
              href={c.link}
              className="group relative block aspect-[4/5] min-w-[78%] shrink-0 snap-start overflow-hidden rounded-sm border border-border bg-muted sm:min-w-0"
            >
              <CollectionCover
                card={c}
                showcase={showcaseFor(c)}
                loading={showcaseLoading && !!resolveCoverSource(c, categories)}
              />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                <p className="text-[10px] uppercase tracking-[0.4em] text-white/60">{c.subtitle}</p>
                <h3 className="text-display mt-2 text-3xl text-white sm:text-4xl">{c.title}</h3>
                <span className="mt-4 inline-flex rounded-sm border border-white/40 bg-white/0 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur transition group-hover:bg-white group-hover:text-black">
                  Shop now →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
