import { describe, expect, it } from "vitest";
import { distributeOfferDiscounts, type DiscountLine } from "./offer-discount";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("distributeOfferDiscounts", () => {
  it("discounts only the lines of the offer's size", () => {
    const lines: DiscountLine[] = [
      { price: 230, qty: 1, size: "20x30" },
      { price: 230, qty: 1, size: "20x30" },
      { price: 450, qty: 1, size: "40x50" },
      { price: 950, qty: 1, size: "100x60" },
    ];
    const d = distributeOfferDiscounts(lines, { "20x30": 40 });
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(0);
    expect(d[0] + d[1]).toBe(40);
  });

  it("always adds back to the discount shown to the customer", () => {
    const lines: DiscountLine[] = [
      { price: 233, qty: 1, size: "30x40" },
      { price: 233, qty: 2, size: "30x40" },
      { price: 281, qty: 1, size: "30x40" },
      { price: 190, qty: 1, size: "20x30" },
      { price: 190, qty: 5, size: "20x30" },
    ];
    const d = distributeOfferDiscounts(lines, { "30x40": 101, "20x30": 77 });
    expect(d[0] + d[1] + d[2]).toBe(101);
    expect(d[3] + d[4]).toBe(77);
    expect(sum(d)).toBe(178);
  });

  it("never touches bundle lines or other sizes, and handles no discount", () => {
    const lines: DiscountLine[] = [
      { price: 890, qty: 1, size: "30x40", bundle: { key: "b" } },
      { price: 280, qty: 1, size: "30x40" },
    ];
    const d = distributeOfferDiscounts(lines, { "30x40": 30 });
    expect(d).toEqual([0, 30]);
    expect(distributeOfferDiscounts(lines, {})).toEqual([0, 0]);
    expect(distributeOfferDiscounts(lines, { "20x30": 50 })).toEqual([0, 0]);
  });

  it("scales by quantity within the size", () => {
    const lines: DiscountLine[] = [
      { price: 200, qty: 3, size: "20x30" },
      { price: 200, qty: 1, size: "20x30" },
    ];
    expect(distributeOfferDiscounts(lines, { "20x30": 40 })).toEqual([30, 10]);
  });
});
