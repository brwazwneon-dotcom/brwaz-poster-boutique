// Browser harness for tests/e2e/mockup-fit.mjs — mounts the REAL FramePreview.
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FramePreview } from "../../src/components/FramePreview";

type Case = {
  id: string;
  frameType: string;
  color: string;
  boxStyle: Record<string, string | number>;
  aspectClass: string;
  poster: string;
};
let root: Root | null = null;

function testImage(w: number, h: number, kind: string) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (kind === "solid") {
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, w, h);
  } else if (kind === "clear") {
    g.clearRect(0, 0, w, h);
  } else {
    // gradient + a perfectly round yellow disc in the middle: any stretching shows as an oval
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "#d000d0");
    gr.addColorStop(1, "#600060");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffff00";
    g.beginPath();
    g.arc(w / 2, h / 2, Math.min(w, h) * 0.2, 0, Math.PI * 2);
    g.fill();
  }
  return c.toDataURL("image/png");
}

(window as unknown as Record<string, unknown>).mockupHarness = {
  testImage,
  async mount(cases: Case[], bg = "#00ff00") {
    const host = document.getElementById("root")!;
    root?.unmount();
    host.innerHTML = "";
    root = createRoot(host);
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: 24,
              padding: 12,
              background: bg,
            },
          },
          cases.map((c) =>
            createElement(
              "div",
              { key: c.id, "data-case": c.id, style: c.boxStyle },
              createElement(FramePreview, {
                posterUrl: c.poster,
                frameType: c.frameType as never,
                color: c.color as never,
                aspectClassName: c.aspectClass,
                className: "h-full w-full",
                loading: "eager",
              }),
            ),
          ),
        ),
      ),
    );
    // wait until every poster AND frame image has really decoded (the app's image
    // queue loads them a few at a time), so screenshots never catch a half-loaded box
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 100));
      const imgs = [...document.querySelectorAll("[data-case] img")] as HTMLImageElement[];
      if (imgs.length >= cases.length * 2 && imgs.every((i) => i.complete && i.naturalWidth > 0))
        break;
      if (Date.now() - t0 > 20000) throw new Error("images did not load");
    }
    // decode() resolves once the bitmap is really ready to paint (decoding="async" images can lag)
    const all = [...document.querySelectorAll("[data-case] img")] as HTMLImageElement[];
    await Promise.all(all.map((i) => i.decode().catch(() => undefined)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    await new Promise((r) => setTimeout(r, 300)); // let the loading overlay clear
  },
};
