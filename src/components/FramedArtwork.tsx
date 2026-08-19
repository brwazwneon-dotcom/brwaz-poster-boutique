import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";
import { FramePreview } from "./FramePreview";

type Props = {
  posterUrl: string;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes?: string;
  title?: string;
  className?: string;
  aspectClassName?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  editSettings?: unknown;
  frameType?: FrameTypeId;
  color?: FrameColorId;
  posterFallbackUrl?: string;
};

export function FramedArtwork({
  posterUrl,
  avifSrcSet,
  webpSrcSet,
  sizes,
  title,
  className,
  aspectClassName,
  loading,
  fetchPriority,
  editSettings,
  frameType = "pvc",
  color = "black",
  posterFallbackUrl,
}: Props) {
  return (
    <FramePreview
      posterUrl={posterUrl}
      avifSrcSet={avifSrcSet}
      webpSrcSet={webpSrcSet}
      sizes={sizes}
      title={title}
      className={className}
      aspectClassName={aspectClassName}
      loading={loading}
      fetchPriority={fetchPriority}
      editSettings={editSettings}
      frameType={frameType}
      color={color}
      posterFallbackUrl={posterFallbackUrl}
    />
  );
}
