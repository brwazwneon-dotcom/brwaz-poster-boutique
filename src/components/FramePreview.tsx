import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import { useFrameMockups, type FrameMockup, type FrameMockups } from "@/lib/use-settings";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";
import { registerGridNode, unregisterGridNode } from "@/hooks/use-grid-observer";

export function pickMockupKey(frameType: FrameTypeId, color: FrameColorId): keyof FrameMockups {
  if (frameType === "wood" || color === "wood") return "wood";
  if (color === "white") return "white";
  return "black";
}

type Props = {
  posterUrl: string;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes?: string;
  title?: string;
  frameType?: FrameTypeId;
  color?: FrameColorId;
  className?: string;
  aspectClassName?: string;
  bare?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  editSettings?: unknown;
  artwork?: ReactNode;
  posterFallbackUrl?: string;
};

export const FramePreview = memo(function FramePreview({
  posterUrl,
  avifSrcSet,
  webpSrcSet,
  sizes,
  title,
  frameType = "pvc",
  color = "black",
  className,
  aspectClassName = "aspect-[2/3]",
  bare,
  loading = "lazy",
  fetchPriority,
  editSettings,
  artwork,
  posterFallbackUrl,
}: Props) {
  const mockups = useFrameMockups();
  const key = pickMockupKey(frameType, color);
  const m: FrameMockup = mockups[key];
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [mockupLoaded, setMockupLoaded] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const hasPoster = !!posterUrl;
  const useMockup = !bare && !!m.image;
  const allLoaded = (artwork ? true : posterLoaded) && (!useMockup || mockupLoaded);

  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    registerGridNode(el, () => {});
    return () => {
      unregisterGridNode(el);
    };
  }, []);

  useEffect(() => {
    if (artwork || !hasPoster) {
      setPosterLoaded(true);
      setShowLoading(false);
      return;
    }
    setPosterLoaded(false);
    setShowLoading(true);
    const id = window.setTimeout(() => setShowLoading(false), 2000);
    return () => window.clearTimeout(id);
  }, [artwork, hasPoster]);

  useEffect(() => {
    setMockupLoaded(false);
  }, [m.image]);

  void editSettings;
  const skewX = m.skewX ?? 0;
  const skewY = m.skewY ?? 0;
  const rotateX = m.rotateX ?? 0;
  const rotateY = m.rotateY ?? 0;
  const perspective = Math.max(200, m.perspective ?? 1000);
  const borderRadius = `${m.borderRadius ?? 0}%`;
  // Combines the configured tilt/skew/scale/flip into one transform so
  // the artwork actually follows the mockup's perspective instead of
  // always sitting flat inside the frame opening. Flip is folded into
  // scale (negative = mirrored) rather than a separate transform, so it
  // composes correctly with the rest instead of fighting it.
  const artworkTransform = [
    rotateX ? `rotateX(${rotateX}deg)` : "",
    rotateY ? `rotateY(${rotateY}deg)` : "",
    m.rotate ? `rotate(${m.rotate}deg)` : "",
    skewX ? `skewX(${skewX}deg)` : "",
    skewY ? `skewY(${skewY}deg)` : "",
    `scale(${(m.scale ?? 1) * (m.flipX ? -1 : 1)}, ${(m.scale ?? 1) * (m.flipY ? -1 : 1)})`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate w-full overflow-hidden",
        aspectClassName,
        bare
          ? "bg-black/80 p-[7%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_12px_18px_rgba(0,0,0,0.35)]"
          : "drop-shadow-[0_25px_35px_rgba(0,0,0,0.55)]",
        className,
      )}
      style={{
        backgroundColor: "transparent",
      }}
      title={title}
    >
      <div
        className="frame-opening absolute z-0 overflow-hidden"
        style={{
          top: `${m.top}%`,
          left: `${m.left}%`,
          width: `${m.width}%`,
          height: `${m.height}%`,
          borderRadius,
          perspective: `${perspective}px`,
          transformStyle: "preserve-3d",
          background: "transparent",
          lineHeight: 0,
        }}
      >
        {artwork ? (
          <div className="absolute inset-0 overflow-hidden leading-none [&_img]:block [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:object-center">
            {artwork}
          </div>
        ) : (
          <SafeImage
            src={posterUrl}
            avifSrcSet={avifSrcSet}
            webpSrcSet={webpSrcSet}
            sizes={sizes}
            alt={title ?? ""}
            loading={loading}
            fetchPriority={fetchPriority}
            className="frame-artwork relative z-[1] block h-full w-full select-none object-cover object-center"
            draggable={false}
            fallbackSrc={posterFallbackUrl}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              transform: artworkTransform,
              transformStyle: "preserve-3d",
              backfaceVisibility: "hidden",
            }}
            onLoad={() => { if (posterUrl) setPosterLoaded(true); }}
          />
        )}
        {!artwork && !posterLoaded && (
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

      {useMockup && (
        <img
          src={m.image}
          alt=""
          loading={loading}
          decoding="async"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill select-none"
          draggable={false}
          onLoad={() => setMockupLoaded(true)}
          onError={() => setMockupLoaded(true)}
        />
      )}

      {!bare && !artwork && showLoading && !allLoaded && (
        <div className="pointer-events-none absolute inset-0 z-[30] flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card/90 px-4 py-3 shadow-lg ring-1 ring-border">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Loading
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
