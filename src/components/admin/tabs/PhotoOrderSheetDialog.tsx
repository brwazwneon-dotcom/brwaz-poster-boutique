import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/image-download";
import { safeFileStem } from "@/lib/order-invoice";
import { loadPhotoSheetImages, renderPhotoSheetBlob } from "@/lib/order-invoice-render";
import { buildPhotoSheetModel, type PhotoOrderLike } from "@/lib/photo-order-sheet";

const LOGO_URL = "/assets/brwazwneon-logo.png";

/** Preview / download / share the combined photos + details image of a photo-printing order. */
export function PhotoOrderSheetDialog({
  order,
  onClose,
}: {
  order: PhotoOrderLike;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);
  const blobRef = useRef<Blob | null>(null);
  const runRef = useRef(0);
  const fileName = `photos-${safeFileStem(order.order_number ?? order.id.slice(0, 8), "order")}.png`;

  const generate = useCallback(async () => {
    const run = ++runRef.current;
    setState("loading");
    setError("");
    try {
      const model = buildPhotoSheetModel(order);
      const images = await loadPhotoSheetImages(model, LOGO_URL);
      const blob = await renderPhotoSheetBlob(model, images);
      if (run !== runRef.current) return;
      blobRef.current = blob;
      setMissing(images.photos.filter((p) => !p).length);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setState("ready");
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e instanceof Error ? e.message : "Could not create the image");
      setState("error");
    }
  }, [order]);

  useEffect(() => {
    void generate();
    return () => {
      // Intentional: invalidate any in-flight run when the dialog closes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++;
    };
    // Generate once per open.
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
    toast.success("Image saved");
  };

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Order ${order.order_number ?? ""}` });
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
      aria-label="Photo order image"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
        <div className="mr-auto text-sm font-semibold">
          Photos + details · {order.order_number ?? order.id.slice(0, 8)}
        </div>
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
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state === "loading" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Creating the image…
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
                {missing} photo{missing > 1 ? "s" : ""} couldn&apos;t be loaded and show as “No
                image”. The order details are complete.
              </div>
            )}
            <img
              src={previewUrl}
              alt="Photo order preview"
              className="w-full rounded-sm border border-border"
            />
          </div>
        )}
      </div>
    </div>
  );
}
