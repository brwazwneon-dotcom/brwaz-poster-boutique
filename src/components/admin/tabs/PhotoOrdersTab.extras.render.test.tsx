// @vitest-environment jsdom
/** Photo Orders tab: date next to each order, WhatsApp confirmation, combined photos image. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({
  list: vi.fn(),
  render: vi.fn(),
  load: vi.fn(),
  blob: vi.fn(),
  confirm: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
  ask: vi.fn(),
}));
vi.mock("@/lib/db-admin.functions", () => ({
  listPhotoOrdersAdmin: fns.list,
  updatePhotoOrderStatus: vi.fn(),
  setPhotoOrderConfirmationAdmin: fns.confirm,
  setPhotoOrdersArchivedAdmin: fns.archive,
  deletePhotoOrdersAdmin: fns.remove,
}));
vi.mock("@/components/admin/layout/ConfirmDialogProvider", () => ({ useConfirm: () => fns.ask }));
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
  fns.confirm.mockReset().mockResolvedValue({ ok: true });
  fns.archive.mockReset().mockResolvedValue({ ok: true });
  fns.remove.mockReset().mockResolvedValue({ ok: true });
  fns.ask.mockReset().mockResolvedValue(true);
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

describe("Photo order confirmation state", () => {
  const badge = () => container.textContent ?? "";
  const click = async (el: Element) => {
    await act(async () => {
      (el as HTMLElement).click();
    });
  };

  it("starts as NOT SENT", () => {
    expect(badge()).toContain("NOT SENT");
  });

  it("opening the WhatsApp confirmation marks the order SENT", async () => {
    const a = [...container.querySelectorAll("a")].find((x) =>
      /Confirm on WhatsApp/.test(x.textContent ?? ""),
    ) as HTMLAnchorElement;
    a.addEventListener("click", (e) => e.preventDefault());
    await click(a);
    expect(fns.confirm).toHaveBeenCalledWith({
      data: { id: order.id, kind: "photo_4x6", confirmation_status: "sent" },
    });
    expect(badge()).toContain("SENT");
  });

  it("the customer-reply buttons save and show the state", async () => {
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Confirmed/.test(b.textContent ?? ""),
    )!;
    await click(btn);
    expect(fns.confirm).toHaveBeenCalledWith({
      data: { id: order.id, kind: "photo_4x6", confirmation_status: "customer_confirmed" },
    });
    expect(badge()).toContain("CUSTOMER CONFIRMED");
  });

  it("reloads the real state when saving fails", async () => {
    fns.confirm.mockRejectedValueOnce(new Error("boom"));
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Rejected/.test(b.textContent ?? ""),
    )!;
    await click(btn);
    await flush();
    expect(fns.list).toHaveBeenCalledTimes(2);
    expect(badge()).toContain("NOT SENT");
  });
});

describe("Photo orders archive and delete", () => {
  const button = (label: RegExp) =>
    [...container.querySelectorAll("button")].find((b) =>
      label.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
  const tab = (label: RegExp) =>
    [...container.querySelectorAll("[role='tab']")].find((t) =>
      label.test(t.textContent ?? ""),
    ) as HTMLElement;
  const rowCount = () => container.querySelectorAll("tbody tr").length;

  it("Archive moves the order to the Archive tab and Restore brings it back", async () => {
    expect(rowCount()).toBe(1);
    await act(async () => button(/^Archive$/).click());
    expect(fns.archive.mock.calls[0][0]).toEqual({
      data: { items: [{ id: order.id, kind: "photo_4x6" }], archived: true },
    });
    expect(rowCount()).toBe(0);
    expect(tab(/Archive/).textContent).toContain("(1)");
    await act(async () => tab(/Archive/).click());
    expect(rowCount()).toBe(1);
    await act(async () => button(/^Restore$/).click());
    expect(fns.archive.mock.calls[1][0]).toEqual({
      data: { items: [{ id: order.id, kind: "photo_4x6" }], archived: false },
    });
    expect(tab(/Archive/).textContent).toContain("(0)");
  });

  it("Delete asks first, then deletes and reloads; cancelling does nothing", async () => {
    fns.ask.mockResolvedValueOnce(false);
    await act(async () => button(/^Delete$/).click());
    await flush();
    expect(fns.remove).not.toHaveBeenCalled();
    await act(async () => button(/^Delete$/).click());
    await flush();
    expect(String(fns.ask.mock.calls[1][0].description)).toContain("BRW-1150");
    expect(fns.remove.mock.calls[0][0]).toEqual({
      data: { items: [{ id: order.id, kind: "photo_4x6" }] },
    });
    expect(fns.list).toHaveBeenCalledTimes(2);
  });
});
