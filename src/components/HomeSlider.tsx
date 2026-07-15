import { useEffect, useState } from "react";
import { SafeImage } from "@/components/SafeImage";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Slide = { id: string; image_url: string; title: string | null; link_url: string | null };

export function HomeSlider() {
  const { data: slides = [] } = useQuery({
    queryKey: ["slider"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slider_images")
        .select("id,image_url,title,link_url")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Slide[];
    },
  });

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 4000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const go = (n: number) => setIdx((n + slides.length) % slides.length);

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-card">
      <div className="relative h-[40vh] min-h-[260px] w-full sm:h-[55vh] md:h-[65vh]">
        {/* Subtle skeleton so the hero area never reads as an empty band while
            the first slide is still decoding. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/60 via-muted/30 to-muted/60"
        />
        {slides.map((s, i) => {
          const inner = (
            <SafeImage
              src={s.image_url}
              alt={s.title ?? ""}
              className="h-full w-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              // @ts-expect-error — React 19 accepts fetchPriority, older DOM libs may not type it.
              fetchpriority={i === 0 ? "high" : "low"}
            />
          );
          return (
            <div
              key={s.id}
              className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              aria-hidden={i !== idx}
            >
              {s.link_url ? (
                <a href={s.link_url} className="block h-full w-full">{inner}</a>
              ) : (
                inner
              )}
            </div>
          );
        })}

        {slides.length > 1 && (
          <>
            <button
              onClick={() => go(idx - 1)}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/70 backdrop-blur hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => go(idx + 1)}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/70 backdrop-blur hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-foreground" : "w-1.5 bg-foreground/40"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}