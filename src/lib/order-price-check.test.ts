import { describe, expect, it } from "vitest";
import {
  checkOrderRows,
  hasHardFinding,
  parsePriceCheckMode,
  type CheckRow,
} from "./order-price-check";

const settings = {
  frame_pvc_30x40: 450,
  frame_wood_50x70: 900,
  shipping_fee: 90,
  free_shipping_threshold: 1600,
  custom_design_fee: 20,
};
const row = (o: Partial<CheckRow> = {}): CheckRow => ({
  frame_type: "High Quality PVC",
  size: "30 x 40 cm",
  quantity: 1,
  poster_title: "Joker (26)",
  selected_poster: "123e4567-e89b-12d3-a456-426614174000",
  subtotal: 450,
  packaging_fee: 0,
  shipping_cost: 90,
  total_price: 540,
  ...o,
});
const codes = (rows: CheckRow[]) => checkOrderRows(rows, settings).map((f) => f.code);

describe("checkOrderRows", () => {
  it("passes a normal order", () => {
    expect(codes([row()])).toEqual([]);
  });

  it("passes quantity and a discount above the floor", () => {
    expect(codes([row({ quantity: 2, subtotal: 800, total_price: 890 })])).toEqual([]);
  });

  it("flags a line priced above the catalog (hard)", () => {
    const f = checkOrderRows([row({ subtotal: 900, total_price: 990 })], settings);
    expect(f.map((x) => x.code)).toContain("above_catalog");
    expect(hasHardFinding(f)).toBe(true);
  });

  it("flags a row whose total is not the sum of its parts", () => {
    expect(codes([row({ total_price: 600 })])).toContain("total_mismatch");
  });

  it("flags negative amounts", () => {
    expect(codes([row({ subtotal: -5, total_price: 85 })])).toContain("invalid_amount");
  });

  it("flags a heavy discount below the floor as soft only", () => {
    const f = checkOrderRows([row({ subtotal: 100, total_price: 190 })], settings);
    expect(f.map((x) => x.code)).toEqual(["below_floor"]);
    expect(hasHardFinding(f)).toBe(false);
  });

  it("skips bundles, tape lines and unrecognised sizes", () => {
    expect(
      codes([
        row({
          poster_title: "4 Frames Bundle · 30 × 40 cm — A, B",
          subtotal: 1100,
          total_price: 1190,
        }),
        row({ poster_title: "Double Face Tape", subtotal: 40, shipping_cost: 0, total_price: 40 }),
        row({ size: "12 x 12 cm", subtotal: 9999, total_price: 10089 }),
      ]),
    ).not.toContain("above_catalog");
  });

  it("allows the custom-design fee on top of the frame price", () => {
    expect(
      codes([
        row({
          poster_title: "Custom Design #1",
          selected_poster: null,
          subtotal: 470,
          total_price: 560,
        }),
      ]),
    ).toEqual([]);
  });

  it("checks shipping per checkout, free over the threshold", () => {
    expect(
      codes([row({ quantity: 4, subtotal: 1700, shipping_cost: 0, total_price: 1700 })]),
    ).not.toContain("shipping_off");
    expect(codes([row({ shipping_cost: 0, total_price: 450 })])).toContain("shipping_off");
  });

  it("splits shipping across rows without false alarms", () => {
    const part = { shipping_cost: 30, total_price: 480 };
    expect(codes([row(part), row(part), row(part)])).toEqual([]);
  });
});

describe("parsePriceCheckMode", () => {
  it("defaults to log", () => {
    expect(parsePriceCheckMode(undefined)).toBe("log");
    expect(parsePriceCheckMode("nonsense")).toBe("log");
    expect(parsePriceCheckMode(" Enforce ")).toBe("enforce");
    expect(parsePriceCheckMode("off")).toBe("off");
  });
});
