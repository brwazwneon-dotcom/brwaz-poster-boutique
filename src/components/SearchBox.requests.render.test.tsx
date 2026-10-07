// @vitest-environment jsdom
/**
 * Request behaviour of the search box: typing "spider" must not create one server request per
 * keystroke. Debounce + minimum length + react-query dedupe + abort signal.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ search: vi.fn(), trending: vi.fn(), navigate: vi.fn() }));
vi.mock("@/lib/db-public.functions", () => ({
  searchPostersPublic: fns.search,
  getTrendingSearchesPublic: fns.trending,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...p }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a href="#hit" data-testid="hit">
      {children}
    </a>
  ),
  useNavigate: () => fns.navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { defaultValue?: string }) => o?.defaultValue ?? key,
    i18n: { language: "en" },
  }),
}));
vi.mock("@/components/FramedArtwork", () => ({ FramedArtwork: () => <span /> }));

import { SEARCH_DEBOUNCE_MS, SearchBox } from "./SearchBox";

let root: Root | null = null;
let container: HTMLElement;
let client: QueryClient;
async function mount(ui: ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}
const input = () => container.querySelector("input") as HTMLInputElement;
async function type(text: string) {
  const el = input();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, text);
  await act(async () => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function typeSlowly(word: string, gapMs: number) {
  for (let i = 1; i <= word.length; i += 1) {
    await type(word.slice(0, i));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(gapMs);
    });
  }
}
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fns.search.mockReset().mockResolvedValue([]);
  fns.trending.mockReset().mockResolvedValue([]);
  fns.navigate.mockReset();
  window.localStorage.clear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  vi.useRealTimers();
});

describe("search box request behaviour", () => {
  it("fast typing of 's p i d e r' sends ONE request, for the final text only", async () => {
    await mount(<SearchBox variant="header" />);
    await typeSlowly("spider", 90);
    await settle();
    expect(fns.search).toHaveBeenCalledTimes(1);
    expect(fns.search.mock.calls[0][0].data).toEqual({ q: "spider", limit: 8 });
  });

  it("normal-speed typing (pauses shorter than the debounce) is also collapsed", async () => {
    await mount(<SearchBox variant="header" />);
    await typeSlowly("spider", SEARCH_DEBOUNCE_MS - 60);
    await settle();
    expect(fns.search).toHaveBeenCalledTimes(1);
  });

  it("a single character never reaches the server; two do", async () => {
    await mount(<SearchBox variant="header" />);
    await type("s");
    await settle();
    expect(fns.search).not.toHaveBeenCalled();
    await type("sp");
    await settle();
    expect(fns.search).toHaveBeenCalledTimes(1);
  });

  it("each request carries an AbortSignal, and typing on aborts the previous one", async () => {
    let first: AbortSignal | undefined;
    fns.search.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          first ??= signal;
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          setTimeout(() => resolve([]), 5000); // slow server
        }),
    );
    await mount(<SearchBox variant="header" />);
    await type("spi");
    await settle(); // request 1 in flight (slow)
    expect(first).toBeDefined();
    await type("spide");
    await settle(); // request 2 starts; request 1 must be cancelled
    expect(fns.search).toHaveBeenCalledTimes(2);
    expect(first!.aborted).toBe(true);
  });

  it("the same text typed again, in a different case or with punctuation, is served from cache (no new request)", async () => {
    await mount(<SearchBox variant="header" />);
    await type("spider");
    await settle();
    await type("SPIDER ");
    await settle();
    await type("Spider!");
    await settle();
    expect(fns.search).toHaveBeenCalledTimes(1);
  });

  it("the page variant makes no suggestion requests (the results page already searches)", async () => {
    await mount(<SearchBox variant="page" />);
    await typeSlowly("spider", 300);
    await settle();
    expect(fns.search).not.toHaveBeenCalled();
  });

  it("shows results for the typed text and a 'type more' hint below the minimum", async () => {
    fns.search.mockResolvedValue([
      {
        id: "1",
        title: "SPIDER (1)",
        image_url: "x",
        category_slug: "marvel",
        category_name: "MARVEL",
      },
    ]);
    await mount(<SearchBox variant="header" />);
    await type("s");
    expect(container.textContent).toContain("Type at least 2 characters");
    await type("spider");
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(container.textContent).toContain("SPIDER (1)");
    expect(container.textContent).toContain("MARVEL");
  });

  it("the clear button empties the box without a request", async () => {
    await mount(<SearchBox variant="header" />);
    await type("spider");
    await settle();
    const before = fns.search.mock.calls.length;
    const clear = container.querySelector("button[aria-label='Clear search']") as HTMLButtonElement;
    expect(clear).toBeTruthy();
    await act(async () => clear.click());
    await settle();
    expect(input().value).toBe("");
    expect(fns.search.mock.calls.length).toBe(before);
  });
});
