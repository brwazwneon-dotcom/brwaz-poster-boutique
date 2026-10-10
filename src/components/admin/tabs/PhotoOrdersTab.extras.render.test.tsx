// @vitest-environment jsdom
/** Photo Orders tab: date next to each order, WhatsApp confirmation, combined photos image. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ list: vi.fn(), render: vi.fn(), load: vi.fn(), blob: vi.fn() }));
vi.mock("@/lib/db-admin.functions", () => ({
  listPhotoOrdersAdmin: fns.list,
  updatePhotoOrderStatus: vi.fn(),
}));
vi.mock("@/lib/order-invoice-render", () => ({
  loadPhotoSheetImages: fns.load,
  renderPhotoSheetBlob: fns.render,
}));
vi.mock("@/lib/image-download", () => ({ downloadBlob: fns.blob }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("./OrdersTab", () => ({ ORDER_STATUSES: ["new", "confirmed", "cancelled"] }));

import { PhotoOrdersTab } from "./PhotoOrdersTab";

const order = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  order_number: "BRW-1150",
  kind: "photo_4x6",
  customer_name: "Sara",
  phone: "01012345678",
  governorate: "Cairo",
  address: "1 Street",
  detail: "size_10x15",
  quantity: 2,
  total_price: 250,
  status: "new",
  photos: ["https://img/a.jpg", "https://img/b.jpg"],
  created_at: "2026-10-10T01:37:30Z",
  selected_albums: [],
  albums_total: 0,
  payment_method: "cod",
};

let root: Root | null = null;
let container: HTMLElement;
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });

beforeEach(async () => {
  fns.list.mockReset().mockResolvedValue([order]);
  fns.load.mockReset().mockResolvedValue({ logo: null, photos: [null, null] });
  fns.render.mockReset().mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  fns.blob.mockReset();
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:p";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PhotoOrdersTab />);
  });
  await flush();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  document.body.innerHTML = "";
  root = null;
});

describe("Photo orders extras", () => {
  it("shows the order date and time next to the order number", () => {
    expect(container.textContent).toMatch(/BRW-1150/);
    expect(container.textContent).toMatch(/10 Oct 2026, \d{2}:\d{2}/);
  });

  it("opens WhatsApp with the Arabic confirmation for this order", () => {
    const a = [...container.querySelectorAll("a")].find((x) =>
      /Confirm on WhatsApp/.test(x.textContent ?? ""),
    ) as HTMLAnchorElement;
    expect(a.href).toContain("wa.me/201012345678");
    const text = decodeURIComponent(a.href.split("text=")[1]);
    expect(text).toContain("#BRW-1150");
    expect(text).toContain("250 جنيه");
  });

  it("builds the combined photos + details image and offers Download", async () => {
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Photos \+ details image/.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    await act(async () => btn.click());
    await flush();
    expect(fns.render).toHaveBeenCalledTimes(1);
    const model = fns.render.mock.calls[0][0];
    expect(model.photos).toHaveLength(2);
    expect(model.totalCents).toBe(25000);
    const dl = [...document.body.querySelectorAll("button")].find((b) =>
      /Download PNG/.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    expect(dl.disabled).toBe(false);
    await act(async () => dl.click());
    expect(fns.blob).toHaveBeenCalledTimes(1);
    expect(fns.blob.mock.calls[0][1]).toBe("photos-BRW-1150.png");
  });
});
