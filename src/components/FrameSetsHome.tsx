import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";

type SetRow = {
  id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
};

const ROTATE_MS = 3500;

export function FrameSetsHome({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { data: sets = [] } = useQuery({
    queryKey: ["home-frame-sets"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sets")
        .select("id,name,image_url,sort_order")
        .eq("enabled", true)
        .not("image_url", "is", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SetRow[];
    },
  });

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (sets.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % sets.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [sets.length]);

  if (sets.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              Curated bundles
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">
              {title || "Frame Sets"}
            </h2>
            {subtitle ? (
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <Link
            to="/sets"
            className="hidden shrink-0 rounded-sm border border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent sm:inline-flex"
          >
            View all →
          </Link>
        </div>

        <Link
          to="/sets"
          className="group relative block aspect-[16/9] w-full overflow-hidden rounded-sm border border-border bg-muted"
          aria-label="Browse frame sets"
        >
          {sets.map((s, i) => (
            <div
              key={s.id}
              className={`absolute inset-0 transition-opacity duration-[900ms] ease-in-out ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={i !== index}
            >
              <SafeImage
                src={s.image_url ?? ""}
                alt={s.name}
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
          {sets.length > 1 ? (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {sets.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIndex(i);
                  }}
                  aria-label={`Show set ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </Link>

        <div className="mt-6 sm:hidden">
          <Link
            to="/sets"
            className="inline-flex rounded-sm border border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
          >
            View all sets →
          </Link>
        </div>
      </div>
    </section>
  );
}
