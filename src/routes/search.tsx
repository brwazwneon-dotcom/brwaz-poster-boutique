import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/lib/use-categories";

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
  tags: string[] | null;
};

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [input, setInput] = useState(q);
  const { data: categories = [] } = useCategories();

  // sync input with URL
  useEffect(() => setInput(q), [q]);

  // debounce URL update for typing
  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== q) navigate({ search: { q: input }, replace: true });
    }, 200);
    return () => clearTimeout(t);
  }, [input, q, navigate]);

  const term = q.trim();
  const { data, isFetching } = useQuery({
    queryKey: ["search-posters", term],
    enabled: term.length >= 1,
    staleTime: 30_000,
    queryFn: async () => {
      // Match by category slug/name too: prefilter category ids client-side
      const lower = term.toLowerCase();
      const matchedCategoryIds = categories
        .filter(
          (c) =>
            c.name.toLowerCase().includes(lower) ||
            c.slug.toLowerCase().includes(lower),
        )
        .map((c) => c.id);

      const orParts: string[] = [
        `title.ilike.%${term}%`,
        `tags.cs.{${term}}`,
        `description.ilike.%${term}%`,
      ];
      if (matchedCategoryIds.length) {
        orParts.push(`category_id.in.(${matchedCategoryIds.join(",")})`);
      }

      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id,tags")
        .eq("hidden", false)
        .or(orParts.join(","))
        .limit(120);
      if (error) throw error;
      return (data ?? []) as PosterRow[];
    },
  });

  const results = data ?? [];

  return (
    <div className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Search</div>
      <h1 className="text-display mt-1 text-4xl sm:text-5xl">Find your poster</h1>

      <div className="relative mt-6 max-w-2xl">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Messi, Marvel, BMW, One Piece…"
          className="w-full rounded-sm border border-border bg-card py-4 pl-11 pr-4 text-base outline-none focus:border-primary"
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
          {results.map((p) => {
            const cat = categories.find((c) => c.id === p.category_id);
            return (
              <Link
                key={p.id}
                to="/category/$slug"
                params={{ slug: cat?.slug ?? "" }}
                className="group overflow-hidden rounded-sm border border-border bg-card transition hover:border-primary"
              >
                <div className="aspect-[3/4] overflow-hidden">
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
                    {cat?.name ?? "—"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}