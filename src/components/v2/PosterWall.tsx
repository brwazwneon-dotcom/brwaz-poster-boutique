import { useReveal } from "./Reveal";
import { FramePreview } from "@/components/FramePreview";

export type WallLayout = "20x30" | "30x40";
export const WALL_COUNT: Record<WallLayout, number> = { "20x30": 6, "30x40": 4 };

type WallPoster = { id: string; title: string; image_url: string };

/** 20x30 -> 6 frames (3 top + 3 bottom). 30x40 -> 4 frames in one row.
 *  Cells are identical (CSS grid, one gap token) so spacing is always equal. */
export function PosterWall({
  layout,
  posters,
  color = "black",
}: {
  layout: WallLayout;
  posters: WallPoster[];
  color?: "black" | "white" | "wood";
}) {
  const { ref, ...data } = useReveal<HTMLDivElement>();
  const items = posters.slice(0, WALL_COUNT[layout]);
  if (items.length < WALL_COUNT[layout]) return null; // never render a ragged wall
  return (
    <div ref={ref} className="v2-wall" data-layout={layout} {...data}>
      {items.map((p, i) => (
        <div key={p.id} className="v2-wall-cell" style={{ "--i": i } as React.CSSProperties}>
          <FramePreview
            posterUrl={p.image_url}
            title={p.title}
            color={color}
            loading="lazy"
            aspectClassName={layout === "20x30" ? "aspect-[2/3]" : "aspect-[3/4]"}
            className="h-full w-full"
          />
        </div>
      ))}
    </div>
  );
}
