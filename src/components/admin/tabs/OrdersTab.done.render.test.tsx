// @vitest-environment jsdom
/** Orders list: DONE button turns an order green, tabs/search organise the list. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({
  list: vi.fn(),
  done: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/lib/db-admin.functions", () => ({
  listOrdersAdmin: fns.list,
  listCheckoutPhotoOrdersAdmin: vi.fn().mockResolvedValue([]),
  updateOrderStatus: vi.fn(),
  setOrdersDoneAdmin: fns.done,
  setOrdersArchivedAdmin: fns.archive,
  deleteOrdersAdmin: fns.remove,
}));
vi.mock("@/components/admin/layout/ConfirmDialogProvider", () => ({
  useConfirm: () => fns.confirm,
}));
vi.mock("./OrderDetailsDrawer", () => ({ OrderDetailsDrawer: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { OrdersTab, type AdminOrder } from "./OrdersTab";

const order = (id: string, n: string, name: string, extra: Partial<AdminOrder> = {}): AdminOrder =>
  ({
    id,
    order_number: n,
    customer_name: name,
    phone: `0100000${n.slice(-4)}`,
    governorate: "Cairo",
    address: "x",
    frame_type: "High Quality PVC",
    frame_color: "Black",
    size: "30 x 40 cm",
    quantity: 1,
    poster_title: `Poster ${n}`,
    poster_image: null,
    total_price: 300,
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
    created_at: "2026-10-10T01:00:00.000Z",
    checkout_key: id,
    admin_done: false,
    ...extra,
  }) as AdminOrder;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

let root: Root | null = null;
let container: HTMLElement;
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
const rows = () => [...container.querySelectorAll("tbody tr")] as HTMLElement[];
const text = (el: Element) => el.textContent ?? "";
const tab = (name: RegExp) =>
  [...container.querySelectorAll("[role='tab']")].find((t) => name.test(text(t))) as HTMLElement;

beforeEach(async () => {
  fns.list
    .mockReset()
    .mockResolvedValue([
      order(A, "BRW-0001", "Ahmed"),
      order(B, "BRW-0002", "Mona", { admin_done: true }),
      order(C, "BRW-0003", "Sara"),
    ]);
  fns.done.mockReset().mockResolvedValue({ ok: true });
  fns.archive.mockReset().mockResolvedValue({ ok: true });
  fns.remove.mockReset().mockResolvedValue({ ok: true });
  fns.confirm.mockReset().mockResolvedValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<OrdersTab />);
  });
  await flush();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  root = null;
});

describe("Orders tab DONE", () => {
  it("shows done orders green and counts them in the tabs", () => {
    expect(rows()).toHaveLength(3);
    expect(rows()[1].className).toContain("bg-emerald-500/10");
    expect(rows()[0].className).not.toContain("bg-emerald-500/10");
    expect(text(tab(/All/))).toContain("(3)");
    expect(text(tab(/To do/))).toContain("(2)");
    expect(text(tab(/Done/))).toContain("(1)");
  });

  it("DONE turns the order green at once and saves every row of it", async () => {
    await act(async () => {
      (
        container.querySelector(
          "button[aria-label='Mark order BRW-0001 as done']",
        ) as HTMLButtonElement
      ).click();
    });
    expect(rows()[0].className).toContain("bg-emerald-500/10");
    expect(fns.done).toHaveBeenCalledTimes(1);
    expect(fns.done.mock.calls[0][0]).toEqual({ data: { ids: [A], done: true } });
    expect(text(tab(/Done/))).toContain("(2)");
  });

  it("clicking a done order again undoes it", async () => {
    await act(async () => {
      (
        container.querySelector(
          "button[aria-label='Unmark order BRW-0002 as done']",
        ) as HTMLButtonElement
      ).click();
    });
    expect(rows()[1].className).not.toContain("bg-emerald-500/10");
    expect(fns.done.mock.calls[0][0]).toEqual({ data: { ids: [B], done: false } });
  });

  it("the To do and Done tabs filter the list", async () => {
    await act(async () => tab(/To do/).click());
    expect(rows().map((r) => text(r))).toHaveLength(2);
    expect(rows().some((r) => text(r).includes("Mona"))).toBe(false);
    await act(async () => tab(/Done/).click());
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0])).toContain("Mona");
  });

  it("search narrows by name, phone or order number", async () => {
    const input = container.querySelector("input[aria-label='Search orders']") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "sara");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0])).toContain("Sara");
  });

  it("reloads the real state when saving fails", async () => {
    fns.done.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      (
        container.querySelector(
          "button[aria-label='Mark order BRW-0001 as done']",
        ) as HTMLButtonElement
      ).click();
    });
    await flush();
    expect(fns.list).toHaveBeenCalledTimes(2);
    expect(rows()[0].className).not.toContain("bg-emerald-500/10");
  });

  const rowButton = (rowIndex: number, label: RegExp) =>
    [...rows()[rowIndex].querySelectorAll("button")].find((b) =>
      label.test(text(b)),
    ) as HTMLButtonElement;

  it("Archive moves the order into the Archive tab and Restore brings it back", async () => {
    await act(async () => rowButton(0, /^Archive$/).click());
    expect(fns.archive.mock.calls[0][0]).toEqual({ data: { ids: [A], archived: true } });
    expect(rows()).toHaveLength(2);
    expect(text(tab(/All/))).toContain("(2)");
    expect(text(tab(/Archive/))).toContain("(1)");
    await act(async () => tab(/Archive/).click());
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0])).toContain("Ahmed");
    await act(async () => rowButton(0, /^Restore$/).click());
    expect(fns.archive.mock.calls[1][0]).toEqual({ data: { ids: [A], archived: false } });
    expect(text(tab(/Archive/))).toContain("(0)");
  });

  it("Delete asks first, then deletes the whole order and reloads", async () => {
    await act(async () => rowButton(2, /^Delete$/).click());
    await flush();
    expect(fns.confirm).toHaveBeenCalledTimes(1);
    expect(String(fns.confirm.mock.calls[0][0].description)).toContain("BRW-0003");
    expect(fns.remove.mock.calls[0][0]).toEqual({ data: { ids: [C], photoOrderIds: [] } });
    expect(fns.list).toHaveBeenCalledTimes(2);
  });

  it("Delete does nothing when the confirmation is cancelled", async () => {
    fns.confirm.mockResolvedValueOnce(false);
    await act(async () => rowButton(0, /^Delete$/).click());
    await flush();
    expect(fns.remove).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  it("bulk Archive and Delete work on the ticked orders", async () => {
    const boxes = [
      ...container.querySelectorAll("tbody input[type='checkbox']"),
    ] as HTMLInputElement[];
    await act(async () => boxes[0].click());
    await act(async () => boxes[2].click());
    const bulk = (re: RegExp) =>
      [...container.querySelectorAll("button")].find((b) => re.test(text(b))) as HTMLButtonElement;
    await act(async () => bulk(/^Delete selected \(2\)/).click());
    await flush();
    expect(fns.remove.mock.calls[0][0]).toEqual({ data: { ids: [A, C], photoOrderIds: [] } });
  });
});
