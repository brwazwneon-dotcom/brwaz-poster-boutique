/**
 * Parity between the browser calculation (order-pricing.ts) and the server function
 * (supabase/migrations/*_place_order_server_pricing.sql).
 *
 * Skipped by default. Run against a scratch local Postgres only:
 *   PG_PARITY=1 PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGDATABASE=brw_test npx vitest run place-order-parity
 * (see tests/db/schema.sql). Never point this at a real project database.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import type { CartItem } from "./cart";
import { computeCheckout } from "./order-pricing";
import { PRICING_DEFAULTS, type Pricing } from "./use-settings";

const run = !!process.env.PG_PARITY;
const psql = (sql: string) =>
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-X", "-At", "-c", sql], {
    encoding: "utf8",
  }).trim();
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const CUSTOMER = {
  name: "Test",
  phone: "01012345678",
  governorate: "Cairo",
  address: "1 St",
  guest_session_id: "abcdefgh12",
};

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function setSettings(p: Pricing) {
  const rows: [string, number][] = [
    ["shipping_fee", p.shippingFee],
    ["free_shipping_threshold", p.freeShippingThreshold],
    ["packaging_fee", p.packagingFee],
    ["custom_design_fee", p.customDesignFee],
    ["double_face_tape_price", p.doubleFaceTapePrice],
    ["double_face_tape_enabled", 1],
    ["offer_6_20x30", p.offers.bundle6_20x30],
    ["offer_4_30x40", p.offers.bundle4_30x40],
    ...Object.entries(p.frame.pvc).map(([k, v]) => [`frame_pvc_${k}`, v] as [string, number]),
    ...Object.entries(p.frame.wood).map(([k, v]) => [`frame_wood_${k}`, v] as [string, number]),
  ];
  psql(
    `TRUNCATE site_settings; INSERT INTO site_settings VALUES ${rows.map(([k, v]) => `(${lit(k)}, to_jsonb(${v}::numeric))`).join(",")}`,
  );
}

describe.skipIf(!run)("place_order SQL ↔ order-pricing.ts parity", () => {
  it("matches on 150 random carts with random admin prices", () => {
    const rnd = seeded(2026);
    for (let n = 0; n < 150; n++) {
      const pricing: Pricing = {
        ...PRICING_DEFAULTS,
        frame: {
          pvc: {
            "20x30": 150 + Math.floor(rnd() * 100),
            "30x40": 200 + Math.floor(rnd() * 100),
            "40x50": 300 + Math.floor(rnd() * 100),
          },
          wood: { ...PRICING_DEFAULTS.frame.wood, "30x40": 260 + Math.floor(rnd() * 60) },
        },
        shippingFee: [49, 89, 99][Math.floor(rnd() * 3)],
        freeShippingThreshold: [800, 1600, 2400][Math.floor(rnd() * 3)],
        packagingFee: [0, 20, 35][Math.floor(rnd() * 3)],
        offers: {
          bundle6_20x30: 700 + Math.floor(rnd() * 150),
          bundle4_30x40: 800 + Math.floor(rnd() * 150),
        },
      };
      setSettings(pricing);
      const sizes = ["20x30", "30x40", "40x50"] as const;
      const items: CartItem[] = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => {
        const size = sizes[Math.floor(rnd() * 3)];
        const isBundle = rnd() > 0.85 && size !== "40x50";
        const per = size === "20x30" ? 6 : 4;
        const frameType = isBundle ? "pvc" : rnd() > 0.7 ? "wood" : "pvc";
        return {
          id: `l${n}-${i}`,
          posterId: `p${i}`,
          title: `P${i}`,
          image: "https://x/y.jpg",
          categoryId: null,
          categoryName: "Movies",
          frameType,
          size,
          color:
            frameType === "wood" ? "wood" : (["black", "white"] as const)[Math.floor(rnd() * 2)],
          price: 1,
          qty: 1 + Math.floor(rnd() * (isBundle ? 2 : 8)),
          customImagePath: !isBundle && rnd() > 0.8 ? `u/${i}.jpg` : undefined,
          ...(isBundle
            ? {
                price:
                  size === "20x30" ? pricing.offers.bundle6_20x30 : pricing.offers.bundle4_30x40,
                bundle: {
                  key: "b",
                  label: "B",
                  posters: Array.from({ length: per }, (_, j) => ({
                    posterId: `q${j}`,
                    title: `Q${j}`,
                    image: "i",
                  })),
                },
              }
            : {}),
        } as CartItem;
      });
      const tape = rnd() > 0.5;
      const expected = computeCheckout(
        items,
        pricing,
        { shippingFee: pricing.shippingFee, freeShippingThreshold: pricing.freeShippingThreshold },
        tape,
      );

      const payload = items.map((i) => ({
        title: i.title,
        image: i.image,
        frame_type: i.frameType,
        color: i.color,
        size: i.size,
        qty: i.qty,
        custom_image_path: i.customImagePath ?? "",
        ...(i.bundle
          ? {
              bundle: {
                posters: i.bundle.posters.map((p) => ({ title: p.title, image: p.image })),
              },
            }
          : {}),
      }));
      psql("TRUNCATE orders, order_posters");
      const placed = JSON.parse(
        psql(
          `SELECT public.place_order(${lit(JSON.stringify(CUSTOMER))}::jsonb, ${lit(JSON.stringify(payload))}::jsonb, ${lit(JSON.stringify({ method: "cod", tape, expected_total: expected.grand }))}::jsonb)`,
        ),
      ) as { total: number; row_ids: string[] };
      // second statement: rows written by the function are not visible inside the same statement
      const rows = psql(
        `SELECT json_agg(json_build_object('net', o.subtotal, 'discount', o.discount_amount, 'pack', o.packaging_fee, 'ship', o.shipping_cost, 'total', o.total_price, 'unit', o.unit_price) ORDER BY t.ord)
           FROM jsonb_array_elements_text(${lit(JSON.stringify(placed.row_ids))}::jsonb) WITH ORDINALITY t(id, ord) JOIN orders o ON o.id = t.id::uuid`,
      );
      const out = JSON.stringify({ total: placed.total, rows: JSON.parse(rows) });
      const got = JSON.parse(out) as { total: number; rows: Record<string, number>[] };
      const ctx = `case ${n}`;
      expect(Number(got.total), `${ctx} grand`).toBeCloseTo(expected.grand, 2);
      expected.lines.forEach((l, i) => {
        expect(Number(got.rows[i].total), `${ctx} line ${i} total`).toBeCloseTo(l.total, 2);
        expect(Number(got.rows[i].net), `${ctx} line ${i} net`).toBeCloseTo(l.net, 2);
        expect(Number(got.rows[i].discount), `${ctx} line ${i} discount`).toBeCloseTo(
          l.discount,
          2,
        );
        expect(Number(got.rows[i].pack), `${ctx} line ${i} packaging`).toBeCloseTo(l.packaging, 2);
        expect(Number(got.rows[i].ship), `${ctx} line ${i} shipping`).toBeCloseTo(l.shipping, 2);
        expect(Number(got.rows[i].unit), `${ctx} line ${i} unit`).toBeCloseTo(l.unit, 2);
      });
      const sumRows = got.rows.reduce((s, r) => s + Number(r.total), 0);
      expect(sumRows, `${ctx} rows add up`).toBeCloseTo(Number(got.total), 2);
    }
  }, 120_000);

  it("rejects what a hostile browser could send", () => {
    setSettings(PRICING_DEFAULTS);
    const call = (items: unknown, pay: unknown = { method: "cod" }, cust: unknown = CUSTOMER) =>
      psql(
        `SELECT public.place_order(${lit(JSON.stringify(cust))}::jsonb, ${lit(JSON.stringify(items))}::jsonb, ${lit(JSON.stringify(pay))}::jsonb)`,
      );
    const ok = { title: "t", image: "i", frame_type: "pvc", color: "black", size: "30x40", qty: 1 };
    expect(() => call([{ ...ok, qty: 0 }])).toThrow();
    expect(() => call([{ ...ok, qty: -5 }])).toThrow();
    expect(() => call([{ ...ok, size: "99x99" }])).toThrow();
    expect(() => call([{ ...ok, frame_type: "gold" }])).toThrow();
    expect(() => call([{ ...ok, color: "pink" }])).toThrow();
    expect(() => call([{ ...ok, frame_type: "wood", color: "black" }])).toThrow(); // Wooden has no colour
    expect(() => call([{ ...ok, frame_type: "pvc", color: "wood" }])).toThrow(); // PVC has no wood colour
    expect(() => call([{ ...ok, image: "blob:http://x/1" }])).toThrow();
    expect(() => call([])).toThrow();
    expect(() => call([ok], { method: "bitcoin" })).toThrow();
    expect(() => call([ok], { method: "instapay" })).toThrow(); // no screenshot
    expect(() => call([ok], { method: "cod" }, { ...CUSTOMER, phone: "123" })).toThrow();
    expect(() => call([ok], { method: "cod" }, { ...CUSTOMER, guest_session_id: "x" })).toThrow();
    expect(() => call([{ ...ok, bundle: { posters: [] } }])).toThrow();
  });

  it("ignores a price sent by the browser (the request has no price field that is read)", () => {
    setSettings(PRICING_DEFAULTS);
    psql("TRUNCATE orders, order_posters");
    const res = JSON.parse(
      psql(
        `SELECT public.place_order(${lit(JSON.stringify(CUSTOMER))}::jsonb, ${lit(JSON.stringify([{ title: "t", image: "i", frame_type: "pvc", color: "black", size: "30x40", qty: 1, price: 1, total_price: 0, unit_price: 0, shipping_cost: 0 }]))}::jsonb, '{"method":"cod","total":0}'::jsonb)`,
      ),
    );
    expect(Number(res.total)).toBe(250 + 89);
  });

  it("rejects when the customer's expected total no longer matches (price changed) and writes nothing", () => {
    setSettings(PRICING_DEFAULTS);
    psql("TRUNCATE orders, order_posters");
    const item = {
      title: "t",
      image: "i",
      frame_type: "pvc",
      color: "black",
      size: "30x40",
      qty: 1,
    };
    const place = (expected: number) =>
      psql(
        `SELECT public.place_order(${lit(JSON.stringify(CUSTOMER))}::jsonb, ${lit(JSON.stringify([item]))}::jsonb, ${lit(JSON.stringify({ method: "cod", expected_total: expected }))}::jsonb)`,
      );
    let err = "";
    try {
      place(300);
    } catch (e) {
      err = String((e as { stderr?: Buffer }).stderr ?? e);
    }
    expect(err).toMatch(/price_changed/);
    expect(err).toMatch(/server_total=339/);
    expect(psql("SELECT count(*) FROM orders")).toBe("0");
    expect(Number(JSON.parse(place(339)).total)).toBe(339);
    expect(psql("SELECT count(*) FROM orders")).toBe("1");
  });

  it("handles real posters, custom designs, deleted posters and notes exactly like the old client", () => {
    setSettings(PRICING_DEFAULTS);
    psql("TRUNCATE orders, order_posters; TRUNCATE posters CASCADE");
    const real = psql("INSERT INTO posters (title) VALUES ('Real') RETURNING id").split("\n")[0];
    const real2 = psql("INSERT INTO posters (title) VALUES ('Real 2') RETURNING id").split("\n")[0];
    const ghost = "11111111-2222-3333-4444-555555555555"; // valid uuid, no such poster
    const items = [
      {
        poster_id: real,
        title: "Catalogue",
        image: "https://x/a.jpg",
        frame_type: "pvc",
        color: "black",
        size: "30x40",
        qty: 1,
      },
      {
        poster_id: null,
        title: "Custom",
        image: "https://x/signed",
        frame_type: "wood",
        color: "wood",
        size: "50x70",
        qty: 2,
        custom_image_path: "uuid-1/photo.jpg",
        custom_meta: { originalFilename: "photo.jpg", originalWidth: 4000 },
      },
      {
        poster_id: ghost,
        title: "Deleted",
        image: "https://x/d.jpg",
        frame_type: "pvc",
        color: "white",
        size: "20x30",
        qty: 1,
      },
      {
        title: "Bundle",
        image: "https://x/b.jpg",
        frame_type: "pvc",
        color: "black",
        size: "30x40",
        qty: 1,
        bundle: {
          posters: [
            { poster_id: real, title: "P1", image: "i1" },
            { poster_id: real2, title: "P2", image: "i2" },
            { poster_id: null, title: "P3", image: "i3" },
            { poster_id: ghost, title: "P4", image: "i4" },
          ],
        },
      },
    ];
    const res = JSON.parse(
      psql(
        `SELECT public.place_order(${lit(JSON.stringify(CUSTOMER))}::jsonb, ${lit(JSON.stringify(items))}::jsonb, '{"method":"cod"}'::jsonb)`,
      ),
    ) as { row_ids: string[]; order_group_id: string };
    expect(res.row_ids).toHaveLength(4);
    const rows = JSON.parse(
      psql(
        `SELECT json_agg(json_build_object('title', poster_title, 'sel', selected_poster, 'img', poster_image, 'notes', notes, 'group', order_group_id) ORDER BY t.ord) FROM jsonb_array_elements_text(${lit(JSON.stringify(res.row_ids))}::jsonb) WITH ORDINALITY t(id, ord) JOIN orders o ON o.id = t.id::uuid`,
      ),
    ) as { title: string; sel: string | null; img: string; notes: string; group: string }[];
    expect(rows[0].sel).toBe(real); // existing poster is linked
    expect(rows[1].sel).toBeNull(); // custom design: no poster
    expect(rows[1].img).toBe("uuid-1/photo.jpg"); // permanent storage path, like the old client
    expect(rows[2].sel).toBeNull(); // deleted poster: order still placed
    expect(rows[3].title).toBe("Bundle — P1, P2, P3, P4");
    expect(new Set(rows.map((r) => r.group)).size).toBe(1); // one group id for the whole checkout
    const n1 = JSON.parse(rows[1].notes);
    expect(n1.originalFilename).toBe("photo.jpg"); // custom metadata kept, merged with the snapshot
    expect(n1.pricing.v).toBe(1);
    expect(JSON.parse(rows[0].notes).pricing.unit_price).toBe(250); // plain object, not [null, {...}]
    // order_posters only for posters that exist: 1 (catalogue) + 2 (bundle real ones)
    expect(psql("SELECT count(*) FROM order_posters")).toBe("3");
  });
});
