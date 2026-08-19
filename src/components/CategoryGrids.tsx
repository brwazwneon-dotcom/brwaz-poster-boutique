import {
  descendantIds,
  isCategoryVisible,
  useCategories,
  type Category,
} from "@/lib/use-categories";
import { FramePreview } from "@/components/FramePreview";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_RAIL_IMAGES = 10;
const MAX_VALIDATION_ATTEMPTS_PER_RAIL = 36;
const MOCKUP_SOURCE_RE =
  /(?:\/assets\/mockups\/|mockup|room[-_ ]?mockup|wall[-_ ]?mockup|white[-_ ]?(?:wall|background)|lifestyle|composite|generated[-_ ]?preview|product[-_ ]?card|screenshot|framed[-_ ]?preview|frame-(?:black|white|wood)|black[-_ ]?frame|drop[-_ ]?shadow)/i;
const IMAGE_VARIANTS = [
  "medium_avif",
  "medium_webp",
  "medium",
  "small_avif",
  "small_webp",
  "small",
  "thumb_avif",
  "thumb_webp",
  "thumb",
  "large_avif",
  "large_webp",
  "large",
];

type ShowcaseSettings = {
  category_id: string;
  selection_mode?: "auto" | "manual";
  section_enabled?: boolean;
  view_all_enabled?: boolean;
};

type ShowcaseImage = {
  id: string;
  category_id: string;
  source_type: "upload" | "product";
  poster_id: string | null;
  image_url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  enabled: boolean;
};

type ProductRow = {
  id: string;
  title: string;
  category_id: string | null;
  image_url: string | null;
  original_url: string | null;
  orientation: string | null;
  featured: boolean | null;
  is_best_seller: boolean | null;
  pinned: boolean | null;
  views_count: number | null;
  cart_adds_count: number | null;
  sales_count: number | null;
  created_at: string | null;
};

type VariantRow = {
  source_id: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  variant: string;
  original_path: string | null;
  bucket: string | null;
};

type RailImage = {
  id: string;
  posterId: string | null;
  title: string;
  url: string;
  width: number;
  height: number;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sourceField: string;
};

type CollectionRail = {
  category: Category;
  title: string;
  subtitle?: string | null;
  viewAllEnabled: boolean;
  images: RailImage[];
};

function isValidImageUrl(url: string | null | undefined) {
  const value = String(url ?? "").trim();
  if (!value || value.startsWith("data:")) return false;
  const lower = value.toLowerCase();
  return (
    !lower.includes("placeholder") &&
    !lower.includes("deleted") &&
    !lower.includes("null") &&
    !lower.includes("undefined")
  );
}

function imageUrl(raw: string | null | undefined) {
  const url = String(raw ?? "").trim();
  if (!isValidImageUrl(url)) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  return `/${url.replace(/^\/+/, "")}`;
}

function isUsableCategoryGridArtworkUrl(url: string) {
  return isValidImageUrl(url) && !MOCKUP_SOURCE_RE.test(url);
}

