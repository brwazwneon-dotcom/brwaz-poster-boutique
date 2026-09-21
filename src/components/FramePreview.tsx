import { memo, type ReactNode, useEffect, useRef, useState } from "react";
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
  /**
   * Size the frame from the space its parent gives it instead of from its own
   * width: the largest box of `ratio` (width / height) that fits inside the
   * parent, which must be a size container (`container-type: size`). The images
   * inside are absolutely positioned, so their intrinsic size never takes part.
   */
  fit?: boolean;
  /** Frame width / height. Only used with `fit`; the default matches `aspect-[2/3]`. */
  ratio?: number;
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
  fit,
  ratio = 2 / 3,
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
  const hasPoster = !!posterUrl;
  const useMockup = !bare && !!m.image;

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

  // Resets the skeleton whenever the poster itself changes (a different
  // id, e.g. swapping which card this slot renders). Deliberately no
  // artificial timeout hiding the skeleton after a fixed delay — it used
  // to hide at a hardcoded 2s regardless of whether the poster had
  // actually finished loading. Every card sharing the sitewide
  // MAX_CONCURRENT=6 image-loader-queue (image-loader-queue.ts) waits its
  // turn behind however many other images are already mounted (category
  // grid, Related Products and Recently Viewed can all be on one page at
  // once), so a card near the back of that queue routinely took longer
  // than 2s — the skeleton would vanish while the poster still hadn't
  // loaded, leaving a bare black frame opening that looked exactly like a
  // broken image. Now the skeleton simply stays until posterLoaded
  // actually flips true (SafeImage's onLoad below), which is correct
  // regardless of how long the queue takes.
  useEffect(() => {
    setPosterLoaded(artwork ? true : !hasPoster);
  }, [artwork, hasPoster, posterUrl]);

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
        "relative isolate overflow-hidden",
        fit ? "shrink-0" : ["w-full", aspectClassName],
        bare
          ? "bg-black/80 p-[7%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_12px_18px_rgba(0,0,0,0.35)]"
          : fit
            ? "drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
            : "drop-shadow-[0_25px_35px_rgba(0,0,0,0.55)]",
        className,
      )}
      style={{
        backgroundColor: "transparent",
        ...(fit && {
          aspectRatio: String(ratio),
          width: `min(100cqw, calc(100cqh * ${ratio}))`,
        }),
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
            onLoad={() => {
              if (posterUrl) setPosterLoaded(true);
            }}
          />
        )}
        {!artwork && !posterLoaded && (
          // This is now the ONLY loading indicator for the poster itself
          // (a separate spinner overlay used to cover it, on its own
          // 2s timeout unrelated to whether the image had actually
          // loaded — see the timing fix above). Bumped from a barely-
          // visible 0.06-0.18 gradient to something that actually reads
          // as "loading" rather than "blank", since it's the only signal
          // left for however long this card waits behind others in the
          // shared image-loader-queue.
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[3] animate-pulse"
            style={{
              background:
                "linear-gradient(110deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.28) 45%, rgba(255,255,255,0.10) 100%)",
              backgroundColor: "rgba(255,255,255,0.12)",
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
        />
      )}
    </div>
  );
});
