// Room Transformation: the artwork must fill the whole frame opening for any image shape.
// Regression guard for the global `img { height: auto }` reset (needs `npx vite build` for the CSS).
//   npx vite build && node tests/e2e/room-fit.mjs
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assets = resolve(root, ".output/public/assets");
const css = readFileSync(
  resolve(
    assets,
    readdirSync(assets).find((f) => /^styles-.*\.css$/.test(f)),
  ),
  "utf8",
);
// The inline style below must match the one in src/components/RoomTransformation.tsx
const src = readFileSync(resolve(root, "src/components/RoomTransformation.tsx"), "utf8");
assert.match(src, /objectFit: "cover"/, "RoomTransformation must use object-fit: cover");
assert.match(src, /height: "100%"/, "RoomTransformation must size the artwork inline");

const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/",
)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const svg = (w, h) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='#ff00ff'/></svg>`)}`;
const kinds = [
  ["portrait", 600, 900],
  ["landscape", 1200, 800],
  ["square", 800, 800],
  ["very wide", 2400, 500],
  ["very tall", 400, 2000],
];
const cells = kinds
  .map(
    ([n, w, h]) =>
      `<div style="width:160px;height:222px;position:relative;margin:8px"><div class="room-transformation-frame" style="--frame-color:#050505;--frame-mat:#f7f5ef;--frame-border:#171717"><img data-k="${n}" src="${svg(w, h)}" class="h-full w-full object-cover object-center" style="width:100%;height:100%;max-width:none;object-fit:cover;object-position:center"></div></div>`,
  )
  .join("");
await page.setContent(
  `<style>${css}</style><body style="background:#00ff00;display:flex">${cells}</body>`,
);
await page.waitForTimeout(500);
let failed = 0;
for (const [n] of kinds) {
  const r = await page.evaluate((n) => {
    const i = document.querySelector(`[data-k="${n}"]`),
      fe = i.parentElement,
      f = fe.getBoundingClientRect(),
      b = i.getBoundingClientRect(),
      cs = getComputedStyle(fe);
    const inset = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
    return { band: f.height - 2 * inset - b.height, fit: getComputedStyle(i).objectFit };
  }, n);
  const ok = Math.abs(r.band) < 0.5 && r.fit === "cover";
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", `${n}: empty band ${r.band.toFixed(1)}px, fit ${r.fit}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
