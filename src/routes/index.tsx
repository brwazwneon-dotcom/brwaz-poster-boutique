import { createFileRoute } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/lib/use-categories";
import hero from "@/assets/hero.jpg";
import { HomeSlider } from "@/components/HomeSlider";

const FEATURED_SLUGS = ["football", "movies", "tv-series", "anime", "cars"] as const;

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
  return (
    <div className="bg-background text-foreground">
      {/* HOMEPAGE SLIDER (renders only when admin has uploaded slides) */}
      <HomeSlider />
      {/* HERO */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <img
          src={hero}
          alt="Framed poster gallery wall"
          width={1600}
          height={1024}
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 grayscale"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/80 to-background" />
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
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/category/$slug"
              params={{ slug: "movies" }}
              className="rounded-sm bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
            >
              Shop Posters
            </Link>
            <Link
              to="/photo-printing"
              className="rounded-sm border border-border px-8 py-4 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
            >
              Print Your Photos
            </Link>
          </div>
        </div>
      </section>

      {/* TRUST STATEMENT */}
      <section className="border-b border-border bg-card">
        <div className="container-page py-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-foreground sm:text-sm">
            <span className="mr-2">⭐</span>
            Over 7 Million Photos Printed — And We're Still Creating Memories With You.
          </p>
        </div>
      </section>

      {/* BENEFITS BAR */}
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

      {/* CATEGORY SECTIONS */}
      {FEATURED_SLUGS.map((slug, i) => {
        const cat = bySlug.get(slug);
        return (
          <CategorySection
            key={slug}
            slug={slug}
            name={cat?.name ?? defaultName(slug)}
            index={i}
          />
        );
      })}

      {/* SPECIAL OFFERS */}
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
    </div>
  );
}

function defaultName(slug: string) {
  return slug
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function CategorySection({ slug, name, index }: { slug: string; name: string; index: number }) {
  const { data: posters = [] } = useQuery({
    queryKey: ["home-posters", slug],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,categories!inner(slug)")
        .eq("categories.slug", slug)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

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
                <SafeImage
                  src={p.image_url}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
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
