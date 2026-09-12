import { useEffect, useState } from "react";
import { SafeImage } from "@/components/SafeImage";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getSliderImagesPublic } from "@/lib/db-public.functions";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Slide = { id: string; image_url: string; title: string | null; link_url: string | null };

export function HomepageSlider() {
  const { t } = useTranslation();
  const { data: slides = [] } = useQuery({
    queryKey: ["homepage-slider"],
    staleTime: 60_000,
    queryFn: async () => {
      return getSliderImagesPublic() as Promise<Slide[]>;
    },
  });

  const [idx, setIdx] = useState(0);
  // Only mount the first slide immediately; defer the rest until after
  // first paint so the LCP image isn't fighting for bandwidth.
  const [mountAll, setMountAll] = useState(false);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setTimeout(() => setMountAll(true), 1200);
    return () => window.clearTimeout(t);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 4000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const go = (n: number) => setIdx((n + slides.length) % slides.length);

  return (
    <section
      data-homepage-slider="true"
      className="relative isolate overflow-hidden border-b border-border bg-card"
    >
      <div className="relative h-[40vh] min-h-[260px] w-full sm:h-[55vh] md:h-[65vh]">
        {/* Subtle skeleton so the hero area never reads as an empty band while
            the first slide is still decoding. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/60 via-muted/30 to-muted/60"
        />
        {slides.map((s, i) => {
          if (i > 0 && !mountAll) return null;
          const inner = (
            <SafeImage
              src={s.image_url}
              alt={s.title ?? ""}
              className="h-full w-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={i === 0 ? "high" : "low"}
            />
          );
          return (
            <div
              key={s.id}
              className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              aria-hidden={i !== idx}
            >
              {s.link_url ? (
                <a href={s.link_url} className="block h-full w-full">
                  {inner}
                </a>
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
              aria-label={t("homeSlider.previousSlide")}
              className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/70 backdrop-blur hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => go(idx + 1)}
              aria-label={t("homeSlider.nextSlide")}
              className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/70 backdrop-blur hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={t("homeSlider.goToSlide", { index: i + 1 })}
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
