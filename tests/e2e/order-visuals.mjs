// Real-browser checks for the invoice image and the framed preview.
//   node tests/e2e/order-visuals.mjs
// Needs Chromium (PLAYWRIGHT_BROWSERS_PATH) and playwright (PLAYWRIGHT_MODULE
// can point at it). Nothing here talks to Supabase or the network.
import { build } from "vite";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "test-results/order-visuals");
const dist = resolve(out, "bundle");
rmSync(out, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  root,
  configFile: false,
  logLevel: "error",
  resolve: { alias: { "@": resolve(root, "src") } },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: dist,
    emptyOutDir: true,
    minify: false,
    lib: { entry: resolve(root, "tests/e2e/harness.tsx"), formats: ["iife"], name: "H", fileName: () => "harness.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env.VITE_SUPABASE_URL": '"http://127.0.0.1:1"', "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '"x"' },
});

const req = createRequire(process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/");
const { chromium } = req("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.setContent('<html><body style="margin:0"><div id="root"></div></body></html>');
await page.addScriptTag({ path: resolve(dist, "harness.js") });

const row = (i, o = {}) => ({
  id: `row-${i}`,
  order_number: `BRW-${i}`,
  poster_title: `Poster ${i}`,
  frame_type: i % 2 ? "Wooden Portrait" : "High Quality PVC",
  frame_color: ["Black", "White", "Wood"][i % 3],
  size: ["20 x 30 cm", "30 x 40 cm", "50 x 70 cm"][i % 3],
  quantity: 1 + (i % 3),
  subtotal: 250 * (1 + (i % 3)),
  packaging_fee: 0,
  shipping_cost: 0,
  total_price: 250 * (1 + (i % 3)),
  notes: null,
  ...o,
});
const group = (items, o = {}) => ({
  primaryNumber: "BRW-20260910-0042",
  created_at: "2026-09-10T12:30:00Z",
  customer_name: "أحمد محمد عبد الرحمن",
  phone: "01012345678",
  governorate: "القاهرة",
  address: "١٢ شارع التحرير، الدقي، الجيزة، بجوار محطة المترو، الدور الرابع شقة ١٦ — يرجى الاتصال قبل الوصول",
  status: "new",
  payment_method: "cod",
  items,
  ...o,
});

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message]); }
};

// ---------- 11/12/13: invoice ----------
const g1 = group([
  row(1, { poster_title: "بوستر ليفربول — موسم الأحلام", total_price: 339, subtotal: 250, shipping_cost: 89 }),
  row(2, { poster_title: "An extremely long English poster title that must wrap onto two lines and then be truncated with an ellipsis rather than overflow the column" }),
  row(3, { poster_title: "Averyveryveryveryveryveryveryveryveryverylongunbrokenwordwithoutanyspacesatall1234567890" }),
  row(4), // renders without a thumbnail (placeholder)
]);
const inv = await page.evaluate((g) => window.harness.invoice(g), g1);
const png = Buffer.from(inv.base64, "base64");
writeFileSync(resolve(out, "invoice-sample.png"), png);
check("invoice is a PNG", () => assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"));
check("invoice is 2160px wide (1080 × 2)", () => assert.equal(inv.width, 2160));
check("invoice height is sane", () => assert.ok(inv.height > 2000 && inv.height < 12000, String(inv.height)));
check("invoice total equals the stored order total", () => {
  const stored = g1.items.reduce((s, r) => s + r.total_price, 0);
  assert.equal(inv.data.total, stored);
});
const inv2 = await page.evaluate((g) => window.harness.invoice(g), g1);
check("invoice is deterministic (same input → identical bytes)", () =>
  assert.equal(createHash("sha256").update(inv.base64).digest("hex"), createHash("sha256").update(inv2.base64).digest("hex")));
// non-blank + no content bleeding off the right edge
const pix = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const strip = x.getImageData(img.width - 6, 400, 6, 1200).data; // outer margin must stay white
  let nonWhite = 0;
  for (let i = 0; i < strip.length; i += 4) if (strip[i] < 250 || strip[i + 1] < 250 || strip[i + 2] < 250) nonWhite++;
  const mid = x.getImageData(0, 400, img.width, 600).data;
  const colors = new Set();
  for (let i = 0; i < mid.length; i += 4 * 97) colors.add(`${mid[i] >> 4},${mid[i + 1] >> 4},${mid[i + 2] >> 4}`);
  return { nonWhite, colors: colors.size };
}, inv.base64);
check("invoice body is not blank", () => assert.ok(pix.colors > 6, `colors=${pix.colors}`));
check("nothing overflows into the right margin", () => assert.equal(pix.nonWhite, 0));

