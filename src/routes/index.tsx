import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/lib/use-categories";
import hero from "@/assets/hero.jpg";
import { HomeSlider } from "@/components/HomeSlider";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { CustomerReviews } from "@/components/CustomerReviews";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ShopByCollection } from "@/components/ShopByCollection";
import { Highlights } from "@/components/Highlights";
import { BestSellers } from "@/components/BestSellers";
import { CollectionsQuickBar } from "@/components/CollectionsQuickBar";
import { TrustedQuality } from "@/components/TrustedQuality";
import { AboutBrwaz } from "@/components/AboutBrwaz";
import { HeroBannerSlider } from "@/components/HeroBannerSlider";
import { TrendingNow } from "@/components/TrendingNow";
import { FrameSetsHome } from "@/components/FrameSetsHome";
import { ForYouSection, BecauseYouLikedSection, RecommendedForYouSection } from "@/components/PersonalRails";
import { useHomeSections, type HomeSectionConfig } from "@/lib/homepage-sections";
import { FEATURED_SLUGS, useHomeCategoryPicks } from "@/lib/home-category-picks";
import { LazyOnView } from "@/components/LazyOnView";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { usePosterThumbs } from "@/lib/public-images";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BRWAZWNEON — Turn Your Room Into A Piece Of Art" },
      { name: "description", content: "Premium framed posters — football, movies, TV series, anime and cars. Cash on delivery across Egypt." },
      { property: "og:title", content: "BRWAZWNEON — Turn Your Room Into A Piece Of Art" },
      { property: "og:description", content: "Premium framed posters delivered across Egypt." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: categories = [] } = useCategories();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const sections = useHomeSections();
  const { data: picks = {} } = useHomeCategoryPicks();
  const perf = usePerformanceFlags();
  const emergencyHidden = new Set([
    "for-you",
    "because-you-liked",
    "recommended-for-you",
    "recently-viewed",
    "before-after",
    "reviews",
    "highlights",
  ]);

  const resolveTitle = (s: HomeSectionConfig) => s.title_en || s.title || undefined;
  const resolveSubtitle = (s: HomeSectionConfig) => s.subtitle_en || s.subtitle || undefined;

  const RENDERERS: Record<string, (s: HomeSectionConfig) => React.ReactNode> = {
    hero: () => <HeroSection key="hero" />,
    trust: () => <TrustSection key="trust" />,
    "trusted-quality": (s) => <TrustedQuality key="trusted-quality" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} />,
    about: () => <AboutBrwaz key="about" />,
    highlights: () => <Highlights key="highlights" />,
    "best-sellers": (s) => <BestSellers key="best-sellers" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} />,
    benefits: () => <BenefitsBar key="benefits" />,
    collections: () => <ShopByCollection key="collections" />,
    "frame-sets": (s) => (
      <FrameSetsHome key="frame-sets" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} />
    ),
    "trending-now": (s) => (
      <TrendingNow
        key="trending-now"
        title={resolveTitle(s)}
        subtitle={resolveSubtitle(s)}
        itemsCount={s.items_count ?? 12}
        manualIds={s.source_type === "manual" ? s.manual_ids : undefined}
      />
    ),
    "for-you": (s) => (
      <ForYouSection key="for-you" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} itemsCount={s.items_count ?? 12} />
    ),
    "because-you-liked": (s) => (
      <BecauseYouLikedSection key="because-you-liked" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} itemsCount={s.items_count ?? 12} />
    ),
    "recommended-for-you": (s) => (
      <RecommendedForYouSection key="recommended-for-you" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} itemsCount={s.items_count ?? 12} />
    ),
    categories: () => (
      <div key="categories">
        {FEATURED_SLUGS.map((slug, i) => {
          const cat = bySlug.get(slug);
          return (
            <CategorySection
              key={slug}
              slug={slug}
              name={cat?.name ?? defaultName(slug)}
              index={i}
              pickedIds={picks[slug] ?? []}
            />
          );
        })}
      </div>
    ),
    offers: () => <OffersSection key="offers" />,
    "recently-viewed": () => <RecentlyViewed key="recently-viewed" />,
    "before-after": () => <BeforeAfter key="before-after" location="homepage" />,
    reviews: () => <CustomerReviews key="reviews" />,
  };

  return (
    <div className="bg-background text-foreground">
      <HomeSlider />
      <CollectionsQuickBar />
      {/* Personalized rails are now controlled via Homepage Sections (For You / Because You Liked / Recommended For You). */}
        {sections
        .filter((s) => s.enabled && s.key in RENDERERS)
        .filter((s) => !perf.emergency_fast_mode || !emergencyHidden.has(s.key))
        .slice(0, perf.max_home_sections)
        .map((s, idx) => {
          const node = RENDERERS[s.key](s);
          // Keep hero + first section eager for LCP; defer the rest until
          // they scroll near the viewport to shrink initial paint cost.
          if (idx < 2 || s.key === "hero") return node;
          return (
            <LazyOnView key={`lazy-${s.key}-${idx}`} minHeight={520}>
              {node}
            </LazyOnView>
          );
        })}
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border">
        <HeroBannerSlider
          fallback={
            <>
              <img
                src={hero}
                alt="Framed poster gallery wall"
                width={1600}
                height={1024}
                className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 grayscale"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/80 to-background" />
            </>
          }
        />
        <div className="container-page flex min-h-[85vh] flex-col justify-end py-20">
          <p className="mb-5 text-[10px] uppercase tracking-[0.5em] text-muted-foreground sm:text-xs">
            BRWAZWNEON · Framed in Egypt · Cash on delivery
          </p>
          <h1 className="text-display text-5xl leading-[0.92] sm:text-7xl md:text-[8.5rem]">
            Turn Your Room<br />Into A Piece<br />Of Art.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Premium framed posters of the films, players, shows, anime and cars
            you actually care about. Gallery-grade frames, hand-printed.
          </p>
          <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:flex-wrap sm:items-end">
            <Link
              to="/category/$slug"
              params={{ slug: "movies" }}
              className="w-full rounded-sm bg-primary px-8 py-4 text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 sm:w-auto"
            >
              Shop Posters
            </Link>

            <div className="flex w-full flex-col items-start sm:w-auto sm:items-center">
              <span className="mb-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-foreground">
                ⭐ Most Popular
              </span>
              <Link
                to="/custom-design"
                onClick={(e) => {
                  const el = document.getElementById("custom-design");
                  if (el) {
                    e.preventDefault();
                    el.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="group relative w-full overflow-hidden rounded-sm border border-white/70 bg-black px-10 py-5 text-center text-sm font-semibold uppercase tracking-widest text-white shadow-[0_0_0_rgba(255,255,255,0)] transition-all duration-[250ms] hover:-translate-y-0.5 hover:border-white hover:shadow-[0_0_28px_rgba(255,255,255,0.35)] sm:w-auto"
              >
                🎨 Customize Your Frame
                <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 skew-x-12 bg-white/10 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
              </Link>
              <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-muted-foreground sm:text-center">
                Upload your own photo or artwork and our designers will prepare it for premium-quality printing.
              </p>
            </div>

            <Link
              to="/photo-printing"
              className="w-full rounded-sm border border-border px-8 py-4 text-center text-xs font-semibold uppercase tracking-widest hover:bg-accent sm:w-auto"
            >
              Print Your Photos
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
            {[
              "Professional Designer Included",
              "We Enhance Your Photo Before Printing",
              "Preview Before Printing",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-foreground">✔</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="border-b border-border bg-card">
        <div className="container-page py-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-foreground sm:text-sm">
            <span className="mr-2">⭐</span>
            Over 7 Million Photos Printed — And We're Still Creating Memories With You.
          </p>
        </div>
    </section>
  );
}

function BenefitsBar() {
  return (
    <section className="border-b border-border bg-background">
        <div className="container-page py-5">
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
            {[
              "Premium PVC Frames",
              "Wooden Portraits",
              "Photo Printing",
              "Cash On Delivery",
              "Shipping Across Egypt",
            ].map((b) => (
              <li key={b} className="flex items-center gap-2">
                <span className="text-foreground">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
    </section>
  );
}

function OffersSection() {
  return (
    <section className="border-t border-border bg-card">
        <div className="container-page py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            Limited time
          </p>
          <h2 className="text-display mt-3 text-4xl sm:text-6xl">Special Offers</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
            <OfferCard
              title="6 Frames"
              size="20 × 30 cm"
              price="790"
            />
            <OfferCard
              title="4 Frames"
              size="30 × 40 cm"
              price="890"
            />
          </div>
          <div className="mt-10">
            <Link
              to="/offers"
              className="inline-flex rounded-sm bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
            >
              Claim an offer
            </Link>
          </div>
        </div>
    </section>
  );
}

function defaultName(slug: string) {
  return slug
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function CategorySection({ slug, name, index, pickedIds = [] }: { slug: string; name: string; index: number; pickedIds?: string[] }) {
  const picksKey = pickedIds.join(",");
  const perf = usePerformanceFlags();
  const limit = perf.emergency_fast_mode ? 8 : 6;
  const { data: posters = [] } = useQuery({
    queryKey: ["home-posters", slug, picksKey, limit],
    staleTime: 60_000,
    queryFn: async () => {
      // Admin-picked posters take priority (fixed order).
      if (pickedIds.length > 0) {
        const { data, error } = await supabase
          .from("posters")
          .select("id,title")
          .in("id", pickedIds)
        if (error) throw error;
        const map = new Map((data ?? []).map((p) => [p.id, p]));
        return pickedIds.map((id) => map.get(id)).filter(Boolean).slice(0, limit);
      }
      // Resolve category and its descendants (posters may live under subcategories).
      const { data: cat, error: catErr } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (catErr) throw catErr;
      if (!cat) return [];
      const { data: kids } = await supabase
        .from("categories")
        .select("id")
        .eq("parent_id", cat.id);
      const ids = [cat.id, ...(kids ?? []).map((k) => k.id)];
      const { data, error } = await supabase
        .from("posters")
        .select("id,title")
        .in("category_id", ids)
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
  const thumbs = usePosterThumbs(posters.map((p: any) => p.id));

  const reversed = index % 2 === 1;

  return (
    <section className={`border-t border-border ${reversed ? "bg-card" : "bg-background"}`}>
      <div className="container-page py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              0{index + 1} · Collection
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">{name} Posters</h2>
          </div>
          <Link
            to="/category/$slug"
            params={{ slug }}
            className="hidden shrink-0 rounded-sm border border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent sm:inline-flex"
          >
            View all →
          </Link>
        </div>

        {posters.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            New {name.toLowerCase()} posters dropping soon.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {posters.map((p: any) => (
              <Link
                key={p.id}
                to="/category/$slug"
                params={{ slug }}
                className="group relative block aspect-[3/4] overflow-hidden rounded-sm border border-border bg-muted"
              >
                <WishlistHeart posterId={p.id} />
                <FramePreview
                  posterUrl={thumbs[p.id] ?? ""}
                  title={p.title}
                  aspectClassName="aspect-[3/4]"
                  bare
                  loading="lazy"
                  className="h-full w-full transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-background/90 px-3 py-2 text-[10px] uppercase tracking-widest transition group-hover:translate-y-0">
                  {p.title}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6 sm:hidden">
          <Link
            to="/category/$slug"
            params={{ slug }}
            className="inline-flex rounded-sm border border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
          >
            View all {name} →
          </Link>
        </div>
      </div>
    </section>
  );
}

function OfferCard({ title, size, price }: { title: string; size: string; price: string }) {
  return (
    <div className="relative flex flex-col justify-between bg-background p-8 sm:p-10">
      <div>
        <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">Bundle</p>
        <h3 className="text-display mt-3 text-4xl sm:text-5xl">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{size}</p>
      </div>
      <div className="mt-10 flex items-end justify-between">
        <div>
          <div className="text-display text-5xl leading-none">{price}</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">EGP</div>
        </div>
        <Link
          to="/offers"
          className="rounded-sm border border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
        >
          Order →
        </Link>
      </div>
    </div>
  );
}
