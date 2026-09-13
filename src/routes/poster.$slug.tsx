// Gives every poster a real, permanent, indexable URL. Previously a poster
// only existed as React state inside /category/$slug — the address bar
// never changed, so no single product could be shared, linked from an ad,
// or indexed by Google individually. This route reuses the exact same
// Customizer (size/frame/color/add-to-cart) that /category/$slug uses, so
// browsing behavior there is completely unchanged.
//
// Depends on migration 20260911130000_posters_slug_backfill_and_unique.sql
// having been applied — every poster needs a non-null, unique slug for
// this route to find it. Until that migration runs, posters with a NULL
// slug (pre-dating the AI upload flow) simply aren't reachable here yet;
// they still work exactly as before via /category/$slug.

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getPosterBySlugPublic } from "@/lib/db-public.functions";
import { FrameComparison } from "@/components/FrameComparison";
import { BeforeAfter } from "@/components/BeforeAfter";
import { RelatedPosters } from "@/components/RelatedPosters";
import { CustomerReviews } from "@/components/CustomerReviews";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { useCategories } from "@/lib/use-categories";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { trackPosterView } from "@/lib/poster-tracking";
import { track as behavior } from "@/lib/behavior";
import { trackEvent } from "@/lib/meta-pixel";
import { useEffect } from "react";
import { Customizer, type Poster } from "@/routes/category.$slug";

const BASE_URL = "https://brwazwneon.com";

export const Route = createFileRoute("/poster/$slug")({
  loader: async ({ params }) => {
    const poster = await getPosterBySlugPublic({ data: { slug: params.slug } });
    if (!poster) throw notFound();
    // No image_variants pipeline yet on the new database (Phase 4) — the
    // original image_url doubles as the OG image for now.
    const ogImage = poster.image_url ?? undefined;
    return { poster, ogImage };
  },
  head: ({ loaderData, params }) => {
    const poster = loaderData?.poster;
    const title = poster
      ? (poster.seo_title || `${poster.title} — Framed Poster | BRWAZWNEON`)
      : "Poster — BRWAZWNEON";
    const description =
      poster?.seo_description ||
      (poster
        ? `${poster.title} — premium framed poster print in PVC or Wooden Portrait frames, delivered across Egypt with cash on delivery.`
        : undefined);
    const url = `${BASE_URL}/poster/${params.slug}`;
    const image = loaderData?.ogImage;

    return {
      meta: [
        { title },
        ...(description ? [{ name: "description", content: description }] : []),
        { property: "og:title", content: title },
        ...(description ? [{ property: "og:description", content: description }] : []),
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        ...(image ? [{ property: "og:image", content: image }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        ...(description ? [{ name: "twitter:description", content: description }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: poster
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                name: poster.title,
                image: image ? [image] : undefined,
                description,
                url,
                brand: { "@type": "Brand", name: "BRWAZWNEON" },
                // offers.price intentionally omitted — final price depends
                // on the frame/size the customer picks on this page (see
                // Customizer), there is no single fixed price for a poster
                // the way schema.org/Product normally expects. Revisit if
                // the business wants a "starting at X EGP" figure published.
              }),
            },
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
                  { "@type": "ListItem", position: 2, name: poster.title, item: url },
                ],
              }),
            },
          ]
        : [],
    };
  },
  component: PosterPage,
});

function PosterPage() {
  const { poster } = Route.useLoaderData();
  const { data: categories = [] } = useCategories();
  const category = categories.find((c) => c.id === poster.category_id) ?? null;
  const perf = usePerformanceFlags();
  const { record: recordRecentlyViewed } = useRecentlyViewed();

  // Mirrors the exact tracking calls category.$slug.tsx makes when a
  // poster is selected (see `toggle()` there) — keep analytics and
  // recently-viewed behavior identical between the two ways a customer
  // can land on a given poster, so admin analytics/recommendations don't
  // silently undercount traffic that arrives via this route.
  useEffect(() => {
    if (!category) return;
    recordRecentlyViewed({
      id: poster.id,
      title: poster.title,
      image_url: poster.image_url ?? "",
      category_id: poster.category_id,
      category_slug: category.slug,
      category_name: category.name,
    });
    trackPosterView(poster.id);
    try {
      behavior.productView(poster.id, { categoryId: poster.category_id, tags: poster.tags ?? [] });
    } catch {
      /* noop, matches category.$slug.tsx */
    }
    try {
      trackEvent("ViewContent", {
        content_ids: [poster.id],
        content_name: poster.title,
        content_type: "product",
      });
    } catch {
      /* noop, matches category.$slug.tsx */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poster.id, category?.id]);

  const posterForCustomizer: Poster = {
    id: poster.id,
    title: poster.title,
    image_url: poster.image_url ?? undefined,
    webp_srcset: poster.webp_srcset,
    avif_srcset: poster.avif_srcset,
    category_id: poster.category_id,
    tags: poster.tags,
    edit_settings: poster.edit_settings,
    badge: poster.badge,
    sales_count: poster.sales_count,
    views_count: poster.views_count,
    is_best_seller: poster.is_best_seller,
  };

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-6 text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          {category && (
            <>
              {" / "}
              <Link to="/category/$slug" params={{ slug: category.slug }} className="hover:underline">
                {category.name}
              </Link>
            </>
          )}
          {" / "}
          <span className="text-foreground">{poster.title}</span>
        </nav>

        {category ? (
          <Customizer
            posters={[posterForCustomizer]}
            category={category}
            onRemove={() => {
              /* single-product page: nothing to remove down to */
            }}
            onClear={() => {
              /* no-op on a dedicated product page */
            }}
          />
        ) : (
          // category_id pointed at a category that no longer exists /
          // wasn't loaded yet — extremely rare, but must render
          // *something* rather than a blank page.
          <div className="rounded-sm border border-border bg-card p-8 text-center text-muted-foreground">
            This product's category could not be loaded. Please browse from{" "}
            <Link to="/" className="underline">
              the homepage
            </Link>
            .
          </div>
        )}
      </div>

      <RelatedPosters
        poster={posterForCustomizer}
        categorySlug={category?.slug}
        categoryName={category?.name}
      />
      <FrameComparison />
      <BeforeAfter location="product" />
      {!perf.emergency_fast_mode && <RecentlyViewed />}
      {!perf.emergency_fast_mode && <CustomerReviews posterId={poster.id} />}
      {!perf.emergency_fast_mode && <ProductInfoSections variant="all" />}
    </>
  );
}
