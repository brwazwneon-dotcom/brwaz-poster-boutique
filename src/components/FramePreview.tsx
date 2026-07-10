import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { normalizeEditSettings, type EditSettings } from "@/lib/poster-edit";
import { cn } from "@/lib/utils";
import { useFrameMockups, type FrameMockup, type FrameMockups } from "@/lib/use-settings";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";

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
  frameType?: FrameTypeId;
  color?: FrameColorId;
  className?: string;
  /** Tailwind aspect class for the outer wrapper. Defaults to 2/3. */
  aspectClassName?: string;
  /** When true, no glass reflection / shadow (used for tiny thumbs). */
  bare?: boolean;
  loading?: "lazy" | "eager";
  /** Persisted edit settings (drag/zoom/rotate/stretch). Applied via CSS only. */
  editSettings?: unknown;
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
  frameType = "pvc",
  color = "black",
  className,
  aspectClassName = "aspect-[2/3]",
  bare,
  loading = "lazy",
  editSettings,
}: Props) {
  const mockups = useFrameMockups();
  const key = pickMockupKey(frameType, color);
  const m: FrameMockup = mockups[key];
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [mockupLoaded, setMockupLoaded] = useState(false);
  const allLoaded = posterLoaded && mockupLoaded;
  // Always use the uploaded PNG mockups — no CSS-based frame fallback.

  const s: EditSettings = normalizeEditSettings(editSettings);
  // Translate as % so it scales with the printable area size.
  const tx = (s.offsetX ?? 0) * 100;
  const ty = (s.offsetY ?? 0) * 100;
  const scale = Math.max(0.1, s.zoom || 1);
  // Combine per-poster edit settings with admin calibration for this frame template.
  const adminScale = Math.max(0.1, m.scale ?? 1);
  const flipX = m.flipX ? -1 : 1;
  const flipY = m.flipY ? -1 : 1;
  const sx = scale * adminScale * flipX;
  const sy = scale * adminScale * flipY;
  const rotate = (s.rotate || 0) + (m.rotate ?? 0);
  const skewX = m.skewX ?? 0;
  const skewY = m.skewY ?? 0;
  const rotateX = m.rotateX ?? 0;
  const rotateY = m.rotateY ?? 0;
  const perspective = Math.max(200, m.perspective ?? 1000);
  // Always crop-cover so the printable area is fully filled and no black
  // bars appear under posters with a different aspect ratio.
  const objectFit = "cover" as const;
  const showExtendedBackground = false;
  const posterTransform = `translate3d(${tx}%, ${ty}%, 0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${rotate}deg) skew(${skewX}deg, ${skewY}deg) scale(${sx}, ${sy})`;
  const borderRadius = `${m.borderRadius ?? 0}%`;

  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden",
        aspectClassName,
        bare
          ? "drop-shadow-[0_12px_18px_rgba(0,0,0,0.35)]"
          : "drop-shadow-[0_25px_35px_rgba(0,0,0,0.55)]",
        className,
      )}
      style={{
        backgroundColor: "transparent",
      }}
      title={title}
    >
      {/* Poster artwork — clipped to the printable area, *behind* the frame PNG */}
      <div
        className="absolute z-0 overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.18)]"
        style={{
          top: `${m.top}%`,
          left: `${m.left}%`,
          width: `${m.width}%`,
          height: `${m.height}%`,
          borderRadius,
          perspective: `${perspective}px`,
          transformStyle: "preserve-3d",
          background:
            "linear-gradient(180deg, rgba(239,237,230,0.96), rgba(218,214,204,0.96))",
        }}
      >
        <SafeImage
          src={posterUrl}
          alt=""
          aria-hidden="true"
          loading={loading}
          className={cn(
            "pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover opacity-70 blur-xl scale-110",
            showExtendedBackground ? "block" : "hidden",
          )}
          draggable={false}
          style={{ objectPosition: "center center" }}
        />
        <SafeImage
          src={posterUrl}
          alt={title ?? ""}
          loading={loading}
          className="relative z-[1] h-full w-full select-none"
          draggable={false}
          style={{
            objectFit,
            objectPosition: "center center",
            transform: posterTransform,
            transformOrigin: "center center",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
          onLoad={() => setPosterLoaded(true)}
        />
        {/* Skeleton shimmer while the poster image is loading — prevents
            the black matte from reading as a broken/empty card. */}
        {!posterLoaded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[3] animate-pulse"
            style={{
              background:
                "linear-gradient(110deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.06) 100%)",
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          />
        )}
        {/* Glass reflection across the print area */}
        {!bare && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[4]"
            style={{
              background:
                "linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 22%, rgba(255,255,255,0) 45%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.08) 100%)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>

      {/* Transparent PNG frame overlay — sits on top of the artwork like a clipping mask */}
      {m.image && (
        <img
          src={m.image}
          alt=""
          loading={loading}
          decoding="async"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill select-none"
          draggable={false}
        />
      )}
    </div>
  );
}