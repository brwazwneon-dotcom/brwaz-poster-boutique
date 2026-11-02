// @vitest-environment jsdom
// The "can this page respond yet?" check: a control in the viewport counts as hydrated when React has put its props on the node.
import { Suspense, act, createElement, use, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERACTIVE_SELECTOR,
  MAX_CONTROLS_CHECKED,
  hasReactProps,
  unhydratedControlsInViewport,
} from "./hydration-ready";

const IN_VIEW = { top: 10, bottom: 50, left: 10, right: 50, width: 40, height: 40 } as DOMRect;
const add = (tag: string, attrs: Record<string, string> = {}, parent: Element = document.body) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.appendChild(el);
  return el;
};
const hydrate = (el: Element, key = "__reactProps$abc123") => {
  (el as unknown as Record<string, unknown>)[key] = { onClick() {} };
};

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.hasAttribute("data-offscreen"))
      return { ...IN_VIEW, top: 9000, bottom: 9040 } as DOMRect;
    if (this.hasAttribute("data-left-of-view"))
      return { ...IN_VIEW, left: -200, right: -100 } as DOMRect;
    if (this.hasAttribute("data-zero"))
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
    return IN_VIEW;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("hasReactProps", () => {
  it("is true only for a node carrying React's props expando, whatever the random suffix", () => {
    const el = add("button");
    expect(hasReactProps(el)).toBe(false);
    hydrate(el, "__reactProps$zzz999");
    expect(hasReactProps(el)).toBe(true);
  });
  it("does not mistake React's fiber key or other expandos for props", () => {
    const el = add("button");
    (el as unknown as Record<string, unknown>)["__reactFiber$abc"] = {};
    (el as unknown as Record<string, unknown>)["__other"] = 1;
    expect(hasReactProps(el)).toBe(false);
  });
});

describe("unhydratedControlsInViewport", () => {
  it("lists visible controls that are still plain server HTML, and nothing once they are hydrated", () => {
    const a = add("a", { href: "/x" });
    const b = add("button");
    expect(unhydratedControlsInViewport(document, null)).toEqual([a, b]);
    hydrate(a);
    expect(unhydratedControlsInViewport(document, null)).toEqual([b]);
    hydrate(b);
    expect(unhydratedControlsInViewport(document, null)).toEqual([]);
  });

  it("ignores controls that are not in the viewport (below, beside, zero-sized)", () => {
    add("button", { "data-offscreen": "" });
    add("button", { "data-left-of-view": "" });
    add("button", { "data-zero": "" });
    expect(unhydratedControlsInViewport(document, null)).toEqual([]);
  });

  it("ignores anything inside the element passed as `ignore` (the overlay itself)", () => {
    const overlay = add("div");
    add("button", {}, overlay);
    const outside = add("button");
    expect(unhydratedControlsInViewport(document, overlay)).toEqual([outside]);
  });

  it("covers the control types a visitor can use", () => {
    const els = [
      add("a", { href: "/" }),
      add("button"),
      add("input", { type: "text" }),
      add("select"),
      add("textarea"),
      add("summary"),
      add("div", { role: "button" }),
      add("div", { role: "link" }),
      add("div", { role: "tab" }),
      add("div", { role: "menuitem" }),
      add("div", { tabindex: "0" }),
    ];
    expect(unhydratedControlsInViewport(document, null)).toEqual(els);
  });

  it("does not count things that are not controls: plain links, hidden inputs, tabindex -1, text", () => {
    add("a"); // an anchor without href is not interactive
    add("input", { type: "hidden" });
    add("div", { tabindex: "-1" });
    add("p");
    expect(unhydratedControlsInViewport(document, null)).toEqual([]);
  });

  it("stays cheap on very long pages: at most MAX_CONTROLS_CHECKED controls are examined", () => {
    for (let i = 0; i < MAX_CONTROLS_CHECKED + 40; i++) hydrate(add("button"));
    const late = add("button"); // beyond the cap: not examined
    expect(unhydratedControlsInViewport(document, null)).not.toContain(late);
    expect(INTERACTIVE_SELECTOR.length).toBeGreaterThan(0);
  });

  it("an empty document is ready", () => {
    expect(unhydratedControlsInViewport(document, null)).toEqual([]);
  });
});

