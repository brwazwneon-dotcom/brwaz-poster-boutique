// @vitest-environment jsdom
/**
 * Order Details drawer: a "N Frames Bundle" order row stores only the FIRST
 * poster's image, so the other tiles are filled from a read-only catalog lookup
 * by poster name. A stored image always wins, an unmatched name keeps the
 * "Image unavailable" placeholder, and the order's own numbers never change.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ group: vi.fn(), resolve: vi.fn() }));
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
// The real SafeImage loads through an async queue that never settles in jsdom;
// what matters here is which URL the drawer hands it.
vi.mock("@/components/SafeImage", () => ({
  SafeImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/lib/image-upload.functions", () => ({ resolveCustomDesignImageAdmin: vi.fn() }));

import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import type { AdminOrder } from "./OrdersTab";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
const FIRST = `${CLOUD}/v1/posters/first.jpg`;
const SECOND = `${CLOUD}/v1/posters/second.jpg`;
const THIRD = `${CLOUD}/v1/posters/third.jpg`;

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
    poster_title: "Solo (1)",
    poster_image: null,
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

const bundle = row({
  id: "bundle",
  order_number: "BRW-10",
  poster_title: "4 Frames Bundle · 30 × 40 cm — Alpha (1), Beta (2), Gamma (3), Delta (4)",
  poster_image: FIRST,
  total_price: 1000,
});
const tape = row({
  id: "tape",
  order_number: "BRW-11",
  poster_title: "Double Face Tape",
  size: "20 x 30 cm",
  quantity: 4,
  total_price: 60,
});

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
// Everything the drawer rendered (the sheet portals into document.body).
const tiles = () =>
  [...document.body.querySelectorAll("button[aria-label='View poster image'] img")].map((i) =>
    i.getAttribute("src"),
  );
const placeholders = () =>
  document.body.querySelectorAll("[aria-label='Poster image unavailable']");

beforeEach(() => {
  fns.group.mockReset();
  fns.resolve.mockReset();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
});

describe("Order Details — bundle poster images", () => {
  it("fills tiles 2..N from the catalog, keeps the stored first image, and leaves unmatched names as placeholders", async () => {
    fns.group.mockResolvedValue([bundle, tape]);
    // Beta + Gamma are unambiguous in the catalog; Delta is not.
    fns.resolve.mockResolvedValue({ images: { "Beta (2)": SECOND, "Gamma (3)": THIRD } });
    await mount(open(bundle));
    await flush();

    // One batched lookup for the whole order, never for the stored first poster.
    expect(fns.resolve).toHaveBeenCalledTimes(1);
    expect(fns.resolve).toHaveBeenCalledWith({
      data: {
        names: ["Beta (2)", "Gamma (3)", "Delta (4)", "Double Face Tape"],
        orderedAt: bundle.created_at,
      },
    });

    const srcs = tiles();
    expect(srcs).toHaveLength(3);
    // Stored image (Alpha) keeps its own URL, resized by the existing thumbnail transform.
    expect(srcs[0]).toContain("/f_auto,q_auto,w_144,h_216,c_fill/v1/posters/first.jpg");
    expect(srcs[1]).toContain("/v1/posters/second.jpg");
    expect(srcs[2]).toContain("/v1/posters/third.jpg");
    expect(new Set(srcs).size).toBe(3);
    // Delta (no safe match) + the tape (legitimately no image) keep the placeholder.
    expect(placeholders()).toHaveLength(2);
    // Catalog-sourced tiles are labelled; the stored one is not.
    const labelled = [...document.body.querySelectorAll("button[aria-label='View poster image']")]
      .filter((b) => b.getAttribute("title")?.includes("poster catalog"))
      .map((b) => b.querySelector("img")?.getAttribute("src"));
    expect(labelled).toHaveLength(2);
    // The order's own numbers are untouched.
    const text = document.body.textContent ?? "";
    expect(text).toContain("1000 EGP");
    expect(text).toContain("60 EGP");
  });

  it("never lets the lookup replace an image the order stored", async () => {
    fns.group.mockResolvedValue([bundle]);
    fns.resolve.mockResolvedValue({ images: { "Alpha (1)": SECOND } });
    await mount(open(bundle));
    await flush();
    expect(fns.resolve.mock.calls[0][0].data.names).not.toContain("Alpha (1)");
    expect(tiles()[0]).toContain("first.jpg");
  });

  it("keeps the placeholders (and every item) when the lookup fails", async () => {
    fns.group.mockResolvedValue([bundle, tape]);
    fns.resolve.mockRejectedValue(new Error("boom"));
    await mount(open(bundle));
    await flush();
    expect(tiles()).toHaveLength(1);
    expect(placeholders()).toHaveLength(4); // Beta, Gamma, Delta + tape
    expect(document.body.textContent).toContain("4 Frames Bundle");
    expect(document.body.textContent).toContain("Double Face Tape");
  });

  it("fills a single poster line whose order stored no image, and the tape stays a placeholder", async () => {
    const solo = row({ id: "solo", poster_title: "Solo (1)", poster_image: "" });
    fns.group.mockResolvedValue([solo, tape]);
    fns.resolve.mockResolvedValue({ images: { "Solo (1)": SECOND } });
    await mount(open(solo));
    await flush();
    expect(fns.resolve.mock.calls[0][0].data.names).toEqual(["Solo (1)", "Double Face Tape"]);
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]).toContain("second.jpg");
    expect(placeholders()).toHaveLength(1); // the tape
  });

  it("does no lookup when every line already has a stored image", async () => {
    const stored = row({ id: "s", poster_title: "Solo (1)", poster_image: FIRST });
    fns.group.mockResolvedValue([stored]);
    await mount(open(stored));
    await flush();
    expect(fns.resolve).not.toHaveBeenCalled();
    expect(tiles()).toHaveLength(1);
  });
});
