// Browser harness for tests/e2e/order-visuals.mjs — bundles the real invoice
// renderer and the real framed-preview component, no Supabase involved.
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { buildInvoiceData } from "../../src/lib/order-invoice";
import { renderInvoiceBlob } from "../../src/lib/invoice-canvas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  FramedOrderImage,
  OrderImagePreviewModal,
  type OrderImageEntry,
} from "../../src/components/admin/OrderImages";

async function makeBitmap(w: number, h: number, hue: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue},80%,55%)`);
  grad.addColorStop(1, `hsl(${(hue + 90) % 360},80%,35%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#fff";
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16); // border makes distortion/cropping visible
  return { bitmap: await createImageBitmap(c), dataUrl: c.toDataURL("image/png") };
}

(window as unknown as Record<string, unknown>).harness = {
  async invoice(group: Parameters<typeof buildInvoiceData>[0], withThumbs = true) {
    const data = buildInvoiceData(group);
    const thumbs = new Map<string, CanvasImageSource | null>();
    for (let i = 0; i < data.items.length; i++) {
      thumbs.set(
        data.items[i].rowId,
        withThumbs && i % 4 !== 3 ? (await makeBitmap(600, 800, i * 47)).bitmap : null, // every 4th: broken image
      );
    }
    const res = await renderInvoiceBlob(data, { logo: null, thumbs });
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { width: res.width, height: res.height, size: buf.length, base64: btoa(bin), data };
  },
  async modal(entries: Partial<OrderImageEntry>[], start = 0) {
    const w = window as unknown as { __imgs: Record<string, string>; __closed: boolean };
    const { dataUrl } = await makeBitmap(1200, 900, 20);
    w.__imgs["*"] = dataUrl;
    w.__closed = false;
    const root = document.getElementById("root")!;
    root.innerHTML = "";
    const full = entries.map((e, i) => ({
      key: `k${i}`,
      rowId: `r${i}`,
      index: i + 1,
      title: `Item ${i + 1}`,
      quantity: 1,
      orderNumber: "BRW-1",
      customization: null,
      source: {
        kind: "storage",
        candidates: [{ bucket: "custom-designs", path: `uuid/photo-${i}.png` }],
      },
      ...e,
    })) as OrderImageEntry[];
    createRoot(root).render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(OrderImagePreviewModal, {
          entries: full,
          startIndex: start,
          onClose: () => {
            w.__closed = true;
          },
        }),
      ),
    );
  },
  async frames(list: { frame_type: string; frame_color: string; size: string }[]) {
    const { dataUrl } = await makeBitmap(1200, 900, 200); // landscape source, crops differently per frame
    const root = document.getElementById("root")!;
    root.innerHTML = "";
    root.style.cssText = "display:flex;flex-wrap:wrap;gap:24px;padding:24px;background:#222";
    list.forEach((f, i) => {
      const host = document.createElement("div");
      host.dataset.idx = String(i);
      host.style.zoom = "0.3"; // keep several frames on screen; ratios are unaffected
      root.appendChild(host);
      createRoot(host).render(
        createElement(FramedOrderImage, { entry: { ...f, title: `t${i}` }, src: dataUrl }),
      );
    });
    await new Promise((r) => setTimeout(r, 500));
  },
};
