// Pixel-level regression test: the poster must fill the frame mockup's opening
// exactly — no uncovered strip (gap) and nothing outside the opening (overflow).
//   npx vite build && node tests/e2e/mockup-fit.mjs
// How it measures (exact, anti-alias aware): every box is rendered three times.
//   A1) transparent poster on a lime page   A2) same on a blue page
//       -> per-pixel transparency of the mockup:  t = (A1.G - A2.G) / 255
//   B ) magenta poster on the lime page
//       -> ideal result = A1 + (magenta - lime) * t   (poster exactly fills the opening)
//   A pixel where B differs from the ideal is a defect:
//       t high  -> GAP      (opening not covered by the poster)
//       t low   -> OVERFLOW (poster visible outside the opening)
import { build } from "vite";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "test-results/order-visuals/mockup-fit");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const dist = resolve(out, "bundle");

await build({
  root,
  configFile: false,
  logLevel: "error",
  resolve: {
    alias: [
      {
        find: "@/integrations/supabase/client",
        replacement: resolve(root, "tests/e2e/supabase-stub.ts"),
      },
      { find: "@", replacement: resolve(root, "src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: dist,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(root, "tests/e2e/mockup-harness.tsx"),
      formats: ["iife"],
      name: "M",
      fileName: () => "m.js",
    },
  },
  define: { "process.env.NODE_ENV": '"production"' },
});

const assets = resolve(root, ".output/public/assets");
const cssFile = existsSync(assets)
  ? readdirSync(assets).find((f) => /^styles-.*\.css$/.test(f))
  : null;
if (!cssFile) throw new Error("Run `npx vite build` first (the app CSS is needed).");

const req = createRequire(process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/");
const { chromium } = req("playwright");
const browser = await chromium.launch();

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message.split("\n")[0]]);
  }
};

async function newPage(viewport, dsf = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.push(["FAIL", "page error", String(e)]));
  await page.route("http://t.local/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/")
      return r.fulfill({
        contentType: "text/html",
        body: '<html><head><link rel=stylesheet href="/app.css"></head><body style="margin:0"><div id=root></div><script src="/m.js"></script></body></html>',
      });
    if (u.pathname === "/app.css")
      return r.fulfill({ contentType: "text/css", body: readFileSync(resolve(assets, cssFile)) });
    if (u.pathname === "/m.js")
      return r.fulfill({
        contentType: "text/javascript",
        body: readFileSync(resolve(dist, "m.js")),
      });
    const f = resolve(root, "public" + u.pathname);
    try {
      return r.fulfill({
        body: readFileSync(f),
        contentType: f.endsWith("webp") ? "image/webp" : "image/png",
      });
    } catch {
      return r.fulfill({ status: 404, body: "" });
    }
  });
  await page.goto("http://t.local/");
  await page.addStyleTag({ content: "[data-case] > div { filter: none !important; }" });
  return { page, close: () => ctx.close() };
}

const b64 = (buf) => buf.toString("base64");

// All pixel math runs inside the page (only counts cross the boundary).
const loadShots = (page, a1, a2, b) =>
  page.evaluate(
    async ({ a1, a2, b }) => {
      const dec = async (x) => {
        const i = new Image();
        i.src = "data:image/png;base64," + x;
        await i.decode();
        return i;
      };
      window.__shots = [await dec(a1), await dec(a2), await dec(b)];
    },
    { a1, a2, b },
  );

