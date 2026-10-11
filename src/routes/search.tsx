import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FramedArtwork } from "@/components/FramedArtwork";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { getTrendingSearchesPublic, searchPostersPublic } from "@/lib/db-public.functions";
import { MIN_QUERY_LENGTH, normalizeText } from "@/lib/search-core";
import { expandSearchText, matchCategories } from "@/lib/search-aliases";
import { useCategories } from "@/lib/use-categories";
import { CategoryShortcuts } from "@/components/CategoryShortcuts";
import { trackEvent } from "@/lib/meta-pixel";
import { logSearchQuery } from "@/lib/analytics";
import { SEARCH_DEBOUNCE_MS, SearchBox, pushRecentSearch } from "@/components/SearchBox";
import { resolveProductArtwork, usePosterResponsiveImages } from "@/lib/public-images";
import { useInView } from "@/hooks/use-in-view";

const INITIAL_VISIBLE_RESULTS = 40;
const RESULTS_CHUNK = 40;

const schema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(schema),
  head: () => ({
    meta: [{ title: "Search — BRWAZWNEON" }, { name: "robots", content: "noindex" }],
  }),
  component: SearchPage,
});

type PosterRow = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: string[] | null;
  badge?: string | null;
};

function SearchPage() {
  const { t } = useTranslation();
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [input, setInput] = useState(q);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS);
  const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
    rootMargin: "900px 0px",
    threshold: 0,
  });

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== q) navigate({ search: { q: input }, replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, q, navigate]);

  const term = q.trim();
  // The request key is the normalised text (case, accents, Arabic letter variants, punctuation and
  // spaces folded): "Spider ", "spider" and "SPIDER!" are one cached request, and anything shorter
  // than MIN_QUERY_LENGTH never reaches the server.
  const searchKey = normalizeText(expandSearchText(term));
  const canSearch = searchKey.length >= MIN_QUERY_LENGTH;
  useEffect(() => {
    if (!canSearch) return;
    const t = setTimeout(() => {
      try {
        trackEvent("Search", { search_string: term });
      } catch {
        /* noop */
      }
      pushRecentSearch(term);
    }, 400);
    return () => clearTimeout(t);
  }, [term, canSearch]);

  const { data, isFetching } = useQuery<PosterRow[]>({
    queryKey: ["search-posters", searchKey],
    enabled: canSearch,
    staleTime: 60_000,
    // Keep the previous results on screen while the next ones load: no skeleton flash and no
    // layout jump between pauses in typing.
    placeholderData: (prev) => prev,
    // react-query aborts the in-flight request when the text changes (signal), so only the
    // latest text is ever answered.
    queryFn: async ({ signal }) => {
      return searchPostersPublic({
        data: { q: searchKey, limit: 120 },
        signal,
      }) as Promise<PosterRow[]>;
    },
  });

  // Shown only when a search comes back empty: popular searches that DID find something.
  const { data: trending = [] } = useQuery<string[]>({
    queryKey: ["trending-searches"],
    staleTime: 5 * 60_000,
    queryFn: async () => getTrendingSearchesPublic({ data: { limit: 8 } }),
  });

  const results = canSearch ? (data ?? []) : [];
  // Collections / sub-collections the text names (e.g. "spiderman" or "سبايدر مان"): each gets a
  // button that opens its own page. Uses the already-loaded category list: no extra request.
  const { data: allCategories } = useCategories(canSearch);
  const shortcuts = useMemo(
    () => (canSearch && allCategories ? matchCategories(term, allCategories, 4) : []),
    [canSearch, allCategories, term],
  );
  const visibleResults = results.slice(0, visibleCount);
  const images = usePosterResponsiveImages(
    results.map((p) => p.id),
    "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw",
  );

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
  }, [term]);

  useEffect(() => {
    setVisibleCount((count) => Math.min(results.length, Math.max(INITIAL_VISIBLE_RESULTS, count)));
  }, [results.length]);

  useEffect(() => {
    if (!sentinelInView || visibleCount >= results.length) return;
    setVisibleCount((count) => Math.min(results.length, count + RESULTS_CHUNK));
  }, [results.length, sentinelInView, visibleCount]);

  useEffect(() => {
    if (!canSearch || isFetching) return;
    const t = setTimeout(() => {
      try {
        logSearchQuery(term, results.length);
      } catch {
        /* noop */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [term, canSearch, isFetching, results.length]);

  return (
    <div className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        {t("search.title")}
      </div>
      <h1 className="text-display mt-1 text-4xl sm:text-5xl">{t("search.title")}</h1>

      <div className="mt-6 max-w-2xl">
        <SearchBox variant="page" autoFocus initialValue={input} onChange={setInput} />
      </div>

      <div className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
        {term
          ? !canSearch
            ? t("search.minChars", { defaultValue: "Type at least 2 characters" })
            : isFetching
              ? t("common.search") + "…"
              : `${results.length} ${results.length === 1 ? t("search.result") : t("search.results")}`
          : t("search.searchHint")}
      </div>

      <CategoryShortcuts categories={shortcuts} className="mt-4" />

      {canSearch && results.length === 0 && !isFetching ? (
        <div className="mt-10 rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <div>{t("search.noResults")}</div>
          {trending.length > 0 ? (
            <div className="mt-5">
              <div className="mb-2 text-xs uppercase tracking-widest">
                {t("search.tryThese", { defaultValue: "Popular searches" })}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {trending.map((s) => (
                  <Link
                    key={s}
                    to="/search"
                    search={{ q: s }}
                    className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:border-primary"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {canSearch && isFetching && results.length === 0 ? (
            // Hold the results' space while the search runs; otherwise the
            // page is short and the footer, already on screen, jumps down
            // when the results arrive.
            <div
              aria-hidden="true"
              className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-sm bg-muted/30" />
              ))}
            </div>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visibleResults.map((p) => {
              const image = images[p.id];
              return (
                <Link
                  key={p.id}
                  to="/category/$slug"
                  params={{ slug: p.category_slug ?? "" }}
                  search={{ poster: p.id }}
                  className="group overflow-hidden rounded-sm border border-border bg-card transition hover:border-primary"
                >
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <WishlistHeart posterId={p.id} />
                    <PosterBadge badge={p.badge} />
                    <FramedArtwork
                      posterUrl={resolveProductArtwork(p, images)}
                      avifSrcSet={image?.avifSrcSet}
                      webpSrcSet={image?.webpSrcSet}
                      sizes={image?.sizes}
                      title={p.title}
                      aspectClassName="aspect-[3/4]"
                      loading="lazy"
                      className="h-full w-full"
                      posterFallbackUrl={p.image_url || ""}
                    />
                  </div>
                  <div className="p-2">
                    <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.category_name ?? "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {visibleCount < results.length ? <div ref={sentinelRef} className="h-12" /> : null}
        </>
      )}
    </div>
  );
}
