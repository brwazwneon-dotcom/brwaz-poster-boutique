import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FramedArtwork } from "@/components/FramedArtwork";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "@/hooks/use-in-view";
import { usePosterResponsiveImages, type ResponsivePosterImage } from "@/lib/public-images";
import { cn } from "@/lib/utils";
import { useActiveAutoplay } from "@/hooks/use-active-autoplay";

type PosterRow = {
  id: string;
  title: string;
  category_id: string | null;
  featured: boolean | null;
  trending: boolean | null;
  sales_count: number | null;
  views_count: number | null;
  created_at: string;
  categories: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type GalleryItem = {
  id: string;
  title: string;
  collectionTitle: string;
  collectionSlug: string;
  featured: boolean;
  image: ResponsivePosterImage;
};

type WallSlot = {
  index: number;
  colSpan: number;
  rowSpan: number;
  tilt: number;
  tone: "black" | "walnut" | "brass" | "charcoal";
};

// Stable fallback so `rows` keeps the same identity across renders while
// the query is loading. A fresh `[]` literal there would flow into the
// `items`/`itemById` useMemos and then into the useEffect keyed on
// [itemById, items] below, re-firing it (and its setState) every render —
// the same "Maximum update depth exceeded" pattern found and fixed in
// HeroBannerSlider.tsx and src/lib/public-images.ts on 2026-09-11.
const EMPTY_ROWS: PosterRow[] = [];

type WallFrame = {
  slot: WallSlot;
  item: GalleryItem;
};

const SLOT_PATTERN: Array<Omit<WallSlot, "index">> = [
  { colSpan: 2, rowSpan: 4, tilt: -0.25, tone: "black" },
  { colSpan: 3, rowSpan: 5, tilt: 0.18, tone: "brass" },
  { colSpan: 2, rowSpan: 3, tilt: 0.1, tone: "charcoal" },
  { colSpan: 2, rowSpan: 4, tilt: -0.12, tone: "walnut" },
  { colSpan: 3, rowSpan: 4, tilt: 0.22, tone: "black" },
  { colSpan: 2, rowSpan: 5, tilt: -0.16, tone: "brass" },
  { colSpan: 2, rowSpan: 3, tilt: 0.15, tone: "charcoal" },
  { colSpan: 3, rowSpan: 5, tilt: -0.2, tone: "walnut" },
  { colSpan: 2, rowSpan: 4, tilt: 0.12, tone: "black" },
  { colSpan: 2, rowSpan: 3, tilt: -0.08, tone: "brass" },
  { colSpan: 3, rowSpan: 4, tilt: 0.16, tone: "charcoal" },
  { colSpan: 2, rowSpan: 5, tilt: -0.18, tone: "walnut" },
];

const FRAME_COUNT = 36;
const BAND_SIZE = 9;

const WALL_SLOTS: WallSlot[] = Array.from({ length: FRAME_COUNT }, (_, index) => ({
  index,
  ...SLOT_PATTERN[index % SLOT_PATTERN.length],
}));

function collectionOf(row: PosterRow) {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    title: category?.name || "Featured Collection",
    slug: category?.slug || "movies",
  };
}

function seedVisibleIds(items: GalleryItem[], count: number) {
  return items.slice(0, count).map((item) => item.id);
}

function rotateVisibleIds(current: string[], items: GalleryItem[]) {
  if (current.length === 0) return current;

  const itemIds = items.map((item) => item.id);
  const itemSet = new Set(itemIds);
  const next = current.filter((id) => itemSet.has(id));
  if (next.length !== current.length) {
    const missing = current.length - next.length;
    next.push(...itemIds.filter((id) => !next.includes(id)).slice(0, missing));
  }

  const available = itemIds.filter((id) => !next.includes(id));
  if (available.length === 0) return next;

  const changeCount = Math.min(available.length, 3 + Math.floor(Math.random() * 2), next.length);
  const indices = new Set<number>();
  while (indices.size < changeCount) indices.add(Math.floor(Math.random() * next.length));

  const used = new Set(next);
  const replacements = [...available].sort(() => Math.random() - 0.5);
  for (const index of indices) {
    const previous = next[index - 1];
    const following = next[index + 1];
    const replacementIndex = replacements.findIndex(
      (id) => !used.has(id) && id !== previous && id !== following,
    );
    if (replacementIndex === -1) continue;
    const [replacement] = replacements.splice(replacementIndex, 1);
    used.delete(next[index]);
    next[index] = replacement;
    used.add(replacement);
  }

  return next;
}

function chunkFrames(frames: WallFrame[]) {
  const bands: WallFrame[][] = [];
  for (let i = 0; i < frames.length; i += BAND_SIZE) bands.push(frames.slice(i, i + BAND_SIZE));
  return bands;
}

export function WallOfInspiration() {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionRef, autoplayActive] = useActiveAutoplay<HTMLElement>();

  const { data: rows = EMPTY_ROWS, isLoading } = useQuery({
    queryKey: ["wall-of-inspiration-posters"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PosterRow[]> => {
      const { data, error } = await supabase
        .from("posters")
        .select(
          "id,title,category_id,featured,trending,sales_count,views_count,created_at,categories(name,slug)",
        )
        .eq("hidden", false)
        .not("category_id", "is", null)
        .order("featured", { ascending: false })
        .order("trending", { ascending: false })
        .order("sales_count", { ascending: false, nullsFirst: false })
        .order("views_count", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(72);
      if (error) throw error;
      return (data ?? []) as unknown as PosterRow[];
    },
  });

  const variantImages = usePosterResponsiveImages(
    rows.map((row) => row.id),
    "(max-width: 640px) 42vw, (max-width: 1024px) 24vw, 12vw",
  );

  const items = useMemo<GalleryItem[]>(() => {
    const seen = new Set<string>();
    const out: GalleryItem[] = [];
    for (const row of rows) {
      const image = variantImages[row.id];
      if (!image || seen.has(row.id)) continue;
      const collection = collectionOf(row);
      out.push({
        id: row.id,
        title: row.title,
        collectionTitle: collection.title,
        collectionSlug: collection.slug,
        featured: Boolean(row.featured || row.trending),
        image,
      });
      seen.add(row.id);
    }
    return out;
  }, [rows, variantImages]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  useEffect(() => {
    if (items.length === 0) {
      setVisibleIds([]);
      return;
    }
    setVisibleIds((current) => {
      const valid = current.filter((id) => itemById.has(id)).slice(0, WALL_SLOTS.length);
      if (valid.length >= Math.min(WALL_SLOTS.length, items.length)) return valid;
      const filled = [...valid];
      for (const id of seedVisibleIds(items, WALL_SLOTS.length)) {
        if (filled.length >= Math.min(WALL_SLOTS.length, items.length)) break;
        if (!filled.includes(id)) filled.push(id);
      }
      return filled;
    });
  }, [itemById, items]);

  useEffect(() => {
    if (!autoplayActive || items.length <= visibleIds.length || visibleIds.length === 0) return;
    const interval = window.setInterval(
      () => {
        setVisibleIds((current) => rotateVisibleIds(current, items));
      },
      5400 + Math.floor(Math.random() * 700),
    );
    return () => window.clearInterval(interval);
  }, [autoplayActive, items, visibleIds.length]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const frames = useMemo<WallFrame[]>(() => {
    return visibleIds
      .map((id, index) => {
        const item = itemById.get(id);
        const slot = WALL_SLOTS[index];
        return item && slot ? { item, slot } : null;
      })
      .filter((frame): frame is WallFrame => Boolean(frame));
  }, [itemById, visibleIds]);

  const bands = useMemo(() => chunkFrames(frames), [frames]);

  const handleSelect = (item: GalleryItem) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setSelectedId(item.id);
    timerRef.current = window.setTimeout(() => {
      navigate({ to: "/category/$slug", params: { slug: item.collectionSlug } });
    }, 520);
  };

  return (
    <section
      ref={sectionRef}
      className="wall-inspiration-section"
      aria-labelledby="wall-inspiration-title"
    >
      <div className="wall-inspiration-light" aria-hidden="true" />
      <div className="container-page relative z-10 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] uppercase tracking-[0.55em] text-primary/70">
            Private Gallery Wall
          </p>
          <h2 id="wall-inspiration-title" className="text-display mt-4 text-5xl sm:text-7xl">
            The Wall of Inspiration
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
            A cinematic wall of real BRWAZWNEON collections, framed like museum pieces and quietly
            refreshed as you move through the gallery.
          </p>
        </div>

        <div
          className="wall-inspiration-rail mt-14 sm:mt-20"
          data-active={selectedId ? "true" : "false"}
        >
          {isLoading && bands.length === 0 ? (
            <WallSkeleton />
          ) : bands.length > 0 ? (
            bands.map((band, index) => (
              <VirtualWallBand
                key={index}
                band={band}
                bandIndex={index}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            ))
          ) : (
            <div className="wall-inspiration-empty">
              The gallery is preparing its next collection wall.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function VirtualWallBand({
  band,
  bandIndex,
  selectedId,
  onSelect,
}: {
  band: WallFrame[];
  bandIndex: number;
  selectedId: string | null;
  onSelect: (item: GalleryItem) => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({
    rootMargin: "900px 0px",
    threshold: 0.05,
    once: false,
  });
  return (
    <div ref={ref} className="wall-inspiration-band-wrap">
      {inView ? (
        <div
          className="wall-inspiration-band"
          style={{ "--band-index": bandIndex } as CSSProperties}
        >
          {band.map((frame, index) => (
            <WallFrameCard
              key={frame.slot.index}
              frame={frame}
              localIndex={index}
              selected={selectedId === frame.item.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WallFrameCard({
  frame,
  localIndex,
  selected,
  onSelect,
}: {
  frame: WallFrame;
  localIndex: number;
  selected: boolean;
  onSelect: (item: GalleryItem) => void;
}) {
  const { item, slot } = frame;
  const style = {
    "--wall-col": slot.colSpan,
    "--wall-row": slot.rowSpan,
    "--wall-tilt": `${slot.tilt}deg`,
    "--frame-delay": `${localIndex * 72}ms`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={cn(
        "wall-inspiration-frame",
        `wall-inspiration-frame-${slot.tone}`,
        selected && "is-selected",
      )}
      style={style}
      onClick={() => onSelect(item)}
      aria-label={`Open ${item.collectionTitle} collection`}
    >
      <span className="wall-inspiration-wire" aria-hidden="true" />
      <span className="wall-inspiration-nail" aria-hidden="true" />
      <span className="wall-inspiration-object" key={item.id}>
        <FramedArtwork
          posterUrl={item.image.src}
          avifSrcSet={item.image.avifSrcSet}
          webpSrcSet={item.image.webpSrcSet}
          sizes={item.image.sizes}
          title={item.title}
          loading="lazy"
          className="wall-inspiration-art"
        />
      </span>
      <span className="wall-inspiration-caption">
        <span>{item.collectionTitle}</span>
        <strong>{item.featured ? "Featured artwork" : item.title}</strong>
      </span>
    </button>
  );
}

function WallSkeleton() {
  return (
    <div className="wall-inspiration-band is-skeleton" aria-hidden="true">
      {WALL_SLOTS.slice(0, BAND_SIZE).map((slot) => (
        <div
          key={slot.index}
          className="wall-inspiration-frame wall-inspiration-skeleton-frame"
          style={
            {
              "--wall-col": slot.colSpan,
              "--wall-row": slot.rowSpan,
              "--wall-tilt": `${slot.tilt}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
