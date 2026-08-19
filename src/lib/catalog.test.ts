import { describe, expect, it } from "vitest";
import {
  catalogImageDiagnostics,
  catalogIssueFor,
  catalogPriceSource,
  metaRowFor,
  resolveCatalogPrice,
  type CatalogCategory,
  type CatalogData,
  type CatalogPricing,
  type CatalogProduct,
} from "./catalog";
import { parsePostOrderMessageEnabled } from "./use-settings";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Test Poster",
    description: null,
    seo_description: null,
    slug: "test-poster",
    category_id: "cat-1",
    image_url: null,
    original_url: null,
    price: null,
    hidden: false,
    review_status: "ready",
    updated_at: null,
    ...overrides,
  };
}

const cat: CatalogCategory = {
  id: "cat-1",
  name: "Abstract",
  slug: "abstract",
  hidden: false,
  status: "published",
};

const pricing: CatalogPricing = {
  frame: {
    pvc: { "20x30": 190, "30x40": 250, "40x50": 350 },
    wood: { "20x30": 190, "30x40": 270, "40x50": 400 },
  },
};

function data(
  overrides: {
    variants?: Record<string, string>;
    metaVariants?: Record<string, string>;
    products?: CatalogProduct[];
  } = {},
): Pick<CatalogData, "categories" | "pricing" | "variants" | "metaVariants"> {
  return {
    categories: new Map([["cat-1", cat]]),
    pricing,
    variants: overrides.variants ?? {},
    metaVariants: overrides.metaVariants ?? {},
  };
}

describe("post-order message setting parsing", () => {
  it("parses OFF in every stored form", () => {
    expect(parsePostOrderMessageEnabled(false)).toBe(false);
    expect(parsePostOrderMessageEnabled(0)).toBe(false);
    expect(parsePostOrderMessageEnabled("false")).toBe(false);
    expect(parsePostOrderMessageEnabled("0")).toBe(false);
  });
  it("parses ON in every stored form", () => {
    expect(parsePostOrderMessageEnabled(true)).toBe(true);
    expect(parsePostOrderMessageEnabled(1)).toBe(true);
    expect(parsePostOrderMessageEnabled("true")).toBe(true);
    expect(parsePostOrderMessageEnabled(undefined)).toBe(true);
    expect(parsePostOrderMessageEnabled(null)).toBe(true);
  });
});

describe("catalog price", () => {
  it("uses the explicit product price first", () => {
    expect(resolveCatalogPrice(pricing, 1200)).toBe(1200);
    expect(catalogPriceSource(pricing, 1200)).toBe("poster");
  });
  it("falls back to the PVC 30×40 store price", () => {
    expect(resolveCatalogPrice(pricing, null)).toBe(250);
    expect(catalogPriceSource(pricing, null)).toBe("pvc-30x40-default");
  });
  it("falls back to the lowest configured frame price", () => {
    const empty = { frame: { pvc: {}, wood: {} } } as CatalogPricing;
    expect(resolveCatalogPrice(empty, null)).toBe(0);
    expect(catalogPriceSource(empty, null)).toBe("none");
  });
  it("exports price with the mandatory Meta currency", () => {
    const row = metaRowFor(product({ price: 1200 }), data() as unknown as CatalogData);
    expect(row.price).toBe("1200.00 EGP");
  });
});

describe("catalogImageDiagnostics", () => {
  it("flags a fully-ready product", () => {
    const p = product({
      image_url: "https://cdn.example/mockup.jpg",
      original_url: "https://cdn.example/print.jpg",
      price: 500,
    });
    const d = catalogImageDiagnostics(p, data());
    expect(d.ready).toBe(true);
    expect(d.issue).toBeNull();
    expect(d.priceMissing).toBe(false);
    expect(d.mockupMissing).toBe(false);
    expect(d.metaMockupMissing).toBe(true);
    expect(d.imageMissing).toBe(false);
    expect(d.feedImageKind).toBe("product-mockup");
    expect(d.categoryPresent).toBe(true);
  });

  it("uses a dedicated meta* variant when present", () => {
    const p = product({ image_url: "https://cdn.example/mockup.jpg" });
    const d = catalogImageDiagnostics(
      p,
      data({
        metaVariants: { [p.id]: "https://cdn.example/meta.webp" },
        variants: { [p.id]: "https://cdn.example/meta.webp" },
      }),
    );
    expect(d.metaVariantPresent).toBe(true);
    expect(d.metaMockupMissing).toBe(false);
    expect(d.feedImage).toBe("https://cdn.example/meta.webp");
    expect(d.feedImageKind).toBe("meta-variant");
  });

  it("flags missing mockup when only a raw print exists", () => {
    const p = product({ original_url: "https://cdn.example/print.jpg" });
    const d = catalogImageDiagnostics(p, data());
    expect(d.mockupMissing).toBe(true);
    expect(d.metaMockupMissing).toBe(true);
    expect(d.ready).toBe(false);
    expect(d.feedImageKind).toBe("primary");
  });

  it("flags missing price when no price can be resolved", () => {
    const p = product({ image_url: "https://cdn.example/mockup.jpg" });
    const d = catalogImageDiagnostics(p, data());
    expect(d.priceMissing).toBe(false);
    expect(d.price).toBe(250);
  });

  it("flags missing price when nothing is configured", () => {
    const p = product({ image_url: "https://cdn.example/mockup.jpg" });
    const empty = { frame: { pvc: {}, wood: {} } } as CatalogPricing;
    const d = catalogImageDiagnostics(p, { ...data(), pricing: empty });
    expect(d.priceMissing).toBe(true);
    expect(catalogIssueFor(p, { ...data(), pricing: empty })).toBe("no_price");
  });

  it("flags missing image", () => {
    const p = product({});
    const d = catalogImageDiagnostics(p, data());
    expect(d.imageMissing).toBe(true);
    expect(d.feedImage).toBe("");
    expect(catalogIssueFor(p, data())).toBe("no_image");
  });

  it("flags hidden products as not eligible", () => {
    const p = product({ hidden: true, image_url: "https://cdn.example/mockup.jpg" });
    const d = catalogImageDiagnostics(p, data());
    expect(d.issue).toBe("hidden");
    expect(d.ready).toBe(false);
  });

  it("flags a missing category", () => {
    const p = product({ category_id: null, image_url: "https://cdn.example/mockup.jpg" });
    const d = catalogImageDiagnostics(p, data());
    expect(d.categoryPresent).toBe(false);
    expect(d.issue).toBe("no_category");
  });
});
