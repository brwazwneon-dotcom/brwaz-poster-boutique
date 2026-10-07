import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileImage, Loader2, Share2, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { buildInvoiceData, type InvoiceGroup } from "@/lib/order-invoice";
import { loadBitmap, renderInvoiceBlob } from "@/lib/invoice-canvas";
import { thumbnailUrl } from "@/lib/order-images";
import type { OrderImageEntry } from "@/components/admin/OrderImages";

type Generated = { url: string; blob: Blob; key: string; width: number; height: number };

export function OrderInvoiceControls({
  group,
  entries,
}: {
  group: InvoiceGroup;
  entries: OrderImageEntry[];
}) {
  const data = useMemo(() => buildInvoiceData(group), [group]);
  const key = useMemo(() => JSON.stringify(data), [data]);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<Generated | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const genRef = useRef<Generated | null>(null);
  genRef.current = gen;

  useEffect(
    () => () => {
      if (genRef.current) URL.revokeObjectURL(genRef.current.url);
    },
    [],
  );

  useEffect(() => {
    if (!showPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPreview]);

  const fileName = `invoice-${data.orderNumber.replace(/[^A-Za-z0-9_-]/g, "")}.png`;
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof File !== "undefined" &&
    (() => {
      try {
        return navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
      } catch {
        return false;
      }
    })();

  const generate = async (): Promise<Generated | null> => {
    if (genRef.current?.key === key) return genRef.current;
    setBusy(true);
    try {
      const firstEntryByRow = new Map<string, OrderImageEntry>();
      for (const e of entries) if (!firstEntryByRow.has(e.rowId)) firstEntryByRow.set(e.rowId, e);
      const thumbs = new Map<string, CanvasImageSource | null>();
      await Promise.all(
        data.items.map(async (it) => {
          const e = firstEntryByRow.get(it.rowId);
          if (!e) return void thumbs.set(it.rowId, null);
          try {
            const t = await thumbnailUrl(e.source);
            thumbs.set(it.rowId, await loadBitmap(t.url));
          } catch {
            thumbs.set(it.rowId, null);
          }
        }),
      );
      const logo = await loadBitmap("/assets/brwazwneon-logo.png", 400);
      const { blob, width, height } = await renderInvoiceBlob(data, { logo, thumbs });
      if (genRef.current) URL.revokeObjectURL(genRef.current.url);
      const next = { url: URL.createObjectURL(blob), blob, key, width, height };
      setGen(next);
      return next;
    } catch (e) {
      console.error("[invoice] generation failed", e);
      toast.error("Could not generate the invoice image");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const g = await generate();
    if (!g) return;
    const a = document.createElement("a");
    a.href = g.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    const g = await generate();
    if (!g) return;
    try {
      const file = new File([g.blob], fileName, { type: "image/png" });
      await navigator.share({ files: [file], title: `Invoice #${data.orderNumber}` });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Sharing is not available here");
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-50";

  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-display text-lg">Invoice</div>
          <div className="text-[11px] text-muted-foreground">
            Branded PNG built from this order&apos;s stored totals — ready for WhatsApp or print.
          </div>
        </div>
        <FileImage className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void generate()} className={btn}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileImage className="h-3.5 w-3.5" />
          )}
          Generate Invoice
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await generate()) setShowPreview(true);
          }}
          className={btn}
        >
          <Eye className="h-3.5 w-3.5" /> Preview Invoice
        </button>
        <button type="button" disabled={busy} onClick={() => void download()} className={btn}>
          <Download className="h-3.5 w-3.5" /> Download Invoice
        </button>
        {canShare && (
          <button type="button" disabled={busy} onClick={() => void share()} className={btn}>
            <Share2 className="h-3.5 w-3.5" /> Share Invoice
          </button>
        )}
      </div>
      {gen && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Generated {gen.width}×{gen.height}px · {(gen.blob.size / 1024).toFixed(0)} KB
        </div>
      )}

      {showPreview && gen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/90 p-4"
          onClick={() => setShowPreview(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Invoice preview"
        >
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            aria-label="Close invoice preview"
            className="fixed right-4 top-4 z-10 rounded-sm border border-border bg-card/90 p-2 text-foreground hover:bg-card"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={gen.url}
            alt={`Invoice ${data.orderNumber}`}
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-[760px] rounded-sm bg-white shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