const countPx = (page, args) =>
  page.evaluate(async ({ s, box, dsf }) => {
    // crop the box out of each full-page screenshot with identical integer bounds
    const bx = Math.round(box.x * dsf),
      by = Math.round(box.y * dsf),
      bw = Math.round(box.width * dsf),
      bh = Math.round(box.height * dsf);
    const crop = (i) => {
      const c = document.createElement("canvas");
      c.width = bw;
      c.height = bh;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(i, bx, by, bw, bh, 0, 0, bw, bh);
      return g.getImageData(0, 0, bw, bh);
    };
    const [A1, A2, B] = window.__shots.map(crop);
    const m = s.edge;
    const W = bw,
      H = bh;
    const bad = new Uint8Array(W * H); // 1 = pixel differs from the ideal composite
    const hole = { n: 0 };
    const inHole = new Uint8Array(W * H);
    for (let y = Math.max(0, s.y0 + m); y < Math.min(H, s.y1 - m); y++)
      for (let x = Math.max(0, s.x0 + m); x < Math.min(W, s.x1 - m); x++) {
        const i = (y * W + x) * 4,
          k = y * W + x;
        const t = Math.min(1, Math.max(0, (A1.data[i + 1] - A2.data[i + 1]) / 255));
        if (t > 0.5) {
          hole.n++;
          inHole[k] = 1;
        }
        const diff =
          Math.abs(B.data[i] - (A1.data[i] + 255 * t)) +
          Math.abs(B.data[i + 1] - (A1.data[i + 1] - 255 * t)) +
          Math.abs(B.data[i + 2] - (A1.data[i + 2] + 255 * t));
        if (diff > 90) bad[k] = 1;
      }
    // A defect only counts if a full 3×3 block of pixels is wrong (a real strip at least 3 device
    // pixels thick). One- or two-pixel lines along an edge are anti-aliasing, not a gap.
    let gap = 0,
      overflow = 0,
      thin = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x;
        if (!bad[k]) continue;
        const thick =
          bad[k - 1] &&
          bad[k + 1] &&
          bad[k - W] &&
          bad[k + W] &&
          bad[k - W - 1] &&
          bad[k - W + 1] &&
          bad[k + W - 1] &&
          bad[k + W + 1];
        if (!thick) {
          thin++;
          continue;
        }
        if (inHole[k]) gap++;
        else overflow++;
      }
    let dump = null;
    if (gap + overflow > 2000) {
      const mk = (d) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        c.getContext("2d").putImageData(d, 0, 0);
        return c.toDataURL("image/png");
      };
      dump = { a1: mk(A1), b: mk(B) };
    }
    return { hole: hole.n, gap, overflow, thin, dump };
  }, args);

const discBox = (page, png) =>
  page.evaluate(async (x) => {
    const i = new Image();
    i.src = "data:image/png;base64," + x;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = i.width;
    c.height = i.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(i, 0, 0);
    const d = g.getImageData(0, 0, i.width, i.height).data;
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < i.height; y++)
      for (let xx = 0; xx < i.width; xx++) {
        const k = (y * i.width + xx) * 4;
        if (d[k] > 230 && d[k + 1] > 230 && d[k + 2] < 60) {
          x0 = Math.min(x0, xx);
          x1 = Math.max(x1, xx);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    return { x0, y0, x1, y1 };
  }, b64(png));

// Browsers cannot decode very tall screenshots, so measure in small batches.
async function measure(page, cases, dsf) {
  const size = (await page.viewportSize()).width <= 800 ? 4 : 8;
  const rows = [];
  for (let i = 0; i < cases.length; i += size)
    rows.push(...(await measureBatch(page, cases.slice(i, i + size), dsf)));
  return rows;
}

async function measureBatch(page, cases, dsf) {
  const clear = await page.evaluate(() => window.mockupHarness.testImage(4, 4, "clear"));
  // Page-coordinate clips from ONE fullPage screenshot per pass: no scrolling, so every
  // box rasterises identically in A1/A2/B (element screenshots scroll and shift sub-pixels).
  const shots = async (cs, bg) => {
    await page.evaluate(([c, bg]) => window.mockupHarness.mount(c, bg), [cs, bg]);
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll("[data-case]")].map((el) => {
        const r = el.getBoundingClientRect(),
          st = el.querySelector('[data-testid="frame-stage"]').getBoundingClientRect();
        return {
          id: el.dataset.case,
          box: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height },
          stage: { x: st.x + scrollX, y: st.y + scrollY, width: st.width, height: st.height },
        };
      }),
    );
    const full = await page.screenshot({ fullPage: true, type: "png", scale: "device" });
    const o = {};
    for (const r of rects) o[r.id] = { full, box: r.box, stage: r.stage };
    return o;
  };
  const clearCases = cases.map((c) => ({ ...c, poster: clear }));
  const A1 = await shots(clearCases, "#00ff00");
  const A2 = await shots(clearCases, "#0000ff");
  const B = await shots(cases, "#00ff00");
  const rows = [];
  await loadShots(
    page,
    b64(A1[cases[0].id].full),
    b64(A2[cases[0].id].full),
    b64(B[cases[0].id].full),
  );
  for (const c of cases) {
    const a = A1[c.id];
    const s = {
      x0: Math.round((a.stage.x - a.box.x) * dsf),
      y0: Math.round((a.stage.y - a.box.y) * dsf),
      x1: Math.round((a.stage.x - a.box.x + a.stage.width) * dsf),
      y1: Math.round((a.stage.y - a.box.y + a.stage.height) * dsf),
      edge: 3 * dsf,
    };
    const r = await countPx(page, { s, box: a.box, dsf });
    if (r.dump)
      for (const k of ["a1", "b"])
        writeFileSync(
          resolve(out, `defect-${c.id.replace(/[^a-z0-9]+/gi, "_")}-${k}.png`),
          Buffer.from(r.dump[k].split(",")[1], "base64"),
        );
    delete r.dump;
    rows.push({ id: c.id, ...r, stage: a.stage, box: a.box });
  }
  return rows;
}

