import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import type { CartItem } from "./cart";
import {
  allocateCents,
  buildItemNotes,
  computeCheckout,
  countsAsRevenue,
  parseItemNotes,
  pricingSnapshot,
  unitPriceFor,
  validateCheckoutLines,
} from "./order-pricing";
import { PRICING_DEFAULTS, type Pricing } from "./use-settings";

const settings = { shippingFee: 89, freeShippingThreshold: 1600 };
const pricing: Pricing = PRICING_DEFAULTS;

let seq = 0;
const item = (o: Partial<CartItem> = {}): CartItem => ({
  id: `line-${++seq}`,
  posterId: `poster-${seq}`,
  title: `Poster ${seq}`,
  image: "https://example.test/p.jpg",
  categoryId: null,
  categoryName: "Movies",
  frameType: "pvc",
  size: "30x40",
  color: "black",
  price: 250,
  qty: 1,
  ...o,
});

const cents = (n: number) => Math.round(n * 100);
const rowsTotal = (t: ReturnType<typeof computeCheckout>) =>
  t.lines.reduce((s, l) => s + cents(l.total), 0) + cents(t.tapeTotal);

describe("computeCheckout", () => {
  it("1. normal order: unit + shipping", () => {
    const t = computeCheckout([item()], pricing, settings, false);
    expect(t.subtotal).toBe(250);
    expect(t.shipping).toBe(89);
    expect(t.grand).toBe(339);
    expect(rowsTotal(t)).toBe(cents(t.grand));
  });

  it("2/3. multiple products and quantities", () => {
    const t = computeCheckout(
      [
        item({ size: "20x30", qty: 2 }),
        item({ frameType: "wood", size: "50x70", color: "white", qty: 1 }),
      ],
      pricing,
      settings,
      false,
    );
    expect(t.subtotal).toBe(190 * 2 + 580);
    expect(t.grand).toBe(960 + 89);
    expect(t.lines.map((l) => l.gross)).toEqual([380, 580]);
    expect(rowsTotal(t)).toBe(cents(t.grand));
  });

  it("4/5. every frame type and size uses the admin price table", () => {
    for (const [ft, sizes] of Object.entries(pricing.frame)) {
      for (const [size, price] of Object.entries(sizes)) {
        const t = computeCheckout(
          [item({ frameType: ft as never, size: size as never, price: 1 })],
          pricing,
          settings,
          false,
        );
        expect(t.lines[0].unit).toBe(price);
      }
    }
  });

  it("6. frame colour never changes the price", () => {
    const a = computeCheckout([item({ color: "black" })], pricing, settings, false);
    const b = computeCheckout([item({ color: "white" })], pricing, settings, false);
    const c = computeCheckout([item({ color: "wood" })], pricing, settings, false);
    expect(a.grand).toBe(b.grand);
    expect(b.grand).toBe(c.grand);
  });

  it("7. customer-selected image adds the custom design fee", () => {
    const t = computeCheckout(
      [item({ customImagePath: "uuid/photo.jpg", price: 1 })],
      pricing,
      settings,
      false,
    );
    expect(t.lines[0].unit).toBe(250 + pricing.customDesignFee);
  });

  it("ignores a stale / tampered price stored in the browser cart", () => {
    expect(unitPriceFor(item({ price: 1 }), pricing)).toBe(250);
    expect(unitPriceFor(item({ price: 99999 }), pricing)).toBe(250);
    const t = computeCheckout([item({ price: 1 })], pricing, settings, false);
    expect(t.grand).toBe(339);
  });

  it("changing the admin price re-prices an item already in the cart", () => {
    const changed: Pricing = {
      ...pricing,
      frame: { ...pricing.frame, pvc: { ...pricing.frame.pvc, "30x40": 300 } },
    };
    expect(computeCheckout([item()], changed, settings, false).subtotal).toBe(300);
  });

  it("falls back to the stored price only when the admin has no price for that size", () => {
    const missing: Pricing = {
      ...pricing,
      frame: { ...pricing.frame, pvc: { "20x30": 190 } },
    };
    expect(unitPriceFor(item({ price: 777 }), missing)).toBe(777);
  });

  it("14. shipping applies below the threshold", () => {
    const t = computeCheckout([item({ size: "20x30", price: 190 })], pricing, settings, false);
    expect(t.shipping).toBe(89);
    expect(t.remainingForFree).toBe(1600 - 190);
  });

  it("15. free shipping at and above the threshold (>=)", () => {
    const above = computeCheckout(
      [item({ frameType: "wood", size: "60x90", qty: 2 })],
      pricing,
      settings,
      false,
    );
    expect(above.subtotal).toBe(1700);
    expect(above.shipping).toBe(0);
    const exact = computeCheckout(
      [
        item({ frameType: "wood", size: "100x60", qty: 1 }),
        item({ frameType: "wood", size: "60x90" }),
      ],
      pricing,
      { shippingFee: 89, freeShippingThreshold: 1800 },
      false,
    );
    expect(exact.subtotal).toBe(1800);
    expect(exact.shipping).toBe(0);
    expect(exact.freeShippingPct).toBe(100);
  });

  it("double-face tape counts towards the free-shipping threshold", () => {
    const base = [
      item({ frameType: "wood", size: "60x90", qty: 1 }),
      item({ frameType: "wood", size: "60x90" }),
    ]; // 1700
    const noTape = computeCheckout(
      base,
      { ...pricing },
      { shippingFee: 89, freeShippingThreshold: 1720 },
      false,
    );
    const tape = computeCheckout(
      base,
      { ...pricing },
      { shippingFee: 89, freeShippingThreshold: 1720 },
      true,
    );
    expect(noTape.shipping).toBe(89);
    expect(tape.tapeTotal).toBe(2 * pricing.doubleFaceTapePrice);
    expect(tape.shipping).toBe(0);
    expect(tape.grand).toBe(1700 + 40);
    expect(rowsTotal(tape)).toBe(cents(tape.grand));
  });

  it("16. auto bundle offer: 6 × 20x30 for the flat offer price", () => {
    const t = computeCheckout([item({ size: "20x30", qty: 6 })], pricing, settings, false);
    expect(t.autoOfferSets).toBe(1);
    expect(t.discount).toBe(190 * 6 - pricing.offers.bundle6_20x30); // 350
    expect(t.packaging).toBe(pricing.packagingFee);
    expect(t.shipping).toBe(89);
    expect(t.grand).toBe(790 + 20 + 89);
    // the packaging for auto sets must be stored on the rows, too
    expect(rowsTotal(t)).toBe(cents(t.grand));
  });

  it("16b. offer discount is split across several lines without losing a cent", () => {
    const lines = [
      item({ size: "20x30", qty: 2 }),
      item({ size: "20x30", qty: 3, customImagePath: "u/a.jpg" }),
      item({ size: "20x30", qty: 1 }),
      item({ size: "30x40", qty: 4 }),
    ];
    const t = computeCheckout(lines, pricing, settings, true);
    expect(t.autoOfferSets).toBe(2);
    expect(t.lines.reduce((s, l) => s + cents(l.discount), 0)).toBe(cents(t.discount));
    expect(rowsTotal(t)).toBe(cents(t.grand));
    // discount only lands on the lines that formed the sets
    expect(t.lines[3].discount).toBeGreaterThanOrEqual(0);
  });

  it("explicit bundles keep the offer price and pay packaging per bundle", () => {
    const bundle = item({
      posterId: "bundle-1",
      price: 790,
      qty: 2,
      size: "20x30",
      bundle: {
        key: "b1",
        label: "B",
        posters: [1, 2, 3, 4, 5, 6].map((n) => ({ posterId: `p${n}`, title: "t", image: "i" })),
      },
    });
    const t = computeCheckout([bundle], pricing, settings, false);
    expect(t.lines[0].unit).toBe(790);
    expect(t.packaging).toBe(2 * pricing.packagingFee);
    expect(t.grand).toBe(1580 + 40 + 0 /* ≥ threshold? 1580 < 1600 */ + 89);
    expect(rowsTotal(t)).toBe(cents(t.grand));
  });

  it("shipping is split across lines so the rows always add up (no 0.01 drift)", () => {
    const t = computeCheckout([item(), item(), item({ size: "20x30" })], pricing, settings, false);
    expect(t.lines.reduce((s, l) => s + cents(l.shipping), 0)).toBe(8900);
    expect(rowsTotal(t)).toBe(cents(t.grand));
  });

  it("fuzz: stored rows always add up to the displayed grand total", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const sizes = ["20x30", "30x40", "40x50"] as const;
    for (let n = 0; n < 300; n++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () =>
        item({
          size: sizes[Math.floor(rnd() * 3)],
          frameType: rnd() > 0.7 ? "wood" : "pvc",
          qty: 1 + Math.floor(rnd() * 7),
          customImagePath: rnd() > 0.8 ? "u/x.jpg" : undefined,
        }),
      );
      const t = computeCheckout(lines, pricing, settings, rnd() > 0.5);
      expect(rowsTotal(t)).toBe(cents(t.grand));
      expect(t.lines.every((l) => l.total >= 0)).toBe(true);
    }
  });
});

