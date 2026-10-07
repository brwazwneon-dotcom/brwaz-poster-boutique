import { describe, expect, it } from "vitest";
import { groupOrders, type Line } from "./admin-overview";

const line = (over: Partial<Line>): Line => ({
  id: "1",
  created_at: "2026-01-01T10:00:00Z",
  customer_name: "A",
  phone: "01000000000",
  governorate: "Cairo",
  total_price: 100,
  status: "new",
  payment_method: "cod",
  payment_status: "not_required",
  poster_title: "P",
  order_number: "BRW-0001",
  ...over,
});

describe("groupOrders", () => {
  it("merges rows from one cart (same phone + created_at) into one order", () => {
    const out = groupOrders([
      line({ id: "1", total_price: 100, order_number: "BRW-0001" }),
      line({ id: "2", total_price: 250, order_number: "BRW-0002", poster_title: "Q" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(350);
    expect(out[0].items).toBe(2);
    expect(out[0].numbers).toEqual(["BRW-0001", "BRW-0002"]);
  });

  it("keeps different customers/times separate and sorts newest first", () => {
    const out = groupOrders([
      line({ id: "1" }),
      line({ id: "2", created_at: "2026-01-02T10:00:00Z" }),
      line({ id: "3", phone: "01111111111" }),
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].at).toBe("2026-01-02T10:00:00Z");
  });

  it("tolerates non-numeric totals", () => {
    const out = groupOrders([line({ total_price: Number("x") })]);
    expect(out[0].total).toBe(0);
  });
});
