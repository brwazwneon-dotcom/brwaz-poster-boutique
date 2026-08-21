import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Meta / TikTok product catalog feeds.
 *
 * Everything in this module is isomorphic (safe to run on the server inside a
 * route handler AND in the browser admin). It never imports the browser
 * supabase client — callers pass their own client (a server-created one or the
 * browser one).
 */

export const CATALOG_CONFIG_KEY = "catalog_config";
export const CATALOG_BASE_URL = "https://brwazwneon.com";
export const CATALOG_BRAND = "BRWAZWNEON";
/** Meta requires price as "<amount> <ISO-4217 currency>" — the currency is mandatory. */
export const CATALOG_CURRENCY = "EGP";

export type FeedKey = "meta" | "tiktok";

export type CatalogConfig = {
  meta: { enabled: boolean; selected: string[] };
  tiktok: { enabled: boolean; selected: string[] };
};

export const CATALOG_CONFIG_DEFAULTS: CatalogConfig = {
  meta: { enabled: true, selected: [] },
  tiktok: { enabled: true, selected: [] },
};

export function parseCatalogConfig(raw: unknown): CatalogConfig {
  if (!raw || typeof raw !== "object") return CATALOG_CONFIG_DEFAULTS;
  const v = raw as Partial<CatalogConfig>;
  const strArr = (x: unknown) =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  return {
    meta: {
      enabled:
        typeof v.meta?.enabled === "boolean"
          ? v.meta.enabled
          : CATALOG_CONFIG_DEFAULTS.meta.enabled,
      selected: strArr(v.meta?.selected),
    },
    tiktok: {
      enabled:
        typeof v.tiktok?.enabled === "boolean"
          ? v.tiktok.enabled
          : CATALOG_CONFIG_DEFAULTS.tiktok.enabled,
      selected: strArr(v.tiktok?.selected),
    },
  };
}

/* -------------------- Pricing (mirrors the storefront pricing keys) -------------------- */

const CATALOG_PRICING_KEYS = [
  "frame_pvc_20x30",
  "frame_pvc_30x40",
  "frame_pvc_40x50",
  "frame_wood_20x30",
  "frame_wood_30x40",
  "frame_wood_40x50",
  "frame_wood_40x60",
  "frame_wood_50x60",
  "frame_wood_50x70",
  "frame_wood_60x90",
  "frame_wood_100x60",
] as const;

export type CatalogPricing = {
  frame: {
    pvc: Partial<Record<"20x30" | "30x40" | "40x50", number>>;
    wood: Partial<
      Record<"20x30" | "30x40" | "40x50" | "40x60" | "50x60" | "50x70" | "60x90" | "100x60", number>
    >;
  };
};

const CATALOG_PRICE_DEFAULTS: CatalogPricing = {
  frame: {
    pvc: { "20x30": 190, "30x40": 250, "40x50": 350 },
    wood: {
      "20x30": 190,
      "30x40": 270,
      "40x50": 400,
      "40x60": 450,
      "50x60": 500,
      "50x70": 580,
      "60x90": 850,
      "100x60": 950,
    },
  },
};