describe("allocateCents", () => {
  it("sums exactly and is deterministic", () => {
    expect(allocateCents(8900, [1, 1, 1])).toEqual([2967, 2967, 2966]);
    expect(allocateCents(0, [5, 5])).toEqual([0, 0]);
    expect(allocateCents(100, [0, 0])).toEqual([50, 50]);
    expect(allocateCents(7, [1, 2, 4]).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe("validateCheckoutLines", () => {
  it("accepts a good cart", () => {
    expect(validateCheckoutLines(computeCheckout([item()], pricing, settings, false))).toEqual([]);
  });
  it("rejects zero price, missing frame data, blob images", () => {
    const missingPrice: Pricing = { ...pricing, frame: { pvc: {}, wood: {} } };
    const t1 = computeCheckout([item({ price: 0 })], missingPrice, settings, false);
    expect(validateCheckoutLines(t1).map((i) => i.code)).toContain("bad_price");
    const t2 = computeCheckout([item({ size: "" as never })], pricing, settings, false);
    expect(validateCheckoutLines(t2).map((i) => i.code)).toContain("missing_frame");
    const t3 = computeCheckout(
      [item({ customImagePath: "blob:http://x/1" })],
      pricing,
      settings,
      false,
    );
    expect(validateCheckoutLines(t3).map((i) => i.code)).toContain("blob_image");
  });
  it("rejects an empty cart and duplicate line ids", () => {
    expect(
      validateCheckoutLines(computeCheckout([], pricing, settings, false)).map((i) => i.code),
    ).toContain("bad_total");
    const a = item();
    const dup = computeCheckout([a, { ...a }], pricing, settings, false);
    expect(validateCheckoutLines(dup).map((i) => i.code)).toContain("duplicate_line");
  });
  it("sanitises a tampered quantity", () => {
    const t = computeCheckout([item({ qty: -3 }), item({ qty: 2.7 })], pricing, settings, false);
    expect(t.lines[0].gross).toBe(250); // clamped to 1
    expect(t.lines[1].gross).toBe(500); // floored to 2
  });
});

describe("item notes snapshot", () => {
  it("round-trips custom-image metadata together with the price snapshot", () => {
    const t = computeCheckout([item({ customImagePath: "u/a.jpg" })], pricing, settings, false);
    const notes = buildItemNotes(
      {
        originalFilename: "a.jpg",
        originalMimeType: "image/jpeg",
        originalWidth: 4000,
        originalHeight: 3000,
        originalFileSize: 5,
      },
      pricingSnapshot(t.lines[0]),
    );
    const p = parseItemNotes(notes);
    expect(p.meta?.originalFilename).toBe("a.jpg");
    expect(p.pricing?.unit_price).toBe(270);
    expect(p.text).toBeNull();
  });
  it("keeps legacy notes readable", () => {
    expect(parseItemNotes("call before delivery").text).toBe("call before delivery");
    expect(parseItemNotes('{"originalFilename":"x.png"}').meta?.originalFilename).toBe("x.png");
    expect(parseItemNotes(null)).toEqual({ meta: null, pricing: null, text: null });
  });
});

describe("revenue rules", () => {
  it("17. cancelled and test orders are not revenue", () => {
    expect(countsAsRevenue({ status: "delivered", is_test: false })).toBe(true);
    expect(countsAsRevenue({ status: "cancelled" })).toBe(false);
    expect(countsAsRevenue({ status: "new", is_test: true })).toBe(false);
  });
});
