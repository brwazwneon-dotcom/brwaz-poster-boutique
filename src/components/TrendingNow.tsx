import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "./FramePreview";
import { Flame, ArrowRight } from "lucide-react";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { usePosterResponsiveImages } from "@/lib/public-images";
import { useActiveAutoplay } from "@/hooks/use-active-autoplay";

type TrendingPoster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  trending: boolean | null;
  trending_order: number | null;
  featured: boolean | null;
  is_best_seller: boolean | null;
  review_status: string | null;
  views_count: number | null;
  created_at: string | null;
  categories: { name: string | null; slug: string | null } | null;
};

const MAX_QUERY_CANDIDATES = 72;

function normalizeTitle(title: string | null | undefined) {
  return (title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeImageUrl(url: string | null | undefined) {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://brwazwneon.com");
    const pathname = decodeURIComponent(parsed.pathname).replace(/\/+/g, "/");
    return `${parsed.origin.toLowerCase()}${pathname}`.toLowerCase();
  } catch {
    return raw.split(/[?#]/)[0]?.trim().toLowerCase() ?? "";
  }
}

function hasValidImageUrl(url: string | null | undefined) {
  const raw = (url ?? "").trim();
  return Boolean(raw && raw !== "#" && !raw.startsWith("data:"));
}

function isUsablePoster(p: TrendingPoster) {
  return (
    hasValidImageUrl(p.image_url) &&
    p.review_status !== "draft" &&
    p.review_status !== "needs_replace"
  );
}

function newestFirst(a: string | null, b: string | null) {
  return new Date(b ?? 0).getTime() - new Date(a ?? 0).getTime();
}

function sourceRank(p: TrendingPoster) {
  if (p.trending) return 0;
  if (p.is_best_seller) return 1;
  if (p.featured) return 2;
  return 3;
}

function sortTrendingCandidates(
  rows: TrendingPoster[],
  manualOrder: Map<string, number>,
  useManual: boolean,
) {
  return [...rows].sort((a, b) => {
    if (useManual) {
      const manualA = manualOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const manualB = manualOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (manualA !== manualB) return manualA - manualB;
    }
    const rank = sourceRank(a) - sourceRank(b);
    if (rank !== 0) return rank;
    const ready = Number(b.review_status === "ready") - Number(a.review_status === "ready");
    if (ready !== 0) return ready;
    const orderA = a.trending_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.trending_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const views = (b.views_count ?? 0) - (a.views_count ?? 0);
    if (views !== 0) return views;
    return newestFirst(a.created_at, b.created_at);
  });
}

function dedupePosters(rows: TrendingPoster[], limit: number) {
  const seenIds = new Set<string>();
  const seenImages = new Set<string>();
  const seenTitles = new Set<string>();
  const out: TrendingPoster[] = [];
  for (const row of rows) {
    if (!isUsablePoster(row)) continue;
    const imageKey = normalizeImageUrl(row.image_url);
    const titleKey = normalizeTitle(row.title);
    if (!imageKey || !titleKey) continue;
    if (seenIds.has(row.id) || seenImages.has(imageKey) || seenTitles.has(titleKey)) continue;
    seenIds.add(row.id);
    seenImages.add(imageKey);
    seenTitles.add(titleKey);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function TrendingNow({
  title,
  subtitle,
  itemsCount = 12,
  manualIds,
}: {
  title?: string;
  subtitle?: string;
  itemsCount?: number;
  manualIds?: string[];
}) {
  const manualPosterIds = manualIds ?? [];
  const useManual = manualPosterIds.length > 0;
  const perf = usePerformanceFlags();
  const displayCount = perf.emergency_fast_mode ? 8 : Math.min(Math.max(itemsCount, 1), 12);
  const manualOrder = useMemo(
    () => new Map(manualPosterIds.map((id, index) => [id, index])),
    [manualPosterIds],
  );
  const { data = [] } = useQuery<TrendingPoster[]>({
    queryKey: ["trending-now-home", useManual ? manualPosterIds.join(",") : "auto", displayCount],
    staleTime: 60_000,
    queryFn: async (): Promise<TrendingPoster[]> => {
      const sourceFilter = useManual
        ? `id.in.(${manualPosterIds.join(",")}),trending.eq.true,is_best_seller.eq.true,featured.eq.true`
        : "trending.eq.true,is_best_seller.eq.true,featured.eq.true";
      const { data, error } = await supabase
        .from("posters")
        .select(
          "id,title,image_url,category_id,trending,trending_order,featured,is_best_seller,review_status,views_count,created_at,categories(name,slug)",
        )
        .or(sourceFilter)
        .eq("hidden", false)
        .not("image_url", "is", null)
        .neq("image_url", "")
        .neq("review_status", "draft")
        .neq("review_status", "needs_replace")
        .order("trending", { ascending: false })
        .order("trending_order", { ascending: true, nullsFirst: false })
        .order("views_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(Math.max(displayCount * 6, MAX_QUERY_CANDIDATES));
      if (error) throw error;
      const posters = (data ?? []) as TrendingPoster[];
      const sorted = sortTrendingCandidates(posters, manualOrder, useManual);
      return dedupePosters(sorted, displayCount);
    },
  });
  const images = usePosterResponsiveImages(
    data.map((p) => p.id),
    "(max-width: 640px) 45vw, (max-width: 1024px) 24vw, 16vw",
  );

  const carouselRef = useRef<HTMLDivElement>(null);
  const [userInteracting, setUserInteracting] = useState(false);
  const [autoIdx, setAutoIdx] = useState(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [carouselInView, carouselActive] = useActiveAutoplay<HTMLDivElement>();

  useEffect(() => {
    const el = carouselRef.current;
    if (!el || !carouselActive || userInteracting || data.length < 2) return;
    const onUserScroll = () => {
      setUserInteracting(true);
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setUserInteracting(false), 6000);
      const cards = Array.from(el.children) as HTMLElement[];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const dist = Math.abs(cards[i].getBoundingClientRect().left - el.getBoundingClientRect().left);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      setAutoIdx(bestIdx);
    };
    const onTouchStart = () => setUserInteracting(true);
    const onTouchEnd = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setUserInteracting(false), 6000);
    };
    el.addEventListener("scroll", onUserScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", onUserScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      clearTimeout(idleTimer.current);
    };
  }, [carouselActive, userInteracting, data.length]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el || !carouselActive || userInteracting || data.length < 2) return;
    const initialTimer = setTimeout(() => {
      const interval = setInterval(() => {
        if (!carouselRef.current) return;
        setAutoIdx((prev) => {
          const next = (prev + 1) % data.length;
          const card = carouselRef.current?.children[next] as HTMLElement | undefined;
          card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
          return next;
        });
      }, 4500);
      return () => clearInterval(interval);
    }, 2000);
    return () => clearTimeout(initialTimer);
  }, [carouselActive, userInteracting, data.length]);

  if (data.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-primary">
              <Flame className="mr-1 inline h-3 w-3" /> Trending
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">{title || "Trending Now"}</h2>
            {subtitle ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <Link
            to="/trending"
            className="group inline-flex shrink-0 items-center gap-2 rounded-sm border border-primary bg-primary px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary-foreground shadow-[0_0_0_0_hsl(var(--primary))] transition-all duration-300 hover:shadow-[0_0_24px_2px_hsl(var(--primary)/0.5)] hover:brightness-110 animate-pulse"
          >
            View all
            <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div
          ref={carouselRef}
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {data.map((p, index) => {
            const baseImage = images[p.id];
            return (
              <Link
                key={p.id}
                to="/category/$slug"
                params={{ slug: p.categories?.slug ?? "movies" }}
                className="group relative block w-[44%] shrink-0 snap-start sm:w-[24%] lg:w-[16%]"
              >
                <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-sm bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground">
                  <Flame className="h-2.5 w-2.5" /> Trending
                </span>
                <FramePreview
                  posterUrl={baseImage?.src || p.image_url || ""}
                  avifSrcSet={baseImage?.avifSrcSet}
                  webpSrcSet={baseImage?.webpSrcSet}
                  sizes={baseImage?.sizes}
                  title={p.title}
                  frameType="pvc"
                  color="black"
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? undefined : "low"}
                  className="transition duration-500 group-hover:scale-[1.02]"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