export function catalogPricingFromRows(
  rows: Array<{ key: string; value: unknown }>,
): CatalogPricing {
  const map = new Map(rows.map((r) => [r.key, r.value as unknown]));
  const num = (k: string, fb: number) => {
    const v = map.get(k);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const d = CATALOG_PRICE_DEFAULTS;
  return {
    frame: {
      pvc: {
        "20x30": num("frame_pvc_20x30", d.frame.pvc["20x30"] ?? 0),
        "30x40": num("frame_pvc_30x40", d.frame.pvc["30x40"] ?? 0),
        "40x50": num("frame_pvc_40x50", d.frame.pvc["40x50"] ?? 0),
      },
      wood: {
        "20x30": num("frame_wood_20x30", d.frame.wood["20x30"] ?? 0),
        "30x40": num("frame_wood_30x40", d.frame.wood["30x40"] ?? 0),
        "40x50": num("frame_wood_40x50", d.frame.wood["40x50"] ?? 0),
        "40x60": num("frame_wood_40x60", d.frame.wood["40x60"] ?? 0),
        "50x60": num("frame_wood_50x60", d.frame.wood["50x60"] ?? 0),
        "50x70": num("frame_wood_50x70", d.frame.wood["50x70"] ?? 0),
        "60x90": num("frame_wood_60x90", d.frame.wood["60x90"] ?? 0),
        "100x60": num("frame_wood_100x60", d.frame.wood["100x60"] ?? 0),
      },
    },
  };
}

/**
 * Catalog price = the storefront price. Posters have an optional explicit
 * `price`; otherwise we use the same standard displayed price the storefront
 * shows on cards (PVC 30×40), falling back to the lowest configured frame
 * price. Never returns null — Meta requires a price on every row.
 */
export function resolveCatalogPrice(pricing: CatalogPricing, productPrice: number | null): number {
  if (typeof productPrice === "number" && Number.isFinite(productPrice) && productPrice > 0) {
    return productPrice;
  }
  const standard = pricing.frame.pvc?.["30x40"];
  if (typeof standard === "number" && Number.isFinite(standard) && standard > 0) return standard;
  const all = [...Object.values(pricing.frame.pvc), ...Object.values(pricing.frame.wood)].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
  return all.length ? Math.min(...all) : 0;
}

/* -------------------- Images -------------------- */

/** True when the value is an absolute, public, HTTPS URL usable in a feed. */
export function isPublicImageUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("data:")) return false;
  if (u.startsWith("blob:")) return false;
  if (u.startsWith("/")) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Image priority per the catalog spec:
 *   1. existing Meta mockup (image_variants tagged `meta*`)
 *   2. product mockup (best public display variant, else posters.image_url)
 *   3. primary image (posters.original_url)
 * The validator deliberately does NOT require a Meta mockup.
 */
export function resolveCatalogImage(
  product: { image_url?: string | null; original_url?: string | null },
  bestVariantUrl: string | undefined,
): string {
  if (isPublicImageUrl(bestVariantUrl)) return bestVariantUrl;
  if (isPublicImageUrl(product.image_url)) return product.image_url;
  if (isPublicImageUrl(product.original_url)) return product.original_url;
  return "";
}

/* -------------------- Eligibility -------------------- */

export type CatalogIssueReason =
  "hidden" | "no_category" | "category_hidden" | "review_draft" | "no_price" | "no_image";

export type CatalogProduct = {
  id: string;
  title: string;
  description: string | null;
  seo_description: string | null;
  slug: string | null;
  category_id: string | null;
  image_url: string | null;
  original_url: string | null;
  price: number | null;
  hidden: boolean;
  review_status: string;
  updated_at: string | null;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  hidden: boolean;
  status: string | null;
};

export type CatalogIssue = { productId: string; title: string; reason: CatalogIssueReason };

/** Returns the blocking reason when a product cannot be exported, else null. */
export function catalogIssueFor(
  p: CatalogProduct,
  data: Pick<CatalogData, "categories" | "pricing" | "variants">,
): CatalogIssueReason | null {
  if (p.hidden) return "hidden";
  if (!p.category_id) return "no_category";
  const cat = data.categories.get(p.category_id);
  if (!cat || cat.hidden || cat.status === "draft") return "category_hidden";
  if (p.review_status === "draft" || p.review_status === "needs_replace") return "review_draft";
  if (resolveCatalogPrice(data.pricing, p.price) <= 0) return "no_price";
  if (!resolveCatalogImage(p, data.variants[p.id])) return "no_image";
  return null;
}

/* -------------------- Per-product diagnostics (Catalog Images) -------------------- */

export type CatalogPriceSource = "poster" | "pvc-30x40-default" | "lowest-configured" | "none";

/** Explains where the price exported for a product comes from. */
export function catalogPriceSource(
  pricing: CatalogPricing,
  productPrice: number | null,
): CatalogPriceSource {
  if (typeof productPrice === "number" && Number.isFinite(productPrice) && productPrice > 0) {
    return "poster";
  }
  const standard = pricing.frame.pvc?.["30x40"];
  if (typeof standard === "number" && Number.isFinite(standard) && standard > 0) {
    return "pvc-30x40-default";
  }
  const all = [...Object.values(pricing.frame.pvc), ...Object.values(pricing.frame.wood)].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
  return all.length ? "lowest-configured" : "none";
}

