// @vitest-environment jsdom
// The preloader overlay: dismissed when the visible page can respond, never before, with a bounded fallback.
// jsdom has no layout, so getBoundingClientRect is stubbed (a control is "in the viewport" unless it is flagged data-offscreen), and a
// control counts as hydrated when it carries a "__reactProps$..." own property, which is exactly what React's hydration sets.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppPreloader,
  FADE_MS,
  FAILSAFE_MS,
  READY_FALLBACK_MS,
  READY_POLL_MS,
} from "./AppPreloader";

const hydrate = (el: Element) => {
  (el as unknown as Record<string, unknown>)["__reactProps$test"] = {};
};
const addControl = (tag = "button", attrs: Record<string, string> = {}) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (tag === "a") el.setAttribute("href", "/x");
  document.body.appendChild(el);
  return el;
};
const overlay = (c: HTMLElement) => c.querySelector<HTMLElement>(".brwz-preloader");
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: matches && q.includes("prefers-reduced-motion"), media: q }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.brwPreloader;
  sessionStorage.clear();
  setReducedMotion(false);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const off = this.hasAttribute("data-offscreen");
    const zero = this.hasAttribute("data-zero");
    if (zero) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
    return off
      ? ({ top: 5000, bottom: 5040, left: 10, right: 50, width: 40, height: 40 } as DOMRect)
      : ({ top: 10, bottom: 50, left: 10, right: 50, width: 40, height: 40 } as DOMRect);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AppPreloader markup", () => {
  it("renders the covering, inert-to-assistive-tech overlay with the brand logo", () => {
    addControl(); // a control that is not hydrated yet keeps it covering
    const { container } = render(<AppPreloader />);
    const el = overlay(container)!;
    expect(el).toBeTruthy();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.position).toBe("fixed");
    expect(el.style.pointerEvents).toBe("auto");
    expect(el.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("ships a CSS-only failsafe (works when no script runs) and a reduced-motion rule, rendered with the server HTML", () => {
    const { container } = render(<AppPreloader />);
    const css = container.querySelector("style")!.textContent!;
    expect(css).toContain("@keyframes brwz-preloader-failsafe");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(overlay(container)!.style.animation).toContain(
      `brwz-preloader-failsafe 1ms linear ${FAILSAFE_MS}ms forwards`,
    );
  });

  it("the failsafe is much longer than the fallback, so it only ever matters when scripts do not run", () => {
    expect(FAILSAFE_MS).toBeGreaterThan(READY_FALLBACK_MS * 5);
  });
});

describe("dismissal when the page is ready", () => {
  it("a page with no controls in view is ready: dismissed immediately, no minimum display time", () => {
    const { container } = render(<AppPreloader />);
    // the effect ran inside render's act: dismissal has started (fade), not waited for 600 ms
    expect(overlay(container)!.style.opacity).toBe("0");
    expect(overlay(container)!.style.pointerEvents).toBe("none");
    expect(document.documentElement.dataset.brwPreloader).toBe("ready");
    advance(FADE_MS);
    expect(overlay(container)).toBeNull();
  });

  it("when every visible control is hydrated the overlay goes after one short fade", () => {
    for (let i = 0; i < 5; i++) hydrate(addControl(i % 2 ? "a" : "button"));
    const { container } = render(<AppPreloader />);
    expect(document.documentElement.dataset.brwPreloader).toBe("ready");
    expect(overlay(container)!.style.pointerEvents).toBe("none"); // taps pass through during the fade
    advance(FADE_MS - 1);
    expect(overlay(container)).not.toBeNull();
    advance(1);
    expect(overlay(container)).toBeNull();
  });

  it("a leftover preloaderShown value from an older version is ignored: no session shortcut, the same readiness rule applies", () => {
    sessionStorage.setItem("preloaderShown", "1");
    const btn = addControl();
    const { container } = render(<AppPreloader />);
    advance(300);
    expect(overlay(container)!.style.opacity).toBe("1");
    hydrate(btn);
    advance(READY_POLL_MS);
    expect(document.documentElement.dataset.brwPreloader).toBe("ready");
  });
});

