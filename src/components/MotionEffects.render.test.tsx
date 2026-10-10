// @vitest-environment jsdom
/** The motion layer: "added to cart" sheet with real progress, and every off switch. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  flags: { emergency_fast_mode: false, safe_mode: false } as Record<string, boolean>,
}));
vi.mock("@/lib/cart", () => ({ useCart: () => ({ total: 600, count: 3 }) }));
vi.mock("@/lib/use-settings", () => ({ usePricing: () => ({ freeShippingThreshold: 1600 }) }));
vi.mock("@/lib/performance-flags", () => ({ usePerformanceFlags: () => state.flags }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...p }: { children: React.ReactNode; to: string }) => (
    <a href={p.to}>{children}</a>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k),
    i18n: { language: "en" },
  }),
}));

import MotionEffects from "./MotionEffects";
import { CART_ADDED_EVENT } from "@/lib/motion";
import { cartFeedbackActive } from "@/lib/cart-feedback";

let root: Root | null = null;
let container: HTMLElement;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MotionEffects />);
  });
};
const added = (title = "JOKER (26)") =>
  act(async () => {
    window.dispatchEvent(
      new CustomEvent(CART_ADDED_EVENT, { detail: { title, image: "", price: 280 } }),
    );
  });

beforeEach(() => {
  state.flags = { emergency_fast_mode: false, safe_mode: false };
  window.history.replaceState({}, "", "/");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("motion-ok");
  root = null;
});

describe("MotionEffects", () => {
  it("shows nothing until something is added", async () => {
    await mount();
    expect(container.querySelector(".brw-sheet")).toBeNull();
  });

  it("slides the sheet up with the real progress to free shipping", async () => {
    await mount();
    await added();
    const sheet = container.querySelector(".brw-sheet") as HTMLElement;
    expect(sheet.className).toContain("is-open");
    expect(sheet.textContent).toContain("cart.sheetAdded");
    expect(sheet.textContent).toContain("JOKER (26)");
    expect(sheet.textContent).toContain('cart.sheetRemaining:{"amount":1000}');
    expect(sheet.textContent).toContain("cart.sheetView (3)");
    expect((sheet.querySelector(".brw-sheet-bar i") as HTMLElement).style.transform).toBe(
      "scaleX(0.375)",
    );
  });

  it("tells the add-to-cart buttons to skip their own toast while it is on", async () => {
    expect(cartFeedbackActive()).toBe(false);
    await mount();
    expect(cartFeedbackActive()).toBe(true);
    await act(async () => root?.unmount());
    root = null;
    expect(cartFeedbackActive()).toBe(false);
  });

  it("is completely off in Emergency fast mode", async () => {
    state.flags = { emergency_fast_mode: true, safe_mode: false };
    await mount();
    await added();
    expect(container.querySelector(".brw-sheet")).toBeNull();
    expect(cartFeedbackActive()).toBe(false);
  });

  it("is off when the owner switches motion off in the admin", async () => {
    state.flags = { emergency_fast_mode: false, safe_mode: false, disable_motion: true };
    await mount();
    await added();
    expect(container.querySelector(".brw-sheet")).toBeNull();
    expect(cartFeedbackActive()).toBe(false);
  });

  it("is off with ?motion=off, so the site can be measured without it", async () => {
    window.history.replaceState({}, "", "/?motion=off");
    await mount();
    await added();
    expect(container.querySelector(".brw-sheet")).toBeNull();
    expect(cartFeedbackActive()).toBe(false);
  });
});
