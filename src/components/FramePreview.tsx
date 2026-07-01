import { useFrameMockups, type FrameMockup, type FrameMockups } from "@/lib/use-settings";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";
import { SafeImage } from "@/components/SafeImage";
import { normalizeEditSettings, type EditSettings } from "@/lib/poster-edit";
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

  // Swatch fallback so the matte/frame still reads when no mockup image is set.
  const matte =
    key === "white" ? "#f3f3f0" : key === "wood" ? "#3a2515" : "#0a0a0a";

  const s: EditSettings = normalizeEditSettings(editSettings);
  // Translate as % so it scales with the printable area size.
  const tx = (s.offsetX ?? 0) * 100;
  const ty = (s.offsetY ?? 0) * 100;
  const scale = Math.max(0.1, s.zoom || 1);
  // Combine per-poster edit settings with admin calibration for this frame template.
  const adminScale = Math.max(0.1, m.scale ?? 1);
  const sx = Math.max(0.1, s.stretchX || 1) * scale * adminScale;
  const sy = Math.max(0.1, s.stretchY || 1) * scale * adminScale;
  const rotate = (s.rotate || 0) + (m.rotate ?? 0);
  const skewX = m.skewX ?? 0;
  const skewY = m.skewY ?? 0;
  const rotateX = m.rotateX ?? 0;
  const rotateY = m.rotateY ?? 0;
  const perspective = Math.max(200, m.perspective ?? 1000);
  const objectFit = s.fit === "fit" ? "contain" : "cover";
  const posterTransform = `translate3d(${tx}%, ${ty}%, 0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${rotate}deg) skew(${skewX}deg, ${skewY}deg) scale(${sx}, ${sy})`;
  const borderRadius = `${m.borderRadius ?? 0}%`;

  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden",
        aspectClassName,
        !bare && "drop-shadow-[0_25px_35px_rgba(0,0,0,0.55)]",
        className,
      )}
      style={{ backgroundColor: matte }}
      title={title}
    >
      {/* Poster artwork — clipped to the printable area, *behind* the frame PNG */}
      <div
        className="absolute overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.18)]"
        style={{
          top: `${m.top}%`,
          left: `${m.left}%`,
          width: `${m.width}%`,
          height: `${m.height}%`,
          borderRadius,
          perspective: `${perspective}px`,
          transformStyle: "preserve-3d",
        }}
      >
        <SafeImage
          src={posterUrl}
          alt={title ?? ""}
          loading={loading}
          className="h-full w-full select-none"
          draggable={false}
          style={{
            objectFit,
            transform: posterTransform,
            transformOrigin: "center center",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
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

      {/* Transparent PNG frame overlay — sits on top of the artwork like a clipping mask */}
      {m.image && (
        <img
          src={m.image}
          alt=""
          loading={loading}
          decoding="async"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-fill select-none"
          draggable={false}
        />
      )}
    </div>
  );
}