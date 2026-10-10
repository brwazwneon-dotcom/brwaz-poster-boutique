import { describe, expect, it } from "vitest";
import {
  buildPhotoConfirmationMessage,
  buildPhotoSheetModel,
  formatOrderDateTime,
  photoDetailLabel,
  photoGridColumns,
  type PhotoOrderLike,
} from "./photo-order-sheet";

const order: PhotoOrderLike = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  order_number: "BRW-1150",
  kind: "photo_4x6",
  customer_name: "Sara",
  phone: "01000000000",
  governorate: "Cairo",
  address: "1 Street",
  detail: "size_10x15",
  quantity: 20,
  total_price: "250.50",
  status: "new",
  photos: ["https://img/a.jpg", "https://img/b.jpg", "blob:nope"],
  created_at: "2026-10-10T01:37:30Z",
  selected_albums: [{ name: "Classic", qty: 2 }],
  payment_method: "instapay",
};

describe("photo order helpers", () => {
  it("cleans the size detail", () => {
    expect(photoDetailLabel("size_10x15")).toBe("10x15");
    expect(photoDetailLabel("starter_20")).toBe("starter_20");
  });

  it("builds an Arabic confirmation with the real order data", () => {
    const m = buildPhotoConfirmationMessage(order);
    expect(m).toContain("#BRW-1150");
    expect(m).toContain("طباعة");
    expect(m).toContain("4×6");
    expect(m).toContain("10x15");
    expect(m).toContain("إنستا باي");
    expect(m).toContain("251 جنيه");
    expect(m).toContain("Classic ×2");
    expect(m).toContain("Cairo — 1 Street");
  });

  it("defaults the payment to cash on delivery and survives missing albums", () => {
    const m = buildPhotoConfirmationMessage({
      ...order,
      payment_method: null,
      selected_albums: null,
    });
    expect(m).toContain("الدفع عند الاستلام");
    expect(m).not.toContain("ألبومات");
  });

  it("builds the sheet model with only real photo URLs and exact cents", () => {
    const s = buildPhotoSheetModel(order);
    expect(s.photos).toEqual(["https://img/a.jpg", "https://img/b.jpg"]);
    expect(s.totalCents).toBe(25050);
    expect(s.count).toBe(3);
    expect(s.voided).toBe(false);
    expect(buildPhotoSheetModel({ ...order, status: "cancelled" }).voided).toBe(true);
  });

  it("falls back to the ordered quantity when no photo list is stored", () => {
    expect(buildPhotoSheetModel({ ...order, photos: [] }).count).toBe(20);
  });

  it("picks grid columns by photo count", () => {
    expect(photoGridColumns(1)).toBe(3);
    expect(photoGridColumns(10)).toBe(4);
    expect(photoGridColumns(24)).toBe(5);
    expect(photoGridColumns(80)).toBe(6);
  });

  it("formats the order date and time", () => {
    expect(formatOrderDateTime("2026-10-10T01:37:30Z")).toMatch(/10 Oct 2026, \d{2}:\d{2}/);
    expect(formatOrderDateTime("nope")).toBe("");
  });
});