function stripExtension(path: string) {
  return path.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

function storagePathFromUrl(url: string, bucket: string) {
  const match = url.match(
    new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`),
  );
  return match ? decodeURIComponent(match[1]) : "";
}

function artworkPathKeys(url: string) {
  return [storagePathFromUrl(url, "posters-originals"), storagePathFromUrl(url, "posters")]
    .filter(Boolean)
    .map(stripExtension);
}

function isVariantFromArtworkPath(variant: VariantRow, pathKeys: string[]) {
  if (!variant.original_path || pathKeys.length === 0) return false;
  return pathKeys.includes(stripExtension(variant.original_path));
}

function isPortraitDimensions(width?: number | null, height?: number | null) {
  if (!width || !height) return true;
  if (width && height && width > height) return false;
  return true;
}

type ArtworkCandidate = {
  url: string;
  validationUrl: string;
  width?: number | null;
  height?: number | null;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sourceField: string;
};

type ArtworkValidation = {
  ok: boolean;
  width?: number;
  height?: number;
};

async function validateArtworkCanvas(url: string): Promise<ArtworkValidation> {
  if (typeof window === "undefined" || typeof Image === "undefined") return { ok: true };

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";

  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("image validation timeout")), 1500);
    img.onload = () => {
      window.clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("image validation failed"));
    };
  });

  img.src = url;

  try {
    const source = await loaded;
    const width = source.naturalWidth;
    const height = source.naturalHeight;
    if (!isPortraitDimensions(width, height)) return { ok: false, width, height };

    const canvas = document.createElement("canvas");
    const size = 56;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: true, width, height };
    ctx.drawImage(source, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;

    let border = 0;
    let borderNeutral = 0;
    let borderDark = 0;
    let center = 0;
    let centerNeutral = 0;
    let centerDark = 0;
    const edge = 6;
    const centerStart = 16;
    const centerEnd = size - centerStart;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        const saturation = max === 0 ? 0 : (max - min) / max;
        const neutral = brightness > 170 && saturation < 0.16;
        const dark = brightness < 38;
        const isBorder = x < edge || y < edge || x >= size - edge || y >= size - edge;
        const isCenter = x >= centerStart && x < centerEnd && y >= centerStart && y < centerEnd;

        if (isBorder) {
          border += 1;
          if (neutral) borderNeutral += 1;
          if (dark) borderDark += 1;
        }
        if (isCenter) {
          center += 1;
          if (neutral) centerNeutral += 1;
          if (dark) centerDark += 1;
        }
      }
    }

    const borderNeutralRatio = borderNeutral / Math.max(1, border);
    const centerNeutralRatio = centerNeutral / Math.max(1, center);
    const borderDarkRatio = borderDark / Math.max(1, border);
    const centerDarkRatio = centerDark / Math.max(1, center);
    const hasWallLikeMargin = borderNeutralRatio > 0.72 && centerNeutralRatio < 0.58;
    const hasFrameLikeBorder = borderDarkRatio > 0.82 && centerDarkRatio < 0.62;

    return { ok: !hasWallLikeMargin && !hasFrameLikeBorder, width, height };
  } catch {
    return { ok: true };
  }
}

function variantRank(variant: string) {
  const rank = IMAGE_VARIANTS.indexOf(variant);
  return rank === -1 ? 999 : rank;
}

function productScore(product: ProductRow) {
  const createdAt = product.created_at ? new Date(product.created_at).getTime() : 0;
  const ageDays = createdAt ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : 3650;
  return (
    (product.featured ? 1_000_000 : 0) +
    (product.is_best_seller ? 500_000 : 0) +
    (product.pinned ? 250_000 : 0) +
    (product.sales_count ?? 0) * 1_000 +
    (product.cart_adds_count ?? 0) * 100 +
    (product.views_count ?? 0) +
    Math.max(0, 120 - ageDays)
  );
}

function buildVariantMap(rows: VariantRow[]) {
  const map = new Map<
    string,
    {
      rows: VariantRow[];
    }
  >();

  for (const row of rows) {
    const posterId = String(row.source_id ?? "");
    const url = imageUrl(row.url);
    if (!posterId || !url) continue;

    const current = map.get(posterId) ?? { rows: [] };
    current.rows.push(row);
    map.set(posterId, current);
  }

  return map;
}

function variantSrcSets(variants: VariantRow[], pathKeys: string[]) {
  const avif = variants
    .filter(
      (variant) => variant.variant.includes("avif") && isVariantFromArtworkPath(variant, pathKeys),
    )
    .sort((a, b) => variantRank(a.variant) - variantRank(b.variant))
    .map((variant) => {
      const url = imageUrl(variant.url);
      if (!url) return "";
      return variant.width ? `${url} ${variant.width}w` : url;
    })
    .filter(Boolean);
  const webp = variants
    .filter(
      (variant) => variant.variant.includes("webp") && isVariantFromArtworkPath(variant, pathKeys),
    )
    .sort((a, b) => variantRank(a.variant) - variantRank(b.variant))
    .map((variant) => {
      const url = imageUrl(variant.url);
      if (!url) return "";
      return variant.width ? `${url} ${variant.width}w` : url;
    })
    .filter(Boolean);

  return {
    avifSrcSet: avif.length ? avif.join(", ") : undefined,
    webpSrcSet: webp.length ? webp.join(", ") : undefined,
  };
}

function cleanVariantCandidate(
  variants: VariantRow[],
  pathKeys: string[],
): ArtworkCandidate | null {
  const row = variants
    .filter((variant) => isVariantFromArtworkPath(variant, pathKeys))
    .filter((variant) => isPortraitDimensions(variant.width, variant.height))
    .sort((a, b) => variantRank(a.variant) - variantRank(b.variant))[0];
  const url = imageUrl(row?.url);
  if (!row || !url || !isUsableCategoryGridArtworkUrl(url)) return null;

  return {
    url,
    validationUrl: url,
    width: row.width,
    height: row.height,
    sourceField: `clean_variant:${row.variant}`,
    ...variantSrcSets(variants, pathKeys),
  };
}

function directArtworkCandidate(
  sourceField: string,
  url: string,
  variants: VariantRow[],
): ArtworkCandidate | null {
  if (!isUsableCategoryGridArtworkUrl(url)) return null;
  const pathKeys = artworkPathKeys(url);
  const matchingVariants = variants.filter((variant) =>
    isVariantFromArtworkPath(variant, pathKeys),
  );
  const validationVariant = cleanVariantCandidate(matchingVariants, pathKeys);
  const dimensions = matchingVariants
    .filter((variant) => isPortraitDimensions(variant.width, variant.height))
    .sort((a, b) => variantRank(a.variant) - variantRank(b.variant))[0];

  return {
    url,
    validationUrl: sourceField === "original_url" ? url : (validationVariant?.url ?? url),
    width: dimensions?.width,
    height: dimensions?.height,
    sourceField,
    ...variantSrcSets(matchingVariants, pathKeys),
  };
}

async function resolveCategoryGridArtwork(
  product: ProductRow,
  variants: ReturnType<typeof buildVariantMap>,
  validationCache: Map<string, Promise<ArtworkValidation>>,
): Promise<RailImage | null> {
  if (String(product.orientation ?? "").toLowerCase() === "landscape") return null;

  const variantRows = variants.get(product.id)?.rows ?? [];
  const productUrl = imageUrl(product.image_url);
  const productPathKeys = artworkPathKeys(productUrl);
  const candidates = [
    cleanVariantCandidate(variantRows, productPathKeys),
    directArtworkCandidate("image_url", productUrl, variantRows),
  ].filter((candidate): candidate is ArtworkCandidate => !!candidate);

  for (const candidate of candidates) {
    if (!isPortraitDimensions(candidate.width, candidate.height)) continue;

    const validation =
      candidate.validationUrl === candidate.url
        ? Promise.resolve<ArtworkValidation>({ ok: true })
        : (validationCache.get(candidate.validationUrl) ??
          validateArtworkCanvas(candidate.validationUrl));
    validationCache.set(candidate.validationUrl, validation);
    const result = await validation;
    if (!result.ok || !isPortraitDimensions(result.width, result.height)) continue;

    return {
      id: product.id,
      posterId: product.id,
      title: product.title,
      url: candidate.url,
      width: candidate.width ?? result.width ?? 480,
      height: candidate.height ?? result.height ?? 640,
      avifSrcSet: candidate.avifSrcSet,
      webpSrcSet: candidate.webpSrcSet,
      sourceField: candidate.sourceField,
    };
  }

  return null;
}

function CategoryGridCard({ image, index }: { image: RailImage; index: number }) {
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden" dir="ltr">
      <FramePreview
        posterUrl={image.url}
        avifSrcSet={image.avifSrcSet}
        webpSrcSet={image.webpSrcSet}
        title={image.title}
        color="black"
        loading={index < 4 ? "eager" : "lazy"}
        fetchPriority={index < 4 ? "high" : undefined}
        aspectClassName="aspect-[2/3]"
        className="h-full w-full"
      />
    </div>
  );
}

async function fetchCollectionRails(
  categories: Category[],
  isArabic: boolean,
): Promise<CollectionRail[]> {
  const rootCategories = categories
    .filter(
      (category) =>
        !category.parent_id &&
        isCategoryVisible(category) &&
        (category.show_in_collections ?? true),
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (rootCategories.length === 0) return [];

  const categoryIds = rootCategories.map((category) => category.id);
  const categoryDescendants = new Map(
    rootCategories.map((category) => [category.id, descendantIds(categories, category.id)]),
  );
  const allProductCategoryIds = Array.from(
    new Set(Array.from(categoryDescendants.values()).flat()),
  );

  const [settingsRes, selectedRes, productsRes] = await Promise.all([
    supabase.from("collection_showcase_settings").select("*").in("category_id", categoryIds),
    supabase
      .from("collection_showcase_images")
      .select("*")
      .in("category_id", categoryIds)
      .eq("enabled", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("posters")
      .select(
        "id,title,category_id,image_url,original_url,orientation,featured,is_best_seller,pinned,views_count,cart_adds_count,sales_count,created_at",
      )
      .in("category_id", allProductCategoryIds)
      .eq("hidden", false)
      .limit(2500),
  ]);

  if (productsRes.error) throw productsRes.error;

  const settingsRows = settingsRes.error ? [] : (settingsRes.data ?? []);
  const selectedRows = selectedRes.error ? [] : (selectedRes.data ?? []);

  const products = ((productsRes.data ?? []) as ProductRow[]).filter((product) =>
    isValidImageUrl(product.image_url),
  );
  const productIds = products.map((product) => product.id);
  const variants: VariantRow[] = [];
  for (let i = 0; i < productIds.length; i += 80) {
    const ids = productIds.slice(i, i + 80);
    const { data, error } = await supabase
      .from("image_variants")
      .select("source_id,url,width,height,variant,original_path,bucket")
      .eq("source_table", "posters")
      .eq("status", "done")
      .in("source_id", ids)
      .in("variant", IMAGE_VARIANTS);
    if (error) throw error;
    variants.push(...((data ?? []) as VariantRow[]));
  }

  const variantsByProduct = buildVariantMap(variants);
  const productById = new Map(products.map((product) => [product.id, product]));
  const selectedByCategory = new Map<string, ShowcaseImage[]>();
  for (const image of selectedRows as ShowcaseImage[]) {
    if (!selectedByCategory.has(image.category_id)) selectedByCategory.set(image.category_id, []);
    selectedByCategory.get(image.category_id)!.push(image);
  }
  const settingsByCategory = new Map(
    (settingsRows as ShowcaseSettings[]).map((settings) => [settings.category_id, settings]),
  );
  const validationCache = new Map<string, Promise<ArtworkValidation>>();

  const rails: CollectionRail[] = [];
  for (const category of rootCategories) {
    const settings = settingsByCategory.get(category.id);
    if (settings?.section_enabled === false) continue;

    const allowedCategoryIds = new Set(categoryDescendants.get(category.id) ?? [category.id]);
    const collectionProducts = products
      .filter((product) => !!product.category_id && allowedCategoryIds.has(product.category_id))
      .sort((a, b) => productScore(b) - productScore(a));
    const selectedImages: RailImage[] = [];

    for (const image of selectedByCategory.get(category.id) ?? []) {
      if (!image.poster_id) continue;
      const product = productById.get(image.poster_id);
      if (!product?.category_id || !allowedCategoryIds.has(product.category_id)) continue;
      const resolved = await resolveCategoryGridArtwork(
        product,
        variantsByProduct,
        validationCache,
      );
      if (resolved) selectedImages.push(resolved);
      if (selectedImages.length >= MAX_RAIL_IMAGES) break;
    }

    const usedProductIds = new Set(selectedImages.map((image) => image.posterId).filter(Boolean));
    const autoImages: RailImage[] = [];
    let attempts = 0;
    for (const product of collectionProducts) {
      if (usedProductIds.has(product.id)) continue;
      attempts += 1;
      if (attempts > MAX_VALIDATION_ATTEMPTS_PER_RAIL) break;
      const resolved = await resolveCategoryGridArtwork(
        product,
        variantsByProduct,
        validationCache,
      );
      if (!resolved) continue;
      autoImages.push(resolved);
      if (selectedImages.length + autoImages.length >= MAX_RAIL_IMAGES) break;
    }

    const images = [...selectedImages, ...autoImages].slice(0, MAX_RAIL_IMAGES);
    if (images.length === 0) continue;

    rails.push({
      category,
      title: isArabic ? category.name_ar || category.name : category.name,
      subtitle: category.description,
      viewAllEnabled: settings?.view_all_enabled !== false,
      images,
    });
  }

  return rails;
}

function useCollectionRails(categories: Category[], isArabic: boolean) {
  const key = categories.map((category) => `${category.id}:${category.sort_order}`).join("|");
  return useQuery({
    queryKey: ["home-category-collection-rails", "raw-artwork-v3", key, isArabic ? "ar" : "en"],
    enabled: categories.length > 0,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: () => fetchCollectionRails(categories, isArabic),
  });
}

function CollectionRailSection({ rail, isArabic }: { rail: CollectionRail; isArabic: boolean }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);
  const collectionLink = `/category/${rail.category.slug}`;

  const updateScrollState = () => {
    const el = rowRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const current = Math.abs(el.scrollLeft);
    setCanScrollStart(current > 4);
    setCanScrollEnd(current < max - 4);
  };

  const scrollByGroup = (direction: -1 | 1) => {
    const el = rowRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>("[data-collection-rail-image]");
    const amount = firstCard ? firstCard.offsetWidth * 3 : el.clientWidth * 0.8;
    el.scrollBy({ left: amount * direction * (isArabic ? -1 : 1), behavior: "smooth" });
  };

  return (
    <section
      className="border-b border-border/70 py-8 last:border-b-0 sm:py-10"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/category/$slug"
            params={{ slug: rail.category.slug }}
            className="group inline-block"
          >
            <h3 className="text-display text-3xl font-semibold tracking-tight text-foreground transition group-hover:text-primary sm:text-4xl">
              {rail.title}
            </h3>
          </Link>
          {rail.subtitle && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {rail.subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rail.viewAllEnabled && (
            <Link
              to="/category/$slug"
              params={{ slug: rail.category.slug }}
              className="inline-flex min-h-11 items-center rounded-sm border border-border bg-background px-4 py-2 text-xs font-semibold uppercase tracking-widest text-foreground transition hover:border-foreground hover:bg-foreground hover:text-background"
            >
              {isArabic ? "عرض الكل" : "View All"}
            </Link>
          )}
          <div className="hidden items-center gap-1 md:flex" aria-hidden="true">
            <button
              type="button"
              onClick={() => scrollByGroup(-1)}
              disabled={!canScrollStart}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:border-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              {isArabic ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => scrollByGroup(1)}
              disabled={!canScrollEnd}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:border-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              {isArabic ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={rowRef}
        className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [overscroll-behavior-inline:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4"
        onScroll={updateScrollState}
        onMouseEnter={updateScrollState}
        onTouchStart={updateScrollState}
        dir={isArabic ? "rtl" : "ltr"}
        style={{ scrollPaddingInline: 0 }}
      >
        {rail.images.map((image, index) => (
          <Link
            key={`${image.id}-${index}`}
            to="/category/$slug"
            params={{ slug: rail.category.slug }}
            data-collection-rail-image="true"
            data-category-grid-source-field={image.sourceField}
            data-category-grid-source-url={image.url}
            className="group block min-w-0 basis-[42%] shrink-0 snap-start sm:basis-[30%] md:basis-[22%] lg:basis-[16%] xl:basis-[13%]"
            aria-label={`${rail.title} - ${image.title}`}
          >
            <CategoryGridCard image={image} index={index} />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CategoryGrids(_: { title?: string; subtitle?: string; itemsCount?: number }) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language.startsWith("ar");
  const { data: categories = [] } = useCategories();
  const { data: rails = [] } = useCollectionRails(categories, isArabic);

  if (rails.length === 0) return null;

  return (
    <section data-home-category-grid="true" className="border-t border-border bg-background">
      <div className="container-page py-10 sm:py-14">
        {rails.map((rail) => (
          <CollectionRailSection key={rail.category.id} rail={rail} isArabic={isArabic} />
        ))}
      </div>
    </section>
  );
}