describe("no premature dismissal", () => {
  it("stays fully covering while a visible control is not hydrated, and uncovers within one poll of it becoming hydrated", () => {
    const hydrated = addControl("button");
    hydrate(hydrated);
    const pending = addControl("a");
    const { container } = render(<AppPreloader />);
    for (let t = 0; t < READY_FALLBACK_MS - READY_POLL_MS * 2; t += READY_POLL_MS) {
      advance(READY_POLL_MS);
      expect(overlay(container)!.style.opacity).toBe("1");
      expect(overlay(container)!.style.pointerEvents).toBe("auto");
      expect(document.documentElement.dataset.brwPreloader).toBeUndefined();
    }
    hydrate(pending);
    advance(READY_POLL_MS);
    expect(document.documentElement.dataset.brwPreloader).toBe("ready");
  });

  it("an unhydrated control that is off screen or zero-sized does not hold it", () => {
    addControl("button", { "data-offscreen": "" });
    addControl("button", { "data-zero": "" });
    const { container } = render(<AppPreloader />);
    expect(document.documentElement.dataset.brwPreloader).toBe("ready");
    expect(overlay(container)).not.toBeNull();
  });

  it("every kind of control is considered: links, inputs, role=button and focusable elements", () => {
    for (const el of [
      addControl("a"),
      addControl("input"),
      addControl("div", { role: "button" }),
      addControl("div", { tabindex: "0" }),
    ]) {
      cleanup();
      document.body.innerHTML = "";
      document.body.appendChild(el);
      delete document.documentElement.dataset.brwPreloader;
      render(<AppPreloader />);
      advance(READY_POLL_MS * 3);
      expect(document.documentElement.dataset.brwPreloader).toBeUndefined();
      cleanup();
    }
  });

  it("hidden inputs are not controls", () => {
    addControl("input", { type: "hidden" });
    render(<AppPreloader />);
    expect(document.documentElement.dataset.brwPreloader).toBe("ready");
  });
});

describe("bounded fallback", () => {
  it("dismisses at READY_FALLBACK_MS when readiness cannot be established, never earlier, never later", () => {
    addControl("a"); // never hydrated, e.g. a link inside injected HTML
    const { container } = render(<AppPreloader />);
    advance(READY_FALLBACK_MS - 1);
    expect(document.documentElement.dataset.brwPreloader).toBeUndefined();
    expect(overlay(container)!.style.opacity).toBe("1");
    advance(READY_POLL_MS); // the next poll at or after the limit
    expect(document.documentElement.dataset.brwPreloader).toBe("fallback");
    advance(FADE_MS);
    expect(overlay(container)).toBeNull();
  });

  it("the fallback is no longer than the old fixed delay it replaces (600 ms minimum + 500 ms fade)", () => {
    expect(READY_FALLBACK_MS + FADE_MS).toBeLessThanOrEqual(600 + 500);
  });

  it("never dismisses twice and leaves no timers behind", () => {
    addControl("a");
    render(<AppPreloader />);
    advance(READY_FALLBACK_MS + FADE_MS + 500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmounting before it is ready stops everything (no late state update, no timers)", () => {
    addControl("a");
    const { unmount } = render(<AppPreloader />);
    advance(READY_POLL_MS * 2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(READY_FALLBACK_MS * 2);
    expect(document.documentElement.dataset.brwPreloader).toBeUndefined();
  });
});

describe("reduced motion", () => {
  it("removes the overlay at once, without a fade, and still waits for readiness", () => {
    setReducedMotion(true);
    const btn = addControl();
    const { container } = render(<AppPreloader />);
    advance(READY_POLL_MS * 4);
    expect(overlay(container)).not.toBeNull(); // not ready yet: still covering
    hydrate(btn);
    advance(READY_POLL_MS);
    expect(overlay(container)).toBeNull(); // gone immediately, no fade period
  });
});

describe("accessibility", () => {
  it("never takes focus and never traps it: nothing inside the overlay is focusable, and it is gone once ready", () => {
    const { container } = render(<AppPreloader />);
    const el = overlay(container)!;
    expect(el.querySelector("a, button, input, select, textarea, [tabindex]")).toBeNull();
    advance(FADE_MS);
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});
