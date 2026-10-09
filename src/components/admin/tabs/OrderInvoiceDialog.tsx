import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { resolveCustomDesignImageAdmin } from "@/lib/image-upload.functions";
import { downloadBlob } from "@/lib/image-download";
import {
  buildInvoiceModel,
  safeFileStem,
  type InvoiceOrderRow,
  type InvoicePhotoOrder,
} from "@/lib/order-invoice";
import { loadInvoiceImages, renderInvoiceBlob } from "@/lib/order-invoice-render";

const LOGO_URL = "/assets/brwazwneon-logo.png";

// Custom-design rows whose poster_image isn't a URL keep only the upload's
// filename/size in `notes` (see useResolvedItemImage in OrderDetailsDrawer);
// resolve them the same way so the invoice shows the customer's own photo.
function customMeta(
  notes: string | null | undefined,
): { name: string; size: number | null } | null {
  if (!notes) return null;
  try {
    const p = JSON.parse(notes) as { originalFilename?: unknown; originalFileSize?: unknown };
    return typeof p.originalFilename === "string" && p.originalFilename
      ? {
          name: p.originalFilename,
          size: typeof p.originalFileSize === "number" ? p.originalFileSize : null,
        }
      : null;
  } catch {
    return null;
  }
}

type RowWithNotes = InvoiceOrderRow & { notes?: string | null };

export function OrderInvoiceDialog({
  rows,
  orderLabel,
  photoOrders,
  catalog,
  onClose,
}: {
  rows: RowWithNotes[];
  orderLabel: string;
  photoOrders: InvoicePhotoOrder[];
  catalog: Record<string, string>;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);
  const blobRef = useRef<Blob | null>(null);
  const runRef = useRef(0);

  const fileName = `invoice-${safeFileStem(orderLabel, "order")}.png`;

  const generate = useCallback(async () => {
    const run = ++runRef.current;
    setState("loading");
    setError("");
    try {
      const own: Record<string, string | null> = {};
      await Promise.all(
        rows.map(async (r) => {
          if (r.poster_image && /^https?:\/\//.test(r.poster_image)) return;
          const meta = customMeta(r.notes);
          if (!meta) return;
          try {
            const res = await resolveCustomDesignImageAdmin({
              data: { filename: meta.name, fileSize: meta.size },
            });
            own[r.id] = res.url ?? null;
          } catch {
            /* best effort — the line gets a placeholder */
          }
        }),
      );
      const model = buildInvoiceModel(rows, {
        orderLabel,
        photoOrders,
        images: { own, catalog },
      });
      const images = await loadInvoiceImages(model, LOGO_URL);
      // Placeholders on the invoice: images with no known source plus ones
      // whose download failed (counted once per distinct image).
      const noSource = model.items.reduce(
        (n, it) =>
          n +
          (it.isTape
            ? 0
            : it.isBundle
              ? it.posters.filter((p) => !p.imageUrl).length
              : it.imageUrl
                ? 0
                : 1),
        0,
      );
      const failedLoads = [...images.byUrl.values()].filter((v) => !v).length;
      const blob = await renderInvoiceBlob(model, images);
      if (run !== runRef.current) return;
      blobRef.current = blob;
      setMissing(noSource + failedLoads);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setState("ready");
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e instanceof Error ? e.message : "Could not create the invoice");
      setState("error");
    }
  }, [rows, orderLabel, photoOrders, catalog]);

  useEffect(() => {
    void generate();
    return () => {
      // Intentional: invalidate any in-flight run when the dialog closes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++;
    };
    // Generate once per open; the rows/catalog are stable for an open drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    },
    [],
  );

  const download = () => {
    if (!blobRef.current) return;
    downloadBlob(blobRef.current, fileName);
    toast.success("Invoice image saved");
  };

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Order ${orderLabel}` });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    download();
    toast.message("Sharing isn't supported here — the image was downloaded instead");
  };

  const btn =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm border px-4 text-xs font-semibold uppercase tracking-widest disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background/95"
      role="dialog"
      aria-modal="true"
      aria-label="Order invoice image"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
        <div className="mr-auto text-sm font-semibold">Invoice image · {orderLabel}</div>
        <button
          type="button"
          onClick={download}
          disabled={state !== "ready"}
          className={`${btn} border-primary/50 bg-primary/15 text-foreground hover:bg-primary/25`}
        >
          ⬇ Download PNG
        </button>
        <button
          type="button"
          onClick={() => void share()}
          disabled={state !== "ready"}
          className={`${btn} border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`}
        >
          ↗ Share
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close invoice"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state === "loading" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Creating the invoice…
          </div>
        )}
        {state === "error" && (
          <div className="mx-auto max-w-md space-y-3 text-center text-sm">
            <div className="text-red-400">{error}</div>
            <button
              type="button"
              onClick={() => void generate()}
              className={`${btn} border-border`}
            >
              Try again
            </button>
          </div>
        )}
        {state === "ready" && previewUrl && (
          <div className="mx-auto max-w-[540px] space-y-3">
            {missing > 0 && (
              <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {missing} image{missing > 1 ? "s" : ""} couldn't be loaded and show as “No image” on
                the invoice. The prices and details are complete.
              </div>
            )}
            <img
              src={previewUrl}
              alt="Invoice preview"
              className="w-full rounded-sm border border-border"
            />
          </div>
        )}
      </div>
    </div>
  );
}
