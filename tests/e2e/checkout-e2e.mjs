// End-to-end checkout in a real browser, against the REAL /cart page and a scratch Postgres
// that has supabase/migrations/*_place_order_server_pricing.sql applied.
// The browser's Supabase REST calls are answered by this script (no network, no Supabase project):
//   site_settings reads → rows from the scratch DB;   rpc/place_order → the real SQL function
//   POST orders / order_posters (legacy fallback) → inserted into the scratch DB
//
//   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGDATABASE=brw_test \
//   npx vite build && npx vite preview --port 4173 &  node tests/e2e/checkout-e2e.mjs
// (build with VITE_SUPABASE_URL=http://127.0.0.1:8099 so every API call is intercepted)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APP = process.env.APP_URL ?? "http://127.0.0.1:4173";
const API = "http://127.0.0.1:8099";
const psql = (sql) =>
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-X", "-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/",
)("playwright");

const SETTINGS = {
  shipping_fee: 89,
  free_shipping_threshold: 1600,
  packaging_fee: 20,
  custom_design_fee: 20,
  double_face_tape_price: 20,
  double_face_tape_enabled: 0,
  offer_6_20x30: 790,
  offer_4_30x40: 890,
  frame_pvc_20x30: 190,
  frame_pvc_30x40: 250,
  frame_pvc_40x50: 350,
  frame_wood_20x30: 190,
  frame_wood_30x40: 270,
  frame_wood_40x50: 400,
  frame_wood_40x60: 450,
  frame_wood_50x60: 500,
  frame_wood_50x70: 580,
  frame_wood_60x90: 850,
  frame_wood_100x60: 950,
};
const seed = () =>
  psql(
    `TRUNCATE site_settings; INSERT INTO site_settings VALUES ${Object.entries(SETTINGS)
      .map(([k, v]) => `(${lit(k)}, to_jsonb(${v}::numeric))`)
      .join(
        ",",
      )}; TRUNCATE orders, order_posters; INSERT INTO posters (id, title) VALUES ('7b0d1d52-3f2b-4a0e-9a7e-2f3f8f3b2a11', 'Liverpool') ON CONFLICT DO NOTHING`,
  );

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message.split("\n")[0]]);
  }
};

const CART = [
  // price: 1 is a tampered browser price — the server must ignore it
  {
    id: "l1",
    posterId: "7b0d1d52-3f2b-4a0e-9a7e-2f3f8f3b2a11",
    title: "Liverpool",
    image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    categoryId: null,
    categoryName: "Football",
    frameType: "pvc",
    size: "30x40",
    color: "black",
    price: 1,
    qty: 2,
  },
  {
    id: "l2",
    posterId: "custom-xyz-0",
    title: "My photo",
    image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    customImagePath: "11111111-2222-3333-4444-555555555555/photo.jpg",
    customImageMeta: {
      originalFilename: "photo.jpg",
      originalMimeType: "image/jpeg",
      originalWidth: 4000,
      originalHeight: 3000,
      originalFileSize: 123,
    },
    categoryId: null,
    categoryName: "Custom",
    frameType: "wood",
    size: "50x70",
    color: "black" /* stale Wooden+Black */,
    price: 1,
    qty: 1,
  },
];

