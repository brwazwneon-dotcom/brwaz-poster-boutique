import { describe, expect, it } from "vitest";
import {
  buildInvoiceModel,
  cloudinaryDownloadUrl,
  containsArabic,
  formatEgp,
  isVoidedStatus,
  safeFileStem,
  toCents,
  type InvoiceOrderRow,
} from "./order-invoice";

const base: InvoiceOrderRow = {
  id: "r1",
  customer_name: "Sara",
  phone: "01000000000",
  governorate: "Cairo",
  address: "1 Street",
  frame_type: "High Quality PVC",
  frame_color: "Black",
  size: "30 x 40 cm",
  quantity: 1,
  poster_title: "Joker",
  poster_image: "https://res.cloudinary.com/x/image/upload/v1/joker.jpg",
  subtotal: 450,
  packaging_fee: 0,
  shipping_cost: 90,
  total_price: 540,
  status: "new",
  payment_method: "cod",
  created_at: "2026-10-09T10:00:00Z",
};

describe("money helpers", () => {
  it("converts to cents without float artefacts", () => {
    expect(toCents("29.99")).toBe(2999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(null)).toBeNull();
    expect(toCents("")).toBeNull();
    expect(toCents("abc")).toBeNull();
  });
  it("formats EGP", () => {
    expect(formatEgp(54000)).toBe("540");
    expect(formatEgp(125050)).toBe("1,250.50");
    expect(formatEgp(3333)).toBe("33.33");
    expect(formatEgp(null)).toBe("—");
  });
});

describe("buildInvoiceModel", () => {
  it("uses the stored totals as the source of truth", () => {
    const m = buildInvoiceModel([base], { orderLabel: "#1" });
    expect(m.subtotalCents).toBe(45000);
    expect(m.shippingCents).toBe(9000);
    expect(m.totalCents).toBe(54000);
    expect(m.items[0].unitCents).toBe(45000);
    expect(m.totalIncomplete).toBe(false);
  });

  it("sums unrounded per-item shipping splits to the charged amount", () => {
    const rows = [0, 1, 2].map((i) => ({
      ...base,
      id: `r${i}`,
      subtotal: 500,
      shipping_cost: 30,
      total_price: 530,
    }));
    const m = buildInvoiceModel(rows, { orderLabel: "#2" });
    expect(m.shippingCents).toBe(9000);
    expect(m.totalCents).toBe(159000);
  });

  it("derives the line from the stored total when subtotal is missing", () => {
    const m = buildInvoiceModel([{ ...base, subtotal: null, total_price: 540 }], {
      orderLabel: "#3",
    });
    expect(m.items[0].lineCents).toBe(45000);
  });

  it("flags an incomplete total instead of inventing one", () => {
    const m = buildInvoiceModel([{ ...base, subtotal: null, total_price: null }], {
      orderLabel: "#4",
    });
    expect(m.items[0].lineCents).toBeNull();
    expect(m.totalIncomplete).toBe(true);
  });

  it("splits a bundle into posters and only gives the first its stored image", () => {
    const m = buildInvoiceModel(
      [
        {
          ...base,
          quantity: 2,
          poster_title: "2 Frames Bundle · 30 × 40 cm — Joker, Batman",
          subtotal: 800,
          total_price: 890,
        },
      ],
      { orderLabel: "#5", images: { own: {}, catalog: { Batman: "https://img/b.jpg" } } },
    );
    const it = m.items[0];
    expect(it.isBundle).toBe(true);
    expect(it.title).toBe("2 Frames Bundle");
    expect(it.unitCents).toBe(40000);
    expect(it.posters.map((p) => p.name)).toEqual(["Joker", "Batman"]);
    expect(it.posters[0].imageUrl).toBe(base.poster_image);
    expect(it.posters[1].imageUrl).toBe("https://img/b.jpg");
  });

  it("never copies the first image onto other bundle posters", () => {
    const m = buildInvoiceModel(
      [{ ...base, poster_title: "2 Frames Bundle · 30 × 40 cm — Joker, Batman" }],
      { orderLabel: "#6" },
    );
    expect(m.items[0].posters[1].imageUrl).toBeNull();
  });

  it("falls back to the catalog image when the stored one is not a URL", () => {
    const m = buildInvoiceModel([{ ...base, poster_image: "" }], {
      orderLabel: "#7",
      images: { own: {}, catalog: { Joker: "https://img/j.jpg" } },
    });
    expect(m.items[0].imageUrl).toBe("https://img/j.jpg");
  });

  it("prefers a resolved own image over the catalog", () => {
    const m = buildInvoiceModel([{ ...base, poster_image: "" }], {
      orderLabel: "#8",
      images: { own: { r1: "https://img/own.jpg" }, catalog: { Joker: "https://img/j.jpg" } },
    });
    expect(m.items[0].imageUrl).toBe("https://img/own.jpg");
  });

  it("gives the tape line no image and adds photo orders to the total", () => {
    const m = buildInvoiceModel(
      [
        base,
        {
          ...base,
          id: "t",
          poster_title: "Double Face Tape",
          poster_image: "",
          subtotal: 40,
          shipping_cost: 0,
          total_price: 40,
        },
      ],
      {
        orderLabel: "#9",
        photoOrders: [{ label: "Photo printing — 10 photos", totalPrice: "150" }],
      },
    );
    expect(m.items[1].isTape).toBe(true);
    expect(m.items[1].imageUrl).toBeNull();
    expect(m.totalCents).toBe(54000 + 4000 + 15000);
    expect(m.photoLines).toHaveLength(1);
  });

  it("marks cancelled and returned orders as voided", () => {
    expect(isVoidedStatus("cancelled")).toBe(true);
    expect(isVoidedStatus("Returned")).toBe(true);
    expect(isVoidedStatus("new")).toBe(false);
    expect(
      buildInvoiceModel([{ ...base, status: "cancelled" }], { orderLabel: "#10" }).voided,
    ).toBe(true);
  });
});