const variants = [
  ["pvc", "black"],
  ["pvc", "white"],
  ["wood", "wood"],
];
const boxes = [
  ["2:3", "aspect-[2/3]", (w) => ({ width: w })],
  ["3:4", "aspect-[3/4]", (w) => ({ width: w })],
  ["square", "aspect-square", (w) => ({ width: w })],
  ["4:3 wide", "aspect-[4/3]", (w) => ({ width: w })],
  ["12x16 thumb", "h-12 w-9", () => ({ width: 36, height: 48 })],
];
const solid = null;

// ---------- 1) every colour × every box shape × responsive widths ----------
const viewports = [
  ["desktop 1920", 1920, 1080],
  ["laptop 1366", 1366, 768],
  ["tablet 768", 768, 1024],
  ["iPhone 390", 390, 844],
  ["narrow Android 360", 360, 740],
];
let worst = { gap: 0, overflow: 0, id: "" };
let measured = 0;
for (const [vn, vw, vh] of viewports.filter(
  ([n]) => !process.env.ONLY_VIEWPORT || n.startsWith(process.env.ONLY_VIEWPORT),
)) {
  for (const dsf of vw <= 768 ? [1, 2] : [1]) {
    const { page, close } = await newPage({ width: vw, height: vh }, dsf);
    const magenta = await page.evaluate(() => window.mockupHarness.testImage(600, 900, "solid"));
    const cases = [];
    for (const [ft, col] of variants)
      for (const [bn, ac, mk] of boxes)
        for (const w of [Math.round(vw * 0.42), Math.round(vw * 0.9)]) {
          const width = Math.min(w, 700);
          cases.push({
            id: `${col}|${bn}|${width}`,
            frameType: ft,
            color: col,
            aspectClass: ac,
            boxStyle: mk(width),
            poster: magenta,
          });
        }
    // dedupe ids
    const uniq = [...new Map(cases.map((c) => [c.id, c])).values()];
    const rows = await measure(page, uniq, dsf);
    for (const r of rows) {
      measured++;
      // a few anti-aliased edge pixels are fine; real gaps/overflow are strips (hundreds of px)
      const tol = 4;
      if (r.gap > worst.gap) worst = { ...worst, gap: r.gap, id: `${vn} x${dsf} ${r.id}` };
      if (r.overflow > worst.overflow)
        worst = { ...worst, overflow: r.overflow, id: `${vn} x${dsf} ${r.id}` };
      check(
        `${vn} @${dsf}x ${r.id}: strips gap=${r.gap} overflow=${r.overflow} (thin AA px ${r.thin}, hole ${r.hole}px)`,
        () => {
          assert.ok(r.hole > 100, "hole not found");
          assert.ok(r.gap <= tol, `GAP ${r.gap}px`);
          assert.ok(r.overflow <= tol, `OVERFLOW ${r.overflow}px`);
        },
      );
    }
    if (vn === "iPhone 390" && dsf === 2)
      await page.screenshot({ path: resolve(out, "iphone.png"), fullPage: true });
    if (vn === "desktop 1920" && dsf === 1)
      await page.screenshot({ path: resolve(out, "desktop.png"), fullPage: true });
    await close();
  }
}