async function run(mode) {
  seed();
  const calls = { rpc: 0, legacyOrders: 0 };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2200 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 160)));
  if (process.env.DEBUG) {
    page.on(
      "console",
      (m) =>
        ["error", "warning"].includes(m.type()) &&
        console.log("console." + m.type(), m.text().slice(0, 220)),
    );
    page.on(
      "request",
      (q) =>
        q.url().startsWith(API) &&
        q.method() !== "GET" &&
        console.log("API", q.method(), new URL(q.url()).pathname),
    );
  }
  await page.route(`${API}/**`, async (r) => {
    const req = r.request();
    const u = new URL(req.url());
    const m = req.method();
    const json = (status, body) =>
      r.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    if (m === "OPTIONS")
      return r.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    if (u.pathname.endsWith("/rpc/place_order")) {
      calls.rpc++;
      if (mode === "fallback")
        return json(404, {
          code: "PGRST202",
          message:
            "Could not find the function public.place_order(p_customer, p_items, p_payment) in the schema cache",
        });
      const b = JSON.parse(req.postData());
      try {
        const out = psql(
          `SELECT public.place_order(${lit(JSON.stringify(b.p_customer))}::jsonb, ${lit(JSON.stringify(b.p_items))}::jsonb, ${lit(JSON.stringify(b.p_payment))}::jsonb)`,
        );
        return json(200, JSON.parse(out));
      } catch (e) {
        const err = String(e.stderr ?? e);
        if (/price_changed/.test(err))
          return json(400, {
            code: "PC001",
            message: "price_changed",
            details: (err.match(/server_total=[0-9.]+/) ?? [""])[0],
          });
        return json(400, { code: "P0001", message: err.slice(0, 200) });
      }
    }
    if (u.pathname.endsWith("/orders") && m === "POST") {
      calls.legacyOrders++;
      const rows = JSON.parse(req.postData());
      // like PostgREST: only the columns present in the body, the rest take their defaults
      const cols = Object.keys(rows[0])
        .map((c) => `"${c}"`)
        .join(",");
      psql(
        `INSERT INTO orders (${cols}) SELECT ${cols} FROM json_populate_recordset(null::orders, ${lit(JSON.stringify(rows))}::json)`,
      );
      return r.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    if (u.pathname.endsWith("/order_posters") && m === "POST")
      return r.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    if (u.pathname.endsWith("/site_settings") && m === "GET") {
      const eq = u.searchParams.get("key")?.match(/^eq\.(.+)$/)?.[1];
      const rows = JSON.parse(
        psql(
          `SELECT coalesce(json_agg(json_build_object('key', key, 'value', value)), '[]') FROM site_settings`,
        ),
      );
      if (eq || /pgrst\.object/.test(req.headers().accept ?? "")) {
        const hit = rows.find((x) => x.key === eq);
        return hit ? json(200, hit) : json(406, { code: "PGRST116", message: "no rows" });
      }
      return json(200, rows);
    }
    return m === "GET" ? json(200, []) : json(201, {});
  });
  await page.addInitScript((cart) => {
    localStorage.setItem("brwazwneon_cart_v1", JSON.stringify(cart));
    sessionStorage.setItem("photo4x6_upsell_shown", "1");
  }, CART);
  await page.goto(`${APP}/cart`, { waitUntil: "networkidle" });
  await page.waitForSelector('label:has-text("Full name") input');
  await page.fill('label:has-text("Full name") input', "Ahmed Hassan");
  await page.fill('input[type="tel"]', "01012345678");
  await page.selectOption('label:has-text("Governorate") select', { index: 1 });
  await page.fill('label:has-text("Address") textarea', "12 Tahrir St, Dokki");
  return { page, browser, calls };
}

const rowsOf = () =>
  JSON.parse(
    psql(
      `SELECT coalesce(json_agg(json_build_object('title', poster_title, 'frame', frame_type, 'color', frame_color, 'size', size, 'qty', quantity, 'sub', subtotal, 'pack', packaging_fee, 'ship', shipping_cost, 'total', total_price, 'group', order_group_id, 'img', poster_image) ORDER BY created_at, poster_title), '[]') FROM orders`,
    ),
  );
const sum = (rows) => Math.round(rows.reduce((s, r) => s + Number(r.total) * 100, 0)) / 100;
// expected: 2×250 + wood 50x70 (580 + 20 custom fee) = 1100; below 1600 → +89 shipping
const EXPECTED = 500 + 600 + 89;

