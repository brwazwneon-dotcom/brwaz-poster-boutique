import { describe, expect, it } from "vitest";
import {
  buildInvoiceData,
  formatEgp,
  formatInvoiceDate,
  type InvoiceGroup,
  type InvoiceRow,
} from "./order-invoice";
import { wrapText } from "./invoice-canvas";
import { buildItemNotes } from "./order-pricing";

const snap = (unit: number, qty: number, discount = 0, shipping = 0, packaging = 0) => ({
  v: 1 as const,
  unit_price: unit,
  gross: unit * qty,
  discount,
  net: unit * qty - discount,
  packaging,
  shipping,
  total: unit * qty - discount + packaging + shipping,
});

const row = (o: Partial<InvoiceRow> & { snapshot?: ReturnType<typeof snap> } = {}): InvoiceRow => {
  const { snapshot, ...rest } = o;
  const s = snapshot ?? snap(250, 1, 0, 89);
  return {
    id: `r${Math.random()}`,
    order_number: "BRW-1",
    poster_title: "Poster",
    frame_type: "High Quality PVC",
    frame_color: "Black",
    size: "30 x 40 cm",
    quantity: 1,
    subtotal: s.net,
    packaging_fee: s.packaging,
    shipping_cost: s.shipping,
    total_price: s.total,
    notes: buildItemNotes(undefined, s),
    ...rest,
  };
};

const group = (items: InvoiceRow[], o: Partial<InvoiceGroup> = {}): InvoiceGroup => ({
  primaryNumber: "BRW-1",
  created_at: "2026-09-10T12:30:00Z",
  customer_name: "Ahmed",
  phone: "01012345678",
  governorate: "Cairo",
  address: "1 Street",
  status: "new",
  payment_method: "cod",
  items,
  ...o,
});

describe("buildInvoiceData", () => {
  it("13. total is the stored total and the breakdown adds up to it", () => {
    const d = buildInvoiceData(group([row()]));
    expect(d.total).toBe(339);
    expect(d.subtotal - d.discount + d.packaging + d.shipping + d.otherFees).toBe(d.total);
    expect(d.otherFees).toBe(0);
  });

  it("multiple items, qty and an offer discount stay consistent", () => {
    const a = row({ quantity: 6, snapshot: snap(190, 6, 350, 45, 20) });
    const b = row({ quantity: 1, snapshot: snap(250, 1, 0, 44, 0) });
    const d = buildInvoiceData(group([a, b]));
    expect(d.items[0].unitPrice).toBe(190);
    expect(d.items[0].lineTotal).toBe(1140);
    expect(d.discount).toBe(350);
    expect(d.shipping).toBe(89);
    expect(d.total).toBe(1140 - 350 + 20 + 45 + 250 + 44);
    expect(d.otherFees).toBe(0);
  });

  it("never recomputes the total: a mismatching legacy row shows an adjustment line", () => {
    const legacy = row({
      notes: null,
      subtotal: 250,
      shipping_cost: 89,
      packaging_fee: 0,
      total_price: 359,
    });
    const d = buildInvoiceData(group([legacy]));
    expect(d.total).toBe(359); // stored value wins
    expect(d.otherFees).toBe(20);
    expect(d.subtotal - d.discount + d.packaging + d.shipping + d.otherFees).toBe(359);
  });

  it("19. historical order is independent of current catalogue prices", () => {
    // The builder takes no pricing/catalogue input at all: whatever the admin
    // does to product or frame prices later cannot reach an existing order.
    const stored = group([row({ poster_title: "Old name", snapshot: snap(190, 2, 0, 89) })]);
    const before = JSON.stringify(buildInvoiceData(stored));
    const currentCatalogue = { "Old name": { title: "Renamed", price: 999 } };
    void currentCatalogue;
    expect(JSON.stringify(buildInvoiceData(stored))).toBe(before);
    expect(buildInvoiceData(stored).items[0]).toMatchObject({
      name: "Old name",
      unitPrice: 190,
      lineTotal: 380,
      size: "30 x 40 cm",
      frameType: "High Quality PVC",
      frameColor: "Black",
    });
  });

  it("17. cancelled order keeps its numbers and status", () => {
    const d = buildInvoiceData(group([row()], { status: "cancelled" }));
    expect(d.status).toBe("cancelled");
    expect(d.total).toBe(339);
  });

  it("payment label and test flag", () => {
    expect(buildInvoiceData(group([row()], { payment_method: "instapay" })).paymentLabel).toMatch(
      /Instapay/,
    );
    expect(buildInvoiceData(group([row()], { is_test: true })).isTest).toBe(true);
  });

  it("free shipping shows 0", () => {
    const d = buildInvoiceData(group([row({ snapshot: snap(1700, 1, 0, 0) })]));
    expect(d.shipping).toBe(0);
    expect(d.total).toBe(1700);
  });
});

describe("formatting", () => {
  it("formats EGP", () => {
    expect(formatEgp(1234)).toBe("1,234 EGP");
    expect(formatEgp(29.67)).toBe("29.67 EGP");
    expect(formatEgp(NaN)).toBe("0 EGP");
  });
  it("formats the date in Cairo time, independent of the machine", () => {
    expect(formatInvoiceDate("2026-09-10T12:30:00Z")).toMatch(/10 Sep 2026/);
    expect(formatInvoiceDate("nope")).toBe("");
  });
});

describe("wrapText (long names / addresses never overflow)", () => {
  const measure = (s: string) => s.length * 10;
  it("wraps at word boundaries", () => {
    expect(wrapText(measure, "aaa bbb ccc ddd", 70, 5)).toEqual(["aaa bbb", "ccc ddd"]);
  });
  it("breaks a single over-long token", () => {
    const out = wrapText(measure, "x".repeat(25), 100, 5);
    expect(out.every((l) => measure(l) <= 100)).toBe(true);
    expect(out.join("")).toBe("x".repeat(25));
  });
  it("truncates with an ellipsis at maxLines", () => {
    const out = wrapText(measure, "one two three four five six seven", 50, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith("…")).toBe(true);
    expect(measure(out[1])).toBeLessThanOrEqual(50);
  });
  it("handles Arabic text and empty input", () => {
    expect(wrapText(measure, "شارع التحرير الدقي الجيزة", 120, 3).length).toBeGreaterThan(1);
    expect(wrapText(measure, "", 100, 2)).toEqual([""]);
  });
});