// ---------- 2) geometry facts on the real DOM ----------
{
  const { page, close } = await newPage({ width: 1200, height: 900 });
  const magenta = await page.evaluate(() => window.mockupHarness.testImage(600, 900, "solid"));
  const cases = [];
  for (const [ft, col] of variants)
    for (const [bn, ac, mk] of boxes)
      cases.push({
        id: `${col}|${bn}`,
        frameType: ft,
        color: col,
        aspectClass: ac,
        boxStyle: mk(300),
        poster: magenta,
      });
  await page.evaluate((c) => window.mockupHarness.mount(c), cases);
  const info = await page.evaluate(() =>
    [...document.querySelectorAll("[data-case]")].map((el) => {
      const stage = el.querySelector('[data-testid="frame-stage"]');
      const st = stage.getBoundingClientRect();
      const box = el.firstElementChild.getBoundingClientRect();
      const img = [...stage.querySelectorAll("img")].pop();
      const ir = img.getBoundingClientRect();
      const poster = stage.querySelector('[data-testid="frame-poster-layer"] img');
      const cs = getComputedStyle(poster);
      return {
        id: el.dataset.case,
        stage: [st.width, st.height],
        box: [box.width, box.height],
        overlay: [ir.width, ir.height],
        fit: cs.objectFit,
        pos: cs.objectPosition,
        insideBox: st.left >= box.left - 0.5 && st.right <= box.right + 0.5,
      };
    }),
  );
  for (const r of info) {
    check(`${r.id}: frame art is never stretched (overlay ratio = image ratio)`, () =>
      assert.ok(
        Math.abs(r.overlay[0] / r.overlay[1] - r.stage[0] / r.stage[1]) < 0.002 &&
          Math.abs(r.stage[0] / r.stage[1] - 0.6664) < 0.003,
      ),
    );
    check(`${r.id}: poster object-fit cover, centred`, () => {
      assert.equal(r.fit, "cover");
      assert.match(r.pos, /^50% 50%$/);
    });
    check(`${r.id}: stage stays inside its box (frame fully visible horizontally)`, () =>
      assert.ok(r.insideBox),
    );
  }
  await close();
}

// ---------- 3) real-looking user images: never distorted, never leaving the opening ----------
{
  const { page, close } = await newPage({ width: 1200, height: 900 });
  const kinds = [
    ["portrait", 600, 900],
    ["landscape", 1200, 800],
    ["square", 800, 800],
    ["very tall", 400, 2000],
    ["very wide", 2400, 500],
    ["hi-res 3000x4500", 3000, 4500],
    ["low-res 60x90", 60, 90],
  ];
  for (const [ft, col] of variants) {
    const cases = [];
    for (const [kn, w, h] of kinds)
      cases.push({
        id: `${kn}`,
        frameType: ft,
        color: col,
        aspectClass: "aspect-[2/3]",
        boxStyle: { width: 360 },
        poster: await page.evaluate(
          ([w, h]) => window.mockupHarness.testImage(w, h, "disc"),
          [w, h],
        ),
      });
    await page.evaluate((c) => window.mockupHarness.mount(c), cases);
    for (const [kn] of kinds) {
      const el = page.locator(`[data-case="${kn}"]`);
      const { x0, y0, x1, y1 } = await discBox(page, await el.screenshot({ type: "png" }));
      const rw = x1 - x0 + 1,
        rh = y1 - y0 + 1;
      check(`${col}: ${kn} image — disc stays round (${rw}×${rh}px) → not stretched`, () => {
        assert.ok(x1 > 0, "disc not visible");
        assert.ok(Math.abs(rw / rh - 1) < 0.03, `ratio ${(rw / rh).toFixed(3)}`);
      });
      if (kn === "very wide") await el.screenshot({ path: resolve(out, `${col}-very-wide.png`) });
      if (kn === "portrait") await el.screenshot({ path: resolve(out, `${col}-portrait.png`) });
    }
  }
  await close();
}

await browser.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const r of failed) console.log("FAIL", r[1], r[2] ?? "");
console.log(
  `measured ${measured} frame boxes; worst gap ${worst.gap}px, worst overflow ${worst.overflow}px (${worst.id})`,
);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(
  resolve(out, "summary.json"),
  JSON.stringify(
    { worst, passed: results.length - failed.length, total: results.length, failed },
    null,
    1,
  ),
);
process.exit(failed.length ? 1 : 0);
