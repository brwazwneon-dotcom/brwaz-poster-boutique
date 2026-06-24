import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useCategories } from "@/lib/use-categories";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BRWAZWNEON — Premium Framed Posters" },
      { name: "description", content: "Shop framed movie, football, anime, car and TV series posters. Premium PVC or wooden frames, delivered across Egypt." },
      { property: "og:title", content: "BRWAZWNEON — Premium Framed Posters" },
      { property: "og:description", content: "Shop framed movie, football, anime, car and TV series posters." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: categories = [] } = useCategories();
  return (
    <div>
      <section className="relative isolate overflow-hidden border-b border-border">
        <img
          src={hero}
          alt="Gallery wall of framed posters"
          width={1600}
          height={1024}
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        <div className="container-page flex min-h-[78vh] flex-col justify-end py-20">
          <p className="mb-4 text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Framed in Egypt · Cash on delivery
          </p>
          <h1 className="text-display text-5xl leading-[0.95] sm:text-7xl md:text-8xl">
            Your walls,<br />reframed.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Premium framed posters of the films, players, shows, anime and cars
            you actually care about. Hand-printed, gallery-grade frames.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/category/$slug"
              params={{ slug: "movies" }}
              className="rounded-sm bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
            >
              Shop collection
            </Link>
            <Link
              to="/offers"
              className="rounded-sm border border-border px-8 py-4 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
            >
              View offers
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <h2 className="text-display text-3xl sm:text-5xl">Categories</h2>
          <p className="hidden max-w-sm text-sm text-muted-foreground md:block">
            Six curated worlds. Pick a frame, pick a size, we ship.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden bg-card p-8 transition-colors hover:bg-accent"
            >
              {c.image && (
                <img
                  src={c.image}
                  alt={c.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-30 grayscale transition group-hover:opacity-50"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
              <div className="relative">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Collection
              </div>
              <div className="text-display mt-2 text-3xl transition-transform group-hover:translate-x-1">
                {c.name}
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                Explore →
              </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
