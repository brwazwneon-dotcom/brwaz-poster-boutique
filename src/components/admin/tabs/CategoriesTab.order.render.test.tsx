// @vitest-environment jsdom
/** Categories tab: up/down arrows reorder siblings and save the whole order in one call. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ list: vi.fn(), reorder: vi.fn() }));
vi.mock("@/lib/db-admin.functions", () => ({
  listCategoriesAdmin: fns.list,
  upsertCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getCategoryImageCountsAdmin: vi.fn().mockResolvedValue({}),
  reorderCategoriesAdmin: fns.reorder,
}));
vi.mock("@/lib/image-upload.functions", () => ({ uploadPosterImage: vi.fn() }));
vi.mock("@/lib/image-optimize", () => ({ optimizeImage: vi.fn() }));
vi.mock("@/components/admin/layout/ConfirmDialogProvider", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));
vi.mock("@/components/admin/CategoryPosterManager", () => ({ CategoryPosterManager: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CategoriesTab } from "./CategoriesTab";

const cat = (id: string, name: string, sort_order: number, parent_id: string | null = null) => ({
  id,
  name,
  name_ar: null,
  slug: name.toLowerCase(),
  description: null,
  image: null,
  hidden: false,
  featured: false,
  sort_order,
  parent_id,
  status: "active",
  show_in_header: true,
  show_in_collections: true,
});
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const SUB1 = "44444444-4444-4444-8444-444444444444";
const SUB2 = "55555555-5555-4555-8555-555555555555";

let root: Root | null = null;
let container: HTMLElement;
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
const names = () =>
  [...container.querySelectorAll("div.text-sm.font-semibold")].map((e) => e.textContent);
const click = (label: string) =>
  act(async () => {
    (container.querySelector(`button[aria-label='${label}']`) as HTMLButtonElement).click();
  });

beforeEach(async () => {
  fns.list.mockReset();
  fns.reorder.mockReset().mockResolvedValue({ ok: true });
  fns.list.mockResolvedValue([
    cat(A, "Anime", 10),
    cat(B, "Movies", 20),
    cat(C, "Series", 30),
    cat(SUB1, "Naruto", 10, A),
    cat(SUB2, "Bleach", 20, A),
  ]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<CategoriesTab />);
  });
  await flush();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  root = null;
});

describe("Categories tab ordering", () => {
  it("lists main categories by sort_order", () => {
    expect(names()).toEqual(["Anime", "Movies", "Series"]);
  });

  it("moves a category down and saves the full sibling order once", async () => {
    await click("Move Anime down");
    expect(names()).toEqual(["Movies", "Anime", "Series"]);
    expect(fns.reorder).toHaveBeenCalledTimes(1);
    expect(fns.reorder.mock.calls[0][0]).toEqual({ data: { orderedIds: [B, A, C] } });
  });

  it("moves a category up", async () => {
    await click("Move Series up");
    expect(fns.reorder.mock.calls[0][0].data.orderedIds).toEqual([A, C, B]);
  });

  it("disables up on the first and down on the last", () => {
    expect(
      (container.querySelector("button[aria-label='Move Anime up']") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (container.querySelector("button[aria-label='Move Series down']") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("reorders subcategories among their own siblings only", async () => {
    await click("Move Naruto down");
    expect(fns.reorder.mock.calls[0][0].data.orderedIds).toEqual([SUB2, SUB1]);
  });

  it("reloads the real order when saving fails", async () => {
    fns.reorder.mockRejectedValueOnce(new Error("boom"));
    await click("Move Anime down");
    await flush();
    expect(fns.list).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(["Anime", "Movies", "Series"]);
  });
});
