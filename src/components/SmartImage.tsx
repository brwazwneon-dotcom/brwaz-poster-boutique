import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X, Download, ZoomIn, AlertTriangle } from "lucide-react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";
import { useImageVariant } from "@/lib/image-variants";
import { cn } from "@/lib/utils";

/**
 * SmartImage — one component for every product / order / customer photo.
 *
 *  - Lazy loaded (native `loading="lazy"` + IntersectionObserver skeleton).
 *  - Uses the small `thumbUrl` for the grid tile, falls back to `src`.
 *  - Click opens a fullscreen Lightbox that loads `previewUrl` (high quality)
 *    with a skeleton and a Download-Original button.
 *  - Optional print-quality warning badge for low-DPI customer uploads.
 */
export function SmartImage({
  src,
  thumbUrl,
  previewUrl,
  originalUrl,
  sourceTable,
  sourceId,
  alt,
  aspect = "square",
  className,
  imgClassName,
  fit = "cover",
  clickable = true,
  showDownload = true,
  qualityWarning,
  meta,
  style,
}: {
  src: string;
  /** Small optimized thumbnail (600px). Falls back to `src`. */
  thumbUrl?: string | null;
  /** High-quality preview (1600px) for the lightbox. Falls back to `originalUrl` or `src`. */
  previewUrl?: string | null;
  /** Original untouched file for print quality downloads. */
  originalUrl?: string | null;
  /** When provided together with sourceId, SmartImage auto-loads optimized
   *  variants from `image_variants` (thumb for the tile, large for the lightbox). */
  sourceTable?: string;
  sourceId?: string | null;
  alt: string;
  aspect?: "square" | "portrait" | "landscape" | "auto";
  className?: string;
  imgClassName?: string;
  fit?: "cover" | "contain";
  clickable?: boolean;
  showDownload?: boolean;
  qualityWarning?: { message: string } | null;
  meta?: {
    filename?: string;
    width?: number;
    height?: number;
    sizeBytes?: number;
    mime?: string;
  };
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const autoThumb = useImageVariant(sourceTable ?? "", sourceId ?? null, "thumb", null);
  const autoLarge = useImageVariant(sourceTable ?? "", sourceId ?? null, "large", null);
  const thumb = thumbUrl || autoThumb || src;
  const preview = previewUrl || autoLarge || originalUrl || src;

  const aspectClass =
    aspect === "square"
      ? "aspect-square"
      : aspect === "portrait"
        ? "aspect-[2/3]"
        : aspect === "landscape"
          ? "aspect-[3/2]"
          : "";

  return (
    <>
      <button
        type="button"
        onClick={() => clickable && setOpen(true)}
        className={cn(
          "group relative block w-full overflow-hidden rounded-md border border-white/10 bg-black/40",
          aspectClass,
          clickable ? "cursor-zoom-in" : "cursor-default",
          className,
        )}
        style={style}
        aria-label={alt}
      >
        {!loaded && !errored && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5" />
        )}
        <img
          src={errored ? IMAGE_FALLBACK : thumb}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setErrored(true);
            setLoaded(true);
          }}
          className={cn(
            "h-full w-full transition-opacity duration-200",
            fit === "cover" ? "object-cover" : "object-contain",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
        {qualityWarning && (
          <div className="pointer-events-none absolute inset-x-1 top-1 flex items-center gap-1 rounded-sm bg-amber-500/95 px-2 py-0.5 text-[10px] font-semibold text-black">
            <AlertTriangle className="h-3 w-3" />
            {qualityWarning.message}
          </div>
        )}
        {clickable && (
          <div className="pointer-events-none absolute bottom-1 end-1 rounded-full bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </button>
      {open &&
        createPortal(
          <Lightbox
            src={preview}
            originalUrl={originalUrl}
            alt={alt}
            meta={meta}
            qualityWarning={qualityWarning}
            showDownload={showDownload}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

function Lightbox({
  src,
  originalUrl,
  alt,
  meta,
  qualityWarning,
  showDownload,
  onClose,
}: {
  src: string;
  originalUrl?: string | null;
  alt: string;
  meta?: {
    filename?: string;
    width?: number;
    height?: number;
    sizeBytes?: number;
    mime?: string;
  };
  qualityWarning?: { message: string } | null;
  showDownload: boolean;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, []);

  const downloadUrl = originalUrl || src;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="relative flex max-h-full max-w-6xl flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            className={cn(
              "max-h-[80vh] max-w-full rounded-md object-contain transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

        {(meta || qualityWarning || showDownload) && (
          <div className="mt-4 w-full max-w-3xl rounded-md border border-white/10 bg-black/70 p-3 text-xs text-white/80 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {meta?.filename && (
                  <span className="font-semibold text-white">{meta.filename}</span>
                )}
                {meta?.width && meta?.height && (
                  <span>
                    {meta.width}×{meta.height}px
                  </span>
                )}
                {meta?.sizeBytes != null && <span>{formatSize(meta.sizeBytes)}</span>}
                {meta?.mime && <span className="uppercase">{meta.mime.split("/")[1]}</span>}
              </div>
              {showDownload && (
                <a
                  href={downloadUrl}
                  download={meta?.filename || "original"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Original
                </a>
              )}
            </div>
            {qualityWarning && (
              <div className="mt-2 flex items-start gap-2 rounded-sm bg-amber-500/15 p-2 text-[11px] text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{qualityWarning.message}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
