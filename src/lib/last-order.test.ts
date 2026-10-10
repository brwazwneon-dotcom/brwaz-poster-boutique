// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  firstNameOf,
  orderNumberRange,
  readLastOrder,
  saveLastOrder,
  type LastOrder,
} from "./last-order";

const base: LastOrder = {
  numbers: ["BRW-1130", "BRW-1131"],
  name: "Youssef Saed",
  total: 1280,
  itemCount: 3,
  paymentMethod: "cod",
  governorate: "Alexandria",
  placedAt: new Date().toISOString(),
};

beforeEach(() => sessionStorage.clear());

describe("last order", () => {
  it("round-trips a saved order", () => {
    saveLastOrder(base);
    expect(readLastOrder()).toEqual(base);
  });

  it("returns null when nothing is stored, it is stale, or it is corrupt", () => {
    expect(readLastOrder()).toBeNull();
    saveLastOrder({ ...base, placedAt: new Date(Date.now() - 7 * 3600_000).toISOString() });
    expect(readLastOrder()).toBeNull();
    sessionStorage.setItem("brw_last_order_v1", "{nope");
    expect(readLastOrder()).toBeNull();
  });

  it("sanitises odd values instead of trusting storage", () => {
    sessionStorage.setItem(
      "brw_last_order_v1",
      JSON.stringify({ ...base, numbers: ["BRW-1", 5, null], total: "x", paymentMethod: "weird" }),
    );
    const o = readLastOrder()!;
    expect(o.numbers).toEqual(["BRW-1"]);
    expect(o.total).toBeNull();
    expect(o.paymentMethod).toBe("cod");
  });

  it("formats names and number ranges", () => {
    expect(firstNameOf("  Youssef   Saed ")).toBe("Youssef");
    expect(firstNameOf("")).toBe("");
    expect(orderNumberRange(["BRW-1"])).toBe("BRW-1");
    expect(orderNumberRange(["BRW-1", "BRW-2", "BRW-3"])).toBe("BRW-1 → BRW-3");
    expect(orderNumberRange([])).toBe("");
  });
});