// ---------- A) server-priced checkout, tampered browser prices ----------
{
  const { page, browser, calls } = await run("server");
  await page.screenshot({
    path: resolve(root, "test-results/order-visuals/checkout-cart.png"),
    fullPage: true,
  });
  const shown = await page.locator("text=/\\b1,?189\\b/").count();
  await page.click('button:has-text("تأكيد الطلب")');
  await page.waitForURL("**/order-confirmed", { timeout: 20000 });
  const rows = rowsOf();
  check("A: customer lands on /order-confirmed (not a 404)", () =>
    assert.match(page.url(), /order-confirmed/),
  );
  check(
    `A: cart showed the server-equal total ${EXPECTED} even though the stored browser prices were 1`,
    () => assert.ok(shown > 0, "total not displayed"),
  );
  check("A: placed through place_order (1 RPC, no legacy insert)", () => {
    assert.equal(calls.rpc, 1);
    assert.equal(calls.legacyOrders, 0);
  });
  check(`A: stored rows add up to ${EXPECTED}`, () => assert.equal(sum(rows), EXPECTED));
  check("A: tampered price 1 was ignored (Liverpool line = 2 × 250 + shipping share)", () => {
    const l = rows.find((r) => r.title === "Liverpool");
    assert.equal(Number(l.sub), 500);
  });
  check("A: custom design = wood 580 + 20 fee, kept as the permanent storage path", () => {
    const c = rows.find((r) => r.title === "My photo");
    assert.equal(Number(c.sub), 600);
    assert.equal(c.img, "11111111-2222-3333-4444-555555555555/photo.jpg");
  });
  check("A: stale 'Wooden + Black' in the saved cart was repaired to Wooden (no colour)", () => {
    const c = rows.find((r) => r.title === "My photo");
    assert.equal(c.frame, "Wooden Portrait");
    assert.equal(c.color, "Wood");
  });
  check("A: one order_group_id for the whole checkout", () =>
    assert.equal(new Set(rows.map((r) => r.group)).size, 1),
  );
  await browser.close();
}

// ---------- B) prices change while the cart is open ----------
{
  const { page, browser, calls } = await run("server");
  psql("UPDATE site_settings SET value = to_jsonb(300::numeric) WHERE key = 'frame_pvc_30x40'"); // admin raises 250 → 300 after the page loaded
  await page.click('button:has-text("تأكيد الطلب")');
  await page.waitForSelector("text=/الأسعار اتحدّثت/", { timeout: 20000 });
  check("B: server refuses the stale total and nothing is written", () => {
    assert.equal(calls.rpc, 1);
    assert.equal(rowsOf().length, 0);
  });
  check("B: customer is told the new total (1,289) and stays on the cart", () =>
    assert.match(page.url(), /\/cart/),
  );
  const msg = await page
    .locator("text=/الإجمالي الجديد/")
    .first()
    .innerText()
    .catch(() => "");
  check("B: message shows the server total", () => assert.match(msg, /1289/));
  await page.waitForTimeout(800);
  await page.click('button:has-text("تأكيد الطلب")');
  await page.waitForURL("**/order-confirmed", { timeout: 20000 });
  check("B: after re-confirming, the order is placed at the NEW price 1289", () =>
    assert.equal(sum(rowsOf()), 1289),
  );
  await browser.close();
}

// ---------- C) place_order() not deployed yet → legacy insert still works ----------
{
  const { page, browser, calls } = await run("fallback");
  await page.click('button:has-text("تأكيد الطلب")');
  await page.waitForURL("**/order-confirmed", { timeout: 20000 });
  const rows = rowsOf();
  check("C: function missing → fell back to the legacy insert", () => {
    assert.equal(calls.rpc, 1);
    assert.equal(calls.legacyOrders, 1);
  });
  check(`C: legacy rows still add up to ${EXPECTED}`, () => assert.equal(sum(rows), EXPECTED));
  await browser.close();
}

for (const r of results) console.log(r[0], r[1], r[2] ?? "");
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checkout checks passed`);
process.exit(failed ? 1 : 0);
