import { describe, expect, it } from "vitest";
import {
  buildPhotoConfirmationMessage,
  buildPhotoSheetModel,
  derivePhotoBreakdown,
  formatOrderDateTime,
  isLooseSize,
  photoDetailLabel,
  photoDetailTitle,
  photoGridColumns,
  photoKindLabel,
  type PhotoOrderLike,
  type PhotoPriceSettings,
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
  albums_total: 60,
  payment_method: "instapay",
};

const settings: PhotoPriceSettings = {
  prices: { "10x15": 10, "13x18": 15, "15x20": 20 },
  shippingFee: 90,
  freeThreshold: 1600,
  packages: [{ key: "starter", photos: 20, price: 200 }],
};

describe("labels", () => {
  it("a per-photo size is Photo Printing with a real size, never '4×6'", () => {
    expect(isLooseSize("size_10x15")).toBe(true);
    expect(photoKindLabel("size_10x15")).toEqual({ en: "Photo Printing", ar: "طباعة صور" });
    expect(photoDetailLabel("size_10x15")).toBe("10×15 cm");
    expect(photoDetailTitle("size_10x15")).toBe("Size · المقاس");
  });
  it("an old package keeps its key and says package", () => {
    expect(photoKindLabel("starter").en).toBe("Photo package");
    expect(photoDetailLabel("starter")).toBe("starter");
    expect(photoDetailTitle("starter")).toBe("Package · الباقة");
  });
});

describe("derivePhotoBreakdown", () => {
  it("rebuilds subtotal + paid shipping when it reconciles", () => {
    // 20 x 10 = 200, +60 albums, +90 shipping
    expect(
      derivePhotoBreakdown(
        { detail: "size_10x15", quantity: 20, total_price: 350, albums_total: 60 },
        settings,
      ),
    ).toEqual({ subtotal: 200, shipping: 90 });
  });
  it("detects free / covered shipping", () => {
    expect(
      derivePhotoBreakdown(
        { detail: "size_10x15", quantity: 20, total_price: 200, albums_total: 0 },
        settings,
      ),
    ).toEqual({ subtotal: 200, shipping: 0 });
  });
  it("applies the volume price for big orders", () => {
    // 100 photos at the 100+ tier (8 EGP) = 800 + 90
    expect(
      derivePhotoBreakdown(
        { detail: "size_10x15", quantity: 100, total_price: 890, albums_total: 0 },
        settings,
      ),
    ).toEqual({ subtotal: 800, shipping: 90 });
  });
  it("shows nothing rather than a wrong figure when prices changed since", () => {
    expect(
      derivePhotoBreakdown(
        { detail: "size_10x15", quantity: 20, total_price: 777, albums_total: 0 },
        settings,
      ),
    ).toBeNull();
  });
  it("handles old packages with extra photos", () => {
    // 25 photos: 200 + 5 x ceil(200/20)=10 -> 250, + 90 shipping
    expect(
      derivePhotoBreakdown(
        { detail: "starter", quantity: 25, total_price: 340, albums_total: 0 },
        settings,
      ),
    ).toEqual({ subtotal: 250, shipping: 90 });
  });
});

describe("confirmation message", () => {
  const full = { ...order, subtotal: 200, shipping: 90, total_price: 350 };

  it("carries everything a framed-poster confirmation has", () => {
    const m = buildPhotoConfirmationMessage(full);
    expect(m).toContain("مرحباً Sara");
    expect(m).toContain("#BRW-1150");
    expect(m).toContain("طباعة صور");
    expect(m).toContain("10×15 cm");
    expect(m).toContain("• عدد الصور: 3");
    expect(m).toContain("الإجمالي الفرعي: 200 جنيه");
    expect(m).toContain("الألبومات: 60 جنيه");
    expect(m).toContain("الشحن: 90 جنيه");
    expect(m).toContain("الإجمالي: 350 جنيه");
    expect(m).toContain("📱 الهاتف: 01000000000");
    expect(m).toContain("Cairo — 1 Street");
    expect(m).toContain("إنستا باي");
    expect(m).toContain("Classic ×2");
    expect(m).toContain("أكد لنا");
    expect(m).not.toContain("4×6");
  });

  it("says free shipping and leaves out price lines it cannot know", () => {
    expect(buildPhotoConfirmationMessage({ ...full, shipping: 0 })).toContain("الشحن: مجاني");
    const m = buildPhotoConfirmationMessage({ ...order, subtotal: null, shipping: null });
    expect(m).not.toContain("الإجمالي الفرعي");
    expect(m).not.toContain("الشحن:");
    expect(m).toContain("الإجمالي: 251 جنيه");
  });

  it("defaults to cash on delivery and survives missing albums", () => {
    const m = buildPhotoConfirmationMessage({
      ...order,
      payment_method: null,
      selected_albums: null,
      albums_total: 0,
    });
    expect(m).toContain("الدفع عند الاستلام");
    expect(m).not.toContain("ألبومات");
  });
});

describe("sheet model", () => {
  it("uses only real photo URLs, exact cents and the right labels", () => {
    const s = buildPhotoSheetModel({ ...order, subtotal: 200, shipping: 90 });
    expect(s.photos).toEqual(["https://img/a.jpg", "https://img/b.jpg"]);
    expect(s.totalCents).toBe(25050);
    expect(s.subtotalCents).toBe(20000);
    expect(s.shippingCents).toBe(9000);
    expect(s.albumsCents).toBe(6000);
    expect(s.kindLabel).toBe("Photo Printing · طباعة صور");
    expect(s.detailTitle).toBe("Size · المقاس");
    expect(s.detail).toBe("10×15 cm");
    expect(s.count).toBe(3);
    expect(s.voided).toBe(false);
    expect(buildPhotoSheetModel({ ...order, status: "cancelled" }).voided).toBe(true);
  });

  it("leaves the breakdown out when unknown, and falls back to the ordered quantity", () => {
    const s = buildPhotoSheetModel({ ...order, photos: [] });
    expect(s.subtotalCents).toBeNull();
    expect(s.shippingCents).toBeNull();
    expect(s.count).toBe(20);
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
