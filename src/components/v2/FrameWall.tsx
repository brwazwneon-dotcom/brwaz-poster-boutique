import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PosterWall, WALL_COUNT, type WallLayout } from "./PosterWall";
import { Reveal } from "./Reveal";
import { FallingLayer } from "./Motion";
import { cn } from "@/lib/utils";

const LAYOUTS: Array<{ id: WallLayout; label: string; sub: string }> = [
  { id: "20x30", label: "20×30 · 6 frames", sub: "3 on top, 3 below" },
  { id: "30x40", label: "30×40 · 4 frames", sub: "one row of 4" },
];

/** Offer visualisation: shows exactly what a 6-pack (20x30) / 4-pack (30x40) looks like on the wall.
 *  One small query (10 rows) using existing thumbnails; no new assets. */
export function FrameWall({ title, subtitle }: { title?: string; subtitle?: string }) {
  const [layout, setLayout] = useState<WallLayout>("20x30");
  const { data = [] } = useQuery({
    queryKey: ["v2-frame-wall"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url")
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("sales_count", { ascending: false, nullsFirst: false })
        .limit(WALL_COUNT["20x30"]);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; image_url: string }>;
    },
  });
  if (data.length < WALL_COUNT["20x30"]) return null;

  return (
    <section className="relative overflow-hidden border-t border-border">
      <FallingLayer kind="frames" count={12} opacity={0.55} />
      <div className="container-page relative z-10" style={{ paddingBlock: "var(--v2-section-y)" }}>
        <Reveal className="mb-8 text-center">
          <p className="v2-eyebrow">Offers</p>
          <h2 className="text-display mt-3 text-4xl sm:text-6xl">{title || "Build your wall"}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            {subtitle || "Matching frames, equal spacing — pick a set and see it before you order."}
          </p>
          <div
            role="tablist"
            aria-label="Wall layout"
            className="mt-6 inline-flex rounded-sm border border-border p-1"
          >
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={layout === l.id}
                onClick={() => setLayout(l.id)}
                className={cn(
                  "min-h-11 px-4 text-xs uppercase tracking-widest",
                  layout === l.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Reveal>
        <PosterWall key={layout} layout={layout} posters={data} />
        <div className="mt-8 text-center">
          <Link
            to="/offers"
            className="inline-flex min-h-11 items-center rounded-sm border border-border px-6 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            See offers →
          </Link>
        </div>
      </div>
    </section>
  );
}