export type CatalogImageFeedKind =
  "meta-variant" | "product-mockup" | "display-variant" | "primary" | "none";

export type CatalogImageDiagnostics = {
  price: number;
  priceSource: CatalogPriceSource;
  priceMissing: boolean;
  primaryImage: string;
  productMockup: string;
  metaVariant: string;
  displayVariant: string;
  feedImage: string;
  feedImageKind: CatalogImageFeedKind;
  primaryPresent: boolean;
  productMockupPresent: boolean;
  metaVariantPresent: boolean;
  displayVariantPresent: boolean;
  mockupMissing: boolean;
  metaMockupMissing: boolean;
  imageMissing: boolean;
  categoryPresent: boolean;
  categoryName: string;
  issue: CatalogIssueReason | null;
  ready: boolean;
};

/**
 * Everything the "Catalog Images" screen needs to explain the exact image and
 * price that go into the Meta feed for one product — and why anything is
 * missing. Pure function over the same product data the feed uses.
 */
export function catalogImageDiagnostics(
  p: CatalogProduct,
  data: Pick<CatalogData, "categories" | "pricing" | "variants" | "metaVariants">,
): CatalogImageDiagnostics {
  const cat = p.category_id ? data.categories.get(p.category_id) : undefined;
  const categoryPresent = !!cat && !cat.hidden && cat.status !== "draft";
  const primaryPresent = isPublicImageUrl(p.original_url);
  const productMockupPresent = isPublicImageUrl(p.image_url);
  const metaVariantPresent = isPublicImageUrl(data.metaVariants[p.id]);
  const displayVariantPresent = isPublicImageUrl(data.variants[p.id]);

  const price = resolveCatalogPrice(data.pricing, p.price);
  const priceSource = catalogPriceSource(data.pricing, p.price);

  let feedImageKind: CatalogImageFeedKind = "none";
  if (metaVariantPresent) feedImageKind = "meta-variant";
  else if (productMockupPresent) feedImageKind = "product-mockup";
  else if (displayVariantPresent) feedImageKind = "display-variant";
  else if (primaryPresent) feedImageKind = "primary";

  const feedImage = metaVariantPresent
    ? data.metaVariants[p.id]
    : resolveCatalogImage(p, data.variants[p.id]);

  const issue = catalogIssueFor(p, data);

  const mockupMissing = !metaVariantPresent && !productMockupPresent && !displayVariantPresent;

  return {
    price,
    priceSource,
    priceMissing: price <= 0,
    primaryImage: p.original_url ?? "",
    productMockup: p.image_url ?? "",
    metaVariant: metaVariantPresent ? data.metaVariants[p.id] : "",
    displayVariant: displayVariantPresent ? data.variants[p.id] : "",
    feedImage,
    feedImageKind,
    primaryPresent,
    productMockupPresent,
    metaVariantPresent,
    displayVariantPresent,
    mockupMissing,
    metaMockupMissing: !metaVariantPresent,
    imageMissing: !feedImage,
    categoryPresent,
    categoryName: cat?.name ?? "",
    issue,
    ready: !issue && price > 0 && !!feedImage && !mockupMissing,
  };
}

/* -------------------- Feed rows + CSV -------------------- */

export type CatalogFeedRow = {
  id: string;
  title: string;
  description: string;
  availability: "in stock";
  condition: "new";
  price: string;
  link: string;
  image_link: string;
  additional_image_link: string;
  brand: string;
  product_type: string;
};

