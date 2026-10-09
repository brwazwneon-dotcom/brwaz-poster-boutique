// @vitest-environment jsdom
/**
 * Order Details drawer: every poster thumbnail has a Download button (the
 * original file when the catalog knows it), and "Invoice image" opens a dialog
 * that renders the order into a PNG the admin can download or share.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({
  group: vi.fn(),
  resolve: vi.fn(),
  download: vi.fn(),
  downloadBlob: vi.fn(),
  render: vi.fn(),
  loadImages: vi.fn(),
}));
vi.mock("@/lib/order-ops.functions", () => ({
  getOrderGroupAdmin: fns.group,
  resolveOrderPosterImagesAdmin: fns.resolve,
  getOrderTimelineAdmin: vi.fn().mockResolvedValue([]),
  logOrderEventAdmin: vi.fn().mockResolvedValue(undefined),
  getOrderNotesAdmin: vi.fn().mockResolvedValue([]),
  addOrderNoteAdmin: vi.fn(),
  updateOrderNoteAdmin: vi.fn(),
  deleteOrderNoteAdmin: vi.fn(),
  updateOrderConfirmationAdmin: vi.fn(),
  setOrderPaymentAdmin: vi.fn(),
}));
vi.mock("@/lib/db-admin.functions", () => ({
  updateOrderStatus: vi.fn(),
  listOrdersAdmin: vi.fn(),
  listCheckoutPhotoOrdersAdmin: vi.fn(),
}));
vi.mock("@/components/SafeImage", () => ({
  SafeImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/lib/image-upload.functions", () => ({ resolveCustomDesignImageAdmin: vi.fn() }));
vi.mock("@/lib/image-download", () => ({
  downloadImage: fns.download,
  downloadBlob: fns.downloadBlob,
}));
vi.mock("@/lib/order-invoice-render", () => ({
  loadInvoiceImages: fns.loadImages,
  renderInvoiceBlob: fns.render,
}));

import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import type { AdminOrder } from "./OrdersTab";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
const STORED = `${CLOUD}/v1/posters/web.jpg`;
const ORIGINAL = `${CLOUD}/v1/originals/original.jpg`;

function row(o: Partial<AdminOrder>): AdminOrder {
  return {
    id: "id-1",
    order_number: "BRW-1",
    customer_name: "Test Customer",
    phone: "01000000000",
    governorate: "Cairo",
    address: "Somewhere",
    frame_type: "High Quality PVC",
    frame_color: "Black",
    size: "30 x 40 cm",
    quantity: 1,
    poster_title: "Joker (26)",
    poster_image: STORED,
    subtotal: 900,
    packaging_fee: 0,
    shipping_cost: 0,
    total_price: 900,
    status: "new",
    payment_method: "cod",
    payment_status: "pending",
    payment_screenshot: null,
    payment_reference: null,
    notes: null,
    confirmation_status: "not_sent",
    whatsapp_message: null,
    confirmed_at: null,
    confirmed_by: null,
    created_at: "2026-10-03T10:35:56.109Z",
    ...o,
  };
}

let root: Root | null = null;
let container: HTMLElement;
async function mount(ui: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(ui);
  });
}
async function flush(ms = 150) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
const open = (order: AdminOrder) => (
  <OrderDetailsDrawer order={order} open onOpenChange={() => {}} onOrderUpdated={() => {}} />
);
const byText = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

beforeEach(() => {
  for (const f of Object.values(fns)) f.mockReset();
  fns.resolve.mockResolvedValue({ images: {}, originals: {} });
  fns.download.mockResolvedValue("started");
  fns.loadImages.mockResolvedValue({ logo: null, byUrl: new Map() });
  fns.render.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:preview";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
});

describe("Order Details — download", () => {
  it("downloads the stored image when the catalog has no original", async () => {
    const order = row({});
    fns.group.mockResolvedValue([order]);
    await mount(open(order));
    await flush();
    const btn = document.body.querySelector("button[aria-label='Download poster image']");
    expect(btn).not.toBeNull();
    await act(async () => {
      (btn as HTMLButtonElement).click();
    });
    await flush();
    expect(fns.download).toHaveBeenCalledWith(STORED, "Joker (26)");
  });

  it("prefers the archival original, looked up only when Download is pressed", async () => {
    const order = row({});
    fns.group.mockResolvedValue([order]);
    await mount(open(order));
    await flush();
    // Rendering the order must not ask for originals when every image is stored.
    expect(fns.resolve).not.toHaveBeenCalled();
    fns.resolve.mockResolvedValue({
      images: { "Joker (26)": STORED },
      originals: { "Joker (26)": ORIGINAL },
    });
    await act(async () => {
      (
        document.body.querySelector(
          "button[aria-label='Download poster image']",
        ) as HTMLButtonElement
      ).click();
    });
    await flush();
    expect(fns.resolve).toHaveBeenCalledTimes(1);
    expect(fns.download).toHaveBeenCalledWith(ORIGINAL, "Joker (26)");
  });

  it("has no Download button on a line with no image at all", async () => {
    const order = row({ poster_image: null });
    fns.group.mockResolvedValue([order]);
    await mount(open(order));
    await flush();
    expect(document.body.querySelector("button[aria-label='Download poster image']")).toBeNull();
  });
});

describe("Order Details — invoice image", () => {
  it("renders the whole order into a PNG and offers Download", async () => {
    const order = row({});
    const tape = row({
      id: "tape",
      poster_title: "Double Face Tape",
      poster_image: "",
      subtotal: 40,
      total_price: 40,
    });
    fns.group.mockResolvedValue([order, tape]);
    await mount(open(order));
    await flush();
    const invoiceBtn = byText("Invoice image");
    expect(invoiceBtn).toBeDefined();
    await act(async () => {
      invoiceBtn!.click();
    });
    await flush();
    expect(fns.render).toHaveBeenCalledTimes(1);
    // The model handed to the renderer carries the stored totals, both lines.
    const model = fns.render.mock.calls[0][0];
    expect(model.items).toHaveLength(2);
    expect(model.totalCents).toBe(94000);
    expect(document.body.querySelector("img[alt='Invoice preview']")).not.toBeNull();
    const dl = byText("Download PNG") as HTMLButtonElement;
    expect(dl.disabled).toBe(false);
    await act(async () => {
      dl.click();
    });
    expect(fns.downloadBlob).toHaveBeenCalledTimes(1);
    expect(fns.downloadBlob.mock.calls[0][1]).toMatch(/^invoice-.*\.png$/);
  });

  it("shows an error with Try again when rendering fails", async () => {
    const order = row({});
    fns.group.mockResolvedValue([order]);
    fns.render.mockRejectedValueOnce(new Error("boom"));
    await mount(open(order));
    await flush();
    await act(async () => {
      byText("Invoice image")!.click();
    });
    await flush();
    expect(document.body.textContent).toContain("boom");
    await act(async () => {
      byText("Try again")!.click();
    });
    await flush();
    expect(document.body.querySelector("img[alt='Invoice preview']")).not.toBeNull();
  });
});