// Behavior of the detector against the INSTALLED React: server-render real markup, hydrate it with the real react-dom and ask the
// production detector (unhydratedControlsInViewport / hasReactProps) what it sees. Nothing here writes the "__reactProps$" key by hand, so
// if a React upgrade renames or stops setting that expando, the "hydrated" assertions fail instead of the preloader silently falling back
// to its 900 ms limit. jsdom has no layout; the file-level getBoundingClientRect stub only decides what is "in the viewport".
describe("against the installed React (real server render + real hydration)", () => {
  const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let savedActEnv: boolean | undefined;
  const roots: Root[] = [];

  beforeEach(() => {
    savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
    actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount();
    });
    document.body.innerHTML = "";
    actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
  });

  /** put the server HTML of `serverTree` in the page, then hydrate it with `clientTree` */
  async function hydrateServerHtml(serverTree: ReactNode, clientTree: ReactNode) {
    const container = document.createElement("div");
    container.innerHTML = renderToString(serverTree);
    document.body.appendChild(container);
    const hydrate = async () => {
      await act(async () => {
        roots.push(hydrateRoot(container, clientTree));
      });
    };
    return { container, hydrate };
  }

  it("a server-rendered control is unhydrated, and is detected as hydrated once hydrateRoot has attached it", async () => {
    const tree = createElement(
      "main",
      null,
      createElement("button", { id: "b", onClick() {} }, "menu"),
      createElement("a", { id: "l", href: "/x", onClick() {} }, "link"),
    );
    const { container, hydrate } = await hydrateServerHtml(tree, tree);
    const button = container.querySelector("#b")!;
    const link = container.querySelector("#l")!;

    // plain server HTML: no expando yet, so the page is NOT ready
    expect(hasReactProps(button)).toBe(false);
    expect(unhydratedControlsInViewport(document, null)).toEqual([button, link]);

    await hydrate();

    // the same nodes are now hydrated by the installed React and the page is ready
    expect(container.querySelector("#b")).toBe(button);
    expect(hasReactProps(button)).toBe(true);
    expect(hasReactProps(link)).toBe(true);
    expect(unhydratedControlsInViewport(document, null)).toEqual([]);
  });

  it("NEGATIVE: a control inside a Suspense boundary that is still pending stays 'not ready' until React hydrates it", async () => {
    // client-only gate: the boundary suspends during hydration until we release it; the server HTML never suspends
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const Late = ({ gated }: { gated: boolean }) => {
      if (gated) use(gate);
      return createElement("button", { id: "late", onClick() {} }, "late");
    };
    const page = (gated: boolean) =>
      createElement(
        "main",
        null,
        createElement("button", { id: "early", onClick() {} }, "early"),
        createElement(Suspense, { fallback: null }, createElement(Late, { gated })),
      );
    const { container, hydrate } = await hydrateServerHtml(page(false), page(true));
    const early = container.querySelector("#early")!;
    const late = container.querySelector("#late")!;

    await hydrate();

    // the boundary that is waiting keeps its server HTML: the detector must say so, and must name exactly that control
    expect(hasReactProps(early)).toBe(true);
    expect(hasReactProps(late)).toBe(false);
    expect(unhydratedControlsInViewport(document, null)).toEqual([late]);

    await act(async () => release());

    expect(hasReactProps(container.querySelector("#late")!)).toBe(true);
    expect(unhydratedControlsInViewport(document, null)).toEqual([]);
  });

  it("NEGATIVE: markup React does not manage (dangerouslySetInnerHTML) is reported as not ready, even after hydration", async () => {
    const tree = createElement(
      "main",
      null,
      createElement("button", { id: "managed", onClick() {} }, "managed"),
      createElement("div", {
        dangerouslySetInnerHTML: { __html: '<a id="injected" href="/x">injected</a>' },
      }),
    );
    const { container, hydrate } = await hydrateServerHtml(tree, tree);
    await hydrate();

    const injected = container.querySelector("#injected")!;
    expect(hasReactProps(container.querySelector("#managed")!)).toBe(true);
    expect(hasReactProps(injected)).toBe(false);
    // this is the documented case that the caller's 900 ms limit exists for
    expect(unhydratedControlsInViewport(document, null)).toEqual([injected]);
  });
});
