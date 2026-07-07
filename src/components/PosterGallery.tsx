import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "@/components/FramePreview";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ZoomIn, X } from "lucide-react";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";

type ExtraImage = {
  id: string;
  poster_id: string;
  image_url: string;
  label: string | null;
  kind: string | null;
  sort_order: number;
  is_default: boolean;
};

type Slide =
  | { kind: "frame"; url: string; label: string }
  | { kind: "image"; url: string; label: string };

type Props = {
  posterId: string;
  posterUrl: string;
  title: string;
  frameType: FrameTypeId;
  color: FrameColorId;
  editSettings?: unknown;
};

export function PosterGallery({
  posterId,
  posterUrl,
  title,
  frameType,
  color,
  editSettings,
}: Props) {
  const { data: extras = [] } = useQuery({
    queryKey: ["poster_images", posterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poster_images")
        .select("id,poster_id,image_url,label,kind,sort_order,is_default")
        .eq("poster_id", posterId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExtraImage[];
    },
  });

  const slides: Slide[] = useMemo(() => {
    const base: Slide[] = [
      { kind: "frame", url: posterUrl, label: "Frame Preview" },
    ];
    extras.forEach((e) => {
      base.push({ kind: "image", url: e.image_url, label: e.label || e.kind || "Image" });
    });
    return base;
  }, [extras, posterUrl]);

  // Product previews must always open on the real uploaded frame mockup.
  // Extra images remain selectable, but they are composited with the same
  // mockup renderer so desktop never shows a raw poster image by itself.
  const defaultIndex = 0;

  const [index, setIndex] = useState(defaultIndex);
  const [zoomOpen, setZoomOpen] = useState(false);
  useEffect(() => {
    setIndex(defaultIndex);
  }, [defaultIndex, posterId]);

  const go = (delta: number) =>
    setIndex((i) => (i + delta + slides.length) % slides.length);

  const current = slides[Math.min(index, slides.length - 1)];

  return (
    <div>
      <div className="relative">
        <FramePreview
          posterUrl={current.url}
          title={current.kind === "frame" ? title : `${title} — ${current.label}`}
          frameType={frameType}
          color={color}
          editSettings={editSettings}
          loading="eager"
        />

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/85 backdrop-blur hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/85 backdrop-blur hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="Zoom image"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 backdrop-blur hover:bg-background"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {slides.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "relative aspect-square overflow-hidden rounded-sm border-2 bg-card transition",
                i === index ? "border-primary" : "border-transparent hover:border-border",
              )}
              title={s.label}
            >
              <FramePreview
                posterUrl={s.url}
                frameType={frameType}
                color={color}
                editSettings={editSettings}
                aspectClassName="aspect-square"
                bare
                loading="lazy"
                className="h-full w-full"
              />
            </button>
          ))}
        </div>
      )}

      {zoomOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button
            aria-label="Close zoom"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            onClick={() => setZoomOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <ZoomViewer
            src={current.url}
            alt={title}
            frameType={frameType}
            color={color}
            editSettings={editSettings}
          />
        </div>
      )}
    </div>
  );
}

function ZoomViewer({
  src,
  alt,
  frameType,
  color,
  editSettings,
}: {
  src: string;
  alt: string;
  frameType: FrameTypeId;
  color: FrameColorId;
  editSettings?: unknown;
}) {
  const [scale, setScale] = useState(1);
  return (
    <div
      className="relative max-h-[90vh] max-w-[95vw] overflow-auto"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => setScale((s) => (s >= 3 ? 1 : s + 1))}
      onWheel={(e) => {
        e.preventDefault();
        setScale((s) => Math.max(1, Math.min(5, s + (e.deltaY < 0 ? 0.2 : -0.2))));
      }}
    >
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "center center", transition: "transform 0.15s" }}
        className="w-[min(70vh,95vw)] max-w-[560px] select-none"
      >
        <FramePreview
          posterUrl={src}
          title={alt}
          frameType={frameType}
          color={color}
          editSettings={editSettings}
          loading="eager"
        />
      </div>
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-sm bg-background/85 px-2 py-1 text-[10px] uppercase tracking-widest">
        Scroll or double-tap to zoom
      </div>
    </div>
  );
}