export function metaRowFor(p: CatalogProduct, data: CatalogData): CatalogFeedRow {
  const cat = p.category_id ? data.categories.get(p.category_id) : undefined;
  const price = resolveCatalogPrice(data.pricing, p.price);
  const image = resolveCatalogImage(p, data.variants[p.id]);
  const additional =
    isPublicImageUrl(p.original_url) && p.original_url !== image ? p.original_url : "";
  return {
    id: p.id,
    title: p.title || p.id,
    description: (p.description || p.seo_description || p.title || "").slice(0, 5000),
    availability: "in stock",
    condition: "new",
    price: `${price.toFixed(2)} ${CATALOG_CURRENCY}`,
    link: cat?.slug ? `${CATALOG_BASE_URL}/category/${cat.slug}` : CATALOG_BASE_URL,
    image_link: image,
    additional_image_link: additional,
    brand: CATALOG_BRAND,
    product_type: cat?.name ?? "",
  };
}

export const META_FEED_HEADER = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "additional_image_link",
  "brand",
  "product_type",
];

export function escapeCsvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildMetaFeedCsv(rows: CatalogFeedRow[]): string {
  const lines = [META_FEED_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.title,
        r.description,
        r.availability,
        r.condition,
        r.price,
        r.link,
        r.image_link,
        r.additional_image_link,
        r.brand,
        r.product_type,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

export function buildMetaRows(
  data: CatalogData,
  selectedIds: Set<string>,
): { rows: CatalogFeedRow[]; issues: CatalogIssue[] } {
  const rows: CatalogFeedRow[] = [];
  const issues: CatalogIssue[] = [];
  for (const p of data.products) {
    const reason = catalogIssueFor(p, data);
    if (reason) {
      issues.push({ productId: p.id, title: p.title, reason });
      continue;
    }
    if (selectedIds.size > 0 && !selectedIds.has(p.id)) continue;
    rows.push(metaRowFor(p, data));
  }
  return { rows, issues };
}

/* -------------------- Data fetching (shared by route + admin) -------------------- */

export type CatalogData = {
  products: CatalogProduct[];
  categories: Map<string, CatalogCategory>;
  pricing: CatalogPricing;
  /** poster id -> best public display URL (Meta mockup preferred, then medium/large). */
  variants: Record<string, string>;
  /** poster id -> best public `meta*` variant URL, when such a variant exists. */
  metaVariants: Record<string, string>;
  /** poster id -> metadata of the best variant, for the image preview modal. */
  variantInfo: Record<
    string,
    { variant: string; width: number | null; height: number | null; format: string | null }
  >;
  config: CatalogConfig;
  /** Total number of products (across all pages) for pagination and stats. */
  totalProducts: number;
};

export const CATALOG_POSTER_COLUMNS =
  "id,title,description,seo_description,slug,category_id,image_url,original_url,price,hidden,review_status,updated_at";

const VARIANT_RANK: Record<string, number> = {
  meta_webp: 0,
  meta_avif: 1,
  meta: 2,
  medium_webp: 10,
  medium_avif: 11,
  medium: 12,
  large_webp: 13,
  large_avif: 14,
  large: 15,
  small_webp: 16,
  small_avif: 17,
  small: 18,
  thumb_webp: 19,
  thumb_avif: 20,
  thumb: 21,
};

async function fetchCatalogVariants(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{
  best: Record<string, string>;
  meta: Record<string, string>;
  bestInfo: Record<
    string,
    { variant: string; width: number | null; height: number | null; format: string | null }
  >;
}> {
  const best: Record<string, { url: string; rank: number }> = {};
  const meta: Record<string, { url: string; rank: number }> = {};
  const bestInfo: Record<
    string,
    { variant: string; width: number | null; height: number | null; format: string | null }
  > = {};
  const setInfo = (
    id: string,
    row: { variant: string; width: number | null; height: number | null; format: string | null },
  ) => {
    bestInfo[id] = {
      variant: row.variant,
      width: row.width != null ? Number(row.width) : null,
      height: row.height != null ? Number(row.height) : null,
      format: row.format != null ? String(row.format) : null,
    };
  };
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    const { data } = await supabase
      .from("image_variants")
      .select("source_id,url,variant,width,height,format")
      .eq("source_table", "posters")
      .eq("status", "done")
      .in("source_id", batch)
      .limit(10000);
    for (const row of data ?? []) {
      const id = String(row.source_id ?? "");
      const url = String(row.url ?? "");
      const variant = String(row.variant ?? "");
      if (!id || !url) continue;
      const rank = VARIANT_RANK[variant] ?? 90;
      if (!best[id] || rank < best[id].rank) {
        best[id] = { url, rank };
        setInfo(id, row);
      }
      if (variant.startsWith("meta") && (!meta[id] || rank < meta[id].rank)) {
        meta[id] = { url, rank };
      }
    }
  }
  const toMap = (src: Record<string, { url: string; rank: number }>) =>
    Object.fromEntries(ids.filter((id) => src[id]).map((id) => [id, src[id].url]));
  return { best: toMap(best), meta: toMap(meta), bestInfo };
}

/** Fetch everything the feed needs. Works with a server or browser supabase client. */
export async function fetchCatalogData(
  supabase: SupabaseClient,
  options: { page?: number; pageSize?: number } = {},
): Promise<CatalogData> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 200;

  const offset = (page - 1) * pageSize;

  const [catsRes, postsRes, pricingRes, cfgRes, countRes] = await Promise.all([
    supabase.from("categories").select("id,name,slug,hidden,status"),
    supabase
      .from("posters")
      .select(CATALOG_POSTER_COLUMNS)
      .range(offset, offset + pageSize - 1),
    supabase.from("site_settings").select("key,value").in("key", CATALOG_PRICING_KEYS),
    supabase.from("site_settings").select("value").eq("key", CATALOG_CONFIG_KEY).maybeSingle(),
    supabase.from("posters").select("*", { count: "exact", head: true }),
  ]);

  const categories = new Map<string, CatalogCategory>();
  for (const c of catsRes.data ?? []) {
    categories.set(String(c.id), {
      id: String(c.id),
      name: String(c.name ?? ""),
      slug: String(c.slug ?? ""),
      hidden: Boolean(c.hidden),
      status: c.status != null ? String(c.status) : null,
    });
  }

  const products = (postsRes.data ?? []) as CatalogProduct[];
  const totalProducts = countRes.count ?? 0;

  const variantsRes = await fetchCatalogVariants(
    supabase,
    products.map((p) => p.id),
  );

  return {
    products,
    categories,
    pricing: catalogPricingFromRows(
      (pricingRes.data ?? []) as Array<{ key: string; value: unknown }>,
    ),
    variants: variantsRes.best,
    metaVariants: variantsRes.meta,
    variantInfo: variantsRes.bestInfo,
    config: parseCatalogConfig(cfgRes.data?.value),
    totalProducts,
  };
}

/** Fetch ALL catalog data across pages — used by the Meta feed server route. */
export async function fetchAllCatalogData(supabase: SupabaseClient): Promise<CatalogData> {
  const pageSize = 500;
  let page = 1;
  let allProducts: CatalogProduct[] = [];
  let categoryMap = new Map<string, CatalogCategory>();
  let pricing: CatalogPricing | null = null;
  let variants: Record<string, string> = {};
  let metaVariants: Record<string, string> = {};
  let variantInfo: Record<
    string,
    { variant: string; width: number | null; height: number | null; format: string | null }
  > = {};
  let config: CatalogConfig | null = null;
  let totalProducts = 0;

  while (true) {
    const data = await fetchCatalogData(supabase, { page, pageSize });
    if (page === 1) {
      categoryMap = data.categories;
      pricing = data.pricing;
      config = data.config;
      totalProducts = data.totalProducts;
    }
    allProducts = allProducts.concat(data.products);
    variants = { ...variants, ...data.variants };
    metaVariants = { ...metaVariants, ...data.metaVariants };
    variantInfo = { ...variantInfo, ...data.variantInfo };

    if (data.products.length < pageSize) break;
    page++;
  }

  return {
    products: allProducts,
    categories: categoryMap,
    pricing: pricing ?? catalogPricingFromRows([]),
    variants,
    metaVariants,
    variantInfo,
    config: config ?? CATALOG_CONFIG_DEFAULTS,
    totalProducts,
  };
}
