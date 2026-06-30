import { useFrameMockups, type FrameMockup, type FrameMockups } from "@/lib/use-settings";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";

/**
 * Picks which mockup variant applies for a given frame type + color.
 * - Wooden Portrait always uses the wood mockup.
 * - PVC uses black or white mockup based on color (with a wood fallback).
 */
export function pickMockupKey(
  frameType: FrameTypeId,
  color: FrameColorId,
): keyof FrameMockups {
  if (frameType === "wood" || color === "wood") return "wood";
  if (color === "white") return "white";
  return "black";
}

type Props = {
  posterUrl: string;
  title?: string;
  frameType: FrameTypeId;
  color: FrameColorId;
  className?: string;
  /** When true, no glass reflection / shadow (used for tiny thumbs). */
  bare?: boolean;
  loading?: "lazy" | "eager";
};

/**
 * Composites a stored poster artwork inside a fixed frame mockup using
 * admin-configured inner printable-area coordinates. The poster is rendered
 * with object-fit: cover at a 2:3 aspect ratio. No extra images are stored;
 * the mockup is purely a visual overlay.
 */
export function FramePreview({
  posterUrl,
  title,
  frameType,
  color,
  className,
  bare,
  loading = "lazy",
}: Props) {
  const mockups = useFrameMockups();
  const key = pickMockupKey(frameType, color);
  const m: FrameMockup = mockups[key];

  // Swatch fallback so the matte/frame still reads when no mockup image is set.
  const matte =
    key === "white" ? "#f3f3f0" : key === "wood" ? "#3a2515" : "#0a0a0a";

  return (
    <div
      className={cn(
        "relative isolate aspect-[2/3] w-full overflow-hidden",
        !bare && "drop-shadow-[0_25px_35px_rgba(0,0,0,0.55)]",
        className,
      )}
      style={{ backgroundColor: matte }}
      title={title}
    >
      {/* Frame mockup photo as background */}
      {m.image && (
        <img
          src={m.image}
          alt=""
          loading={loading}
          decoding="async"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
          draggable={false}
        />
      )}

      {/* Poster artwork — placed inside the printable area, on top of the frame */}
      <div
        className="absolute overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.18)]"
        style={{
          top: `${m.top}%`,
          left: `${m.left}%`,
          width: `${m.width}%`,
          height: `${m.height}%`,
        }}
      >
        <SafeImage
          src={posterUrl}
          alt={title ?? ""}
          loading={loading}
          className="h-full w-full object-cover"
        />
        {/* Glass reflection across the print area */}
        {!bare && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 22%, rgba(255,255,255,0) 45%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.08) 100%)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>
    </div>
  );
}