const many = group(Array.from({ length: 14 }, (_, i) => row(i + 1)));
const invMany = await page.evaluate((g) => window.harness.invoice(g), many);
writeFileSync(resolve(out, "invoice-many.png"), Buffer.from(invMany.base64, "base64"));
check("14-item invoice grows taller than the 4-item one", () => assert.ok(invMany.height > inv.height));

const cancelled = await page.evaluate((g) => window.harness.invoice(g), group([row(1)], { status: "cancelled" }));
writeFileSync(resolve(out, "invoice-cancelled.png"), Buffer.from(cancelled.base64, "base64"));
check("cancelled invoice renders", () => assert.equal(cancelled.data.status, "cancelled"));

// ---------- 10: image inside the right frame ----------
const frames = [
  { frame_type: "High Quality PVC", frame_color: "Black", size: "20 x 30 cm" },
  { frame_type: "High Quality PVC", frame_color: "White", size: "30 x 40 cm" },
  { frame_type: "Wooden Portrait", frame_color: "Wood", size: "50 x 70 cm" },
  { frame_type: "Wooden Portrait", frame_color: "Black", size: "100 x 60 cm" },
];
await page.evaluate((f) => window.harness.frames(f), frames);
const geo = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="framed-order-image"]')].map((el) => {
    const r = el.getBoundingClientRect();
    const img = el.querySelector("img");
    const open = el.querySelector('[data-testid="frame-opening"]').getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      family: el.dataset.frameFamily, tone: el.dataset.frameTone,
      outerAspect: r.width / r.height, outer: [r.width, r.height], open: [open.width, open.height], openAspect: open.width / open.height,
      fit: cs.objectFit, pos: cs.objectPosition, imgW: img.getBoundingClientRect().width, openW: open.width,
      bg: getComputedStyle(el).backgroundImage.slice(0, 40),
    };
  }),
);
await page.screenshot({ path: resolve(out, "framed-previews.png") });
console.log(JSON.stringify(geo.map(g=>({o:g.outer,p:g.open,a:g.outerAspect})))); const wantAspect = frames.map((f) => { const [w, h] = f.size.match(/\d+/g).map(Number); return w / h; });
geo.forEach((g, i) => {
  check(`frame ${i}: family/tone from the order`, () => {
    assert.equal(g.family, frames[i].frame_type.includes("Wood") ? "wood" : "pvc");
    assert.equal(g.tone, frames[i].frame_color.toLowerCase());
  });
  check(`frame ${i}: opening has the print aspect ratio (${frames[i].size})`, () => assert.ok(Math.abs(g.openAspect - wantAspect[i]) < 0.02, `${g.openAspect} vs ${wantAspect[i]}`));
  check(`frame ${i}: image uses object-fit: cover, centred (no distortion)`, () => {
    assert.equal(g.fit, "cover");
    assert.match(g.pos, /50%/);
    assert.ok(Math.abs(g.imgW - g.openW) < 1);
  });
});
check("frames render differently per colour", () => assert.ok(new Set(geo.map((g) => g.bg)).size >= 3));

// ---------- responsive: phone viewport keeps the frame inside the screen ----------
await page.setViewportSize({ width: 375, height: 700 });
await page.evaluate((f) => window.harness.frames(f), [frames[3]]);
const fit = await page.evaluate(() => {
  const r = document.querySelector('[data-testid="framed-order-image"]').getBoundingClientRect();
  return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
});
await page.screenshot({ path: resolve(out, "framed-mobile.png") });
check("mobile: wide frame fits the viewport width", () => assert.ok(fit.w <= fit.vw, JSON.stringify(fit)));
check("no page errors", () => assert.deepEqual(errors, []));

await browser.close();
for (const r of results) console.log(r[0], r[1], r[2] ?? "");
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed; artifacts in test-results/order-visuals/`);
process.exit(failed ? 1 : 0);
