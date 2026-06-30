import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/meta-pixel";
import { logSearchQuery } from "@/lib/analytics";
import { SearchBox, pushRecentSearch } from "@/components/SearchBox";

const schema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(schema),
  head: () => ({
    meta: [
      { title: "Search — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
    ],
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
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [input, setInput] = useState(q);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== q) navigate({ search: { q: input }, replace: true });
    }, 180);
    return () => clearTimeout(t);
  }, [input, q, navigate]);

  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const t = setTimeout(() => {
      try { trackEvent("Search", { search_string: term }); } catch { /* noop */ }
      pushRecentSearch(term);
    }, 400);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ["search-posters", term],
    enabled: term.length >= 1,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_posters", { q: term, lim: 120 });
      if (error) throw error;
      return (data ?? []) as PosterRow[];
    },
  });

  const results = data ?? [];

  // Log search query once per stable term (after results return).
  useEffect(() => {
    if (term.length < 2 || isFetching) return;
    const t = setTimeout(() => {
      try { logSearchQuery(term, results.length); } catch { /* noop */ }
    }, 600);
    return () => clearTimeout(t);
  }, [term, isFetching, results.length]);

  return (
    <div className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Search</div>
      <h1 className="text-display mt-1 text-4xl sm:text-5xl">Find your poster</h1>

      <div className="mt-6 max-w-2xl">
        <SearchBox
          variant="page"
          autoFocus
          initialValue={input}
          onChange={setInput}
        />
      </div>

      <div className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
        {term ? (isFetching ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`) : "Type to search"}
      </div>

      {term && results.length === 0 && !isFetching ? (
        <div className="mt-10 rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No posters match "{term}".
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {results.map((p) => (
              <Link
                key={p.id}
                to="/category/$slug"
                params={{ slug: p.category_slug ?? "" }}
                className="group overflow-hidden rounded-sm border border-border bg-card transition hover:border-primary"
              >
                <div className="relative aspect-[3/4] overflow-hidden">
                  <WishlistHeart posterId={p.id} />
                  <PosterBadge badge={p.badge} />
                  <FramePreview
                    posterUrl={p.image_url}
                    title={p.title}
                    aspectClassName="aspect-[3/4]"
                    bare
                    loading="lazy"
                    className="h-full w-full"
                  />
                </div>
                <div className="p-2">
                  <div className="truncate text-xs">{p.title}</div>
                  <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                    {p.category_name ?? "—"}
                  </div>
                </div>
              </Link>
          ))}
        </div>
      )}
    </div>
  );
}