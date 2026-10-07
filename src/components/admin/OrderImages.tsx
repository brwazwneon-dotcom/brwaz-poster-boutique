import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import { FramePreview } from "@/components/FramePreview";
import { MOCKUP_ASSET_GEOMETRY, posterRectPct } from "@/lib/frame-mockup-geometry";
import { frameSpecFor } from "@/lib/frame-geometry";
import {
  downloadOriginal,
  imageSourceFromStored,
  previewUrl,
  thumbnailUrl,
  type ImageSource,
} from "@/lib/order-images";
import { parseItemNotes } from "@/lib/order-pricing";

export type OrderRowLite = {
  id: string;
  order_number?: string | null;
  poster_title: string | null;
  poster_image: string | null;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  notes?: string | null;
};

export type OrderImageEntry = {
  key: string;
  rowId: string;
  /** 1-based position across the whole order. */
  index: number;
  title: string;
  source: ImageSource;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  orderNumber: string | null;
  customization: string | null;
};

/** Every image of an order (bundle posters and customer uploads), in order. */
export function useOrderImageEntries(rows: OrderRowLite[]): OrderImageEntry[] {
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const q = useQuery({
    queryKey: ["order-poster-images", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_posters")
        .select("order_id,poster_title,poster_image,position")
        .in("order_id", ids)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        order_id: string;
        poster_title: string | null;
        poster_image: string | null;
        position: number;
      }[];
    },
  });
  return useMemo(() => {
    const byRow = new Map<string, { title: string | null; image: string | null }[]>();
    for (const r of q.data ?? []) {
      const arr = byRow.get(r.order_id) ?? [];
      arr.push({ title: r.poster_title, image: r.poster_image });
      byRow.set(r.order_id, arr);
    }
    const out: OrderImageEntry[] = [];
    for (const row of rows) {
      const notes = parseItemNotes(row.notes);
      const meta = notes.meta as {
        originalFilename?: string;
        originalWidth?: number;
        originalHeight?: number;
      } | null;
      const customization = meta?.originalFilename
        ? `Customer upload · ${meta.originalFilename}${
            meta.originalWidth && meta.originalHeight
              ? ` · ${meta.originalWidth}×${meta.originalHeight}px`
              : ""
          }`
        : null;
      const list = byRow.get(row.id);
      const candidates = list?.length
        ? list.map((p) => ({ title: p.title ?? row.poster_title ?? "", image: p.image }))
        : [{ title: row.poster_title ?? "", image: row.poster_image }];
      candidates.forEach((c, i) => {
        const source = imageSourceFromStored(c.image);
        if (!source) return;
        out.push({
          key: `${row.id}:${i}`,
          rowId: row.id,
          index: out.length + 1,
          title: c.title || row.poster_title || "Item",
          source,
          frame_type: row.frame_type,
          frame_color: row.frame_color,
          size: row.size,
          quantity: row.quantity,
          orderNumber: row.order_number ?? null,
          customization,
        });
      });
    }
    return out;
  }, [rows, q.data]);
}

/** Resolves a (short-lived) thumbnail URL for an entry. */
export function useEntryThumb(entry: OrderImageEntry) {
  const q = useQuery({
    queryKey: ["order-image-thumb", entry.key, entry.source],
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: () => thumbnailUrl(entry.source),
  });
  return q.data ?? null;
}

export async function downloadEntry(entry: OrderImageEntry) {
  try {
    const name = await downloadOriginal(entry.source, {
      orderNumber: entry.orderNumber,
      index: entry.index,
      title: entry.title,
    });
    toast.success(`Downloading ${name}`);
  } catch (e) {
    console.error("[order-image] download failed", e);
    toast.error("Could not download this image (admin access required)");
  }
}

export function EntryActions({
  entry,
  onPreview,
  className,
}: {
  entry: OrderImageEntry;
  onPreview: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={cn("flex gap-1", className)}>
      <button
        type="button"
        onClick={onPreview}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
      >
        <Eye className="h-3 w-3" /> Preview
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadEntry(entry);
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        Download
      </button>
    </div>
  );
}

export function EntryThumb({ entry, className }: { entry: OrderImageEntry; className?: string }) {
  const t = useEntryThumb(entry);
  return (
    <SafeImage
      src={t?.url ?? ""}
      fallbackSrc={t?.full}
      alt={entry.title}
      className={cn("w-full object-cover", className)}
    />
  );
}

/** Visible-opening ratio (width / height) of a bundled mockup. */
function openingAspect(tone: "black" | "white" | "wood") {
  const r = posterRectPct(MOCKUP_ASSET_GEOMETRY[tone], 0);
  const g = MOCKUP_ASSET_GEOMETRY[tone];
  return ((r.width / 100) * g.width) / ((r.height / 100) * g.height);
}

/**
 * The customer's image inside the ordered frame, using the same FramePreview
 * (and the same bundled mockup image) as the storefront — one fitting logic.
 */
export function FramedOrderImage({
  entry,
  src,
  fallbackSrc,
}: {
  entry: Pick<OrderImageEntry, "frame_type" | "frame_color" | "size" | "title">;
  src: string;
  fallbackSrc?: string;
}) {
  const spec = frameSpecFor(entry);
  const ratio = MOCKUP_ASSET_GEOMETRY.black.width / MOCKUP_ASSET_GEOMETRY.black.height;
  return (
    <div
      data-testid="framed-order-image"
      data-frame-family={spec.family}
      data-frame-tone={spec.tone}
      style={{ width: `min(88vw, calc(68vh * ${ratio}))` }}
    >
      <FramePreview
        posterUrl={src}
        posterFallbackUrl={fallbackSrc}
        title={entry.title}
        frameType={spec.family}
        color={spec.tone}
        aspectClassName="aspect-[2/3]"
        className="h-full w-full"
        loading="eager"
      />
    </div>
  );
}

export function OrderImagePreviewModal({
  entries,
  startIndex,
  onClose,
}: {
  entries: OrderImageEntry[];
  startIndex: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(Math.min(Math.max(startIndex, 0), entries.length - 1));
  const [open, setOpen] = useState(false);
  const entry = entries[i];
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const go = useCallback(
    (d: number) => setI((cur) => (cur + d + entries.length) % entries.length),
    [entries.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowRight" && entries.length > 1) go(1);
      else if (e.key === "ArrowLeft" && entries.length > 1) go(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, go, entries.length]);

  const pv = useQuery({
    queryKey: ["order-image-preview", entry?.key, entry?.source],
    enabled: !!entry,
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: () => previewUrl(entry.source),
  });

  if (!entry) return null;
  const spec = frameSpecFor(entry);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Framed preview"
      className={cn(
        "fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "opacity-0",
      )}
      onClick={close}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close preview"
        className="absolute right-4 top-4 rounded-sm border border-border bg-card/90 p-2 text-foreground hover:bg-card"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex flex-col items-center transition-transform duration-200",
          open ? "scale-100" : "scale-95",
        )}
      >
        <div className="relative">
          <FramedOrderImage entry={entry} src={pv.data?.url ?? ""} fallbackSrc={pv.data?.full} />
        </div>

        <div className="mt-4 max-w-[92vw] text-center text-xs text-white/80">
          <div className="text-sm font-semibold text-white">{entry.title}</div>
          <div className="mt-1">
            {entry.frame_type} · {entry.frame_color} · {entry.size} · × {entry.quantity}
          </div>
          {entry.customization && <div className="mt-0.5 text-white/60">{entry.customization}</div>}
          {!spec.fallback && Math.abs(spec.printAspect / openingAspect(spec.tone) - 1) > 0.05 && (
            <div className="mt-0.5 text-amber-300">
              Print is {spec.widthCm} × {spec.heightCm} cm (
              {spec.printAspect > 1 ? "landscape" : "portrait"}); the mockup opening has a fixed
              shape, so the crop shown is approximate.
            </div>
          )}
          {spec.fallback && (
            <div className="mt-0.5 text-amber-300">Size “{entry.size}” not recognised.</div>
          )}
          <div className="mt-1 text-white/50">
            {entries.length > 1 ? `${i + 1} / ${entries.length}` : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void downloadEntry(entry)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-white/30 bg-white/10 px-3 py-2 text-[11px] uppercase tracking-widest text-white hover:bg-white/20"
        >
          <Download className="h-3.5 w-3.5" /> Download original
        </button>
      </div>

      {entries.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
    </div>
  );
}