describe("text + download helpers", () => {
  it("detects Arabic", () => {
    expect(containsArabic("القاهرة")).toBe(true);
    expect(containsArabic("Cairo")).toBe(false);
    expect(containsArabic(null)).toBe(false);
  });
  it("builds safe file stems", () => {
    expect(safeFileStem("Order #12 / Joker!")).toBe("Order-12-Joker");
    expect(safeFileStem("???", "x")).toBe("x");
    expect(safeFileStem("برواز 12")).toBe("برواز-12");
  });
  it("adds fl_attachment only for Cloudinary image URLs", () => {
    expect(
      cloudinaryDownloadUrl("https://res.cloudinary.com/c/image/upload/v1/a/b.jpg", "Joker Poster"),
    ).toBe("https://res.cloudinary.com/c/image/upload/fl_attachment:Joker-Poster/v1/a/b.jpg");
    expect(cloudinaryDownloadUrl("https://example.com/a.jpg", "x")).toBeNull();
    expect(cloudinaryDownloadUrl("https://res.cloudinary.com/c/raw/upload/a.pdf", "x")).toBeNull();
    expect(
      cloudinaryDownloadUrl("https://res.cloudinary.com/c/image/upload/v1/a.jpg", "جوكر"),
    ).toContain("fl_attachment:poster/");
  });
});

describe("bundle posters stored with the order", () => {
  it("uses each stored poster image, ahead of name matches", () => {
    const ID1 = "123e4567-e89b-12d3-a456-426614174000";
    const ID2 = "223e4567-e89b-12d3-a456-426614174000";
    const notes = JSON.stringify({
      bundle_posters: [
        { id: ID1, title: "Joker", image: "https://img/j.jpg" },
        { id: ID2, title: "Batman", image: "https://img/b-exact.jpg" },
      ],
    });
    const m = buildInvoiceModel(
      [{ ...base, notes, poster_title: "2 Frames Bundle · 30 × 40 cm — Joker, Batman" }],
      { orderLabel: "#11", images: { own: {}, catalog: { Batman: "https://img/b-guess.jpg" } } },
    );
    expect(m.items[0].posters.map((p) => p.imageUrl)).toEqual([
      "https://img/j.jpg",
      "https://img/b-exact.jpg",
    ]);
  });

  it("recognises a bundle whose offer is named in Arabic and lists every poster", () => {
    const ID1 = "123e4567-e89b-12d3-a456-426614174000";
    const ID2 = "223e4567-e89b-12d3-a456-426614174000";
    const ID3 = "323e4567-e89b-12d3-a456-426614174000";
    const notes = JSON.stringify({
      bundle_posters: [
        { id: ID1, title: "MONEY (17)", image: "https://img/m17.jpg" },
        { id: ID2, title: "QUOTES (32)", image: "https://img/q32.jpg" },
        { id: ID3, title: "QUOTES (28)", image: "https://img/q28.jpg" },
      ],
    });
    const m = buildInvoiceModel(
      [
        {
          ...base,
          notes,
          poster_image: "https://img/m17.jpg",
          poster_title: "مجموعة 3 براويز · 20 × 30 cm — MONEY (17), QUOTES (32), QUOTES (28)",
        },
      ],
      { orderLabel: "#12", images: { own: {}, catalog: {} } },
    );
    const it = m.items[0];
    expect(it.isBundle).toBe(true);
    expect(it.title).toBe("مجموعة 3 براويز");
    expect(it.posters.map((p) => p.name)).toEqual(["MONEY (17)", "QUOTES (32)", "QUOTES (28)"]);
    expect(it.posters.map((p) => p.imageUrl)).toEqual([
      "https://img/m17.jpg",
      "https://img/q32.jpg",
      "https://img/q28.jpg",
    ]);
  });

  it("a row with a custom title and no poster list stays a single item", () => {
    const m = buildInvoiceModel(
      [{ ...base, poster_title: "مجموعة 3 براويز · 20 × 30 cm — A, B, C" }],
      {
        orderLabel: "#13",
        images: { own: {}, catalog: {} },
      },
    );
    expect(m.items[0].isBundle).toBe(false);
  });
});
