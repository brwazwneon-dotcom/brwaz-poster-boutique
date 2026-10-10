import { describe, expect, it } from "vitest";
import { splitAmount } from "./money-split";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("splitAmount", () => {
  it("splits evenly when it can", () => {
    expect(splitAmount(90, 3)).toEqual([30, 30, 30]);
  });
  it("keeps the exact total with remainder cents on the first rows", () => {
    expect(splitAmount(89, 3)).toEqual([29.67, 29.67, 29.66]);
    expect(sum(splitAmount(89, 3))).toBe(89);
  });
  it("always adds back to the amount", () => {
    for (const total of [0, 1, 89, 90, 99.99, 123.45, 1599.99]) {
      for (const n of [1, 2, 3, 4, 7, 10, 13]) {
        expect(sum(splitAmount(total, n))).toBe(total);
      }
    }
  });
  it("handles empty and invalid input", () => {
    expect(splitAmount(89, 0)).toEqual([]);
    expect(splitAmount(Number.NaN, 2)).toEqual([0, 0]);
    expect(splitAmount(89, 1)).toEqual([89]);
  });
});
