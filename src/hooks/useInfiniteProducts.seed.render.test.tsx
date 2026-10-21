// @vitest-environment jsdom
/** A first page that arrives with the page (server-rendered) is shown at once and costs no request. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchPage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db-public.functions", () => ({ getPostersByCategoryPublic: fetchPage }));

import { useInfiniteProducts, type InitialProducts, type PosterRow } from "./useInfiniteProducts";

const row = (id: string) =>
  ({
    id,
    title: `Poster ${id}`,
    image_url: `https://img.example.com/p/${id}-1000.webp`,
    category_id: "c1",
    badge: null,
    sales_count: 0,
    views_count: 0,
    is_best_seller: false,
    webp_srcset: null,
    avif_srcset: null,
  }) as unknown as PosterRow;

let root: Root;
let container: HTMLElement;
let latest: ReturnType<typeof useInfiniteProducts>;

function Probe({ queryKey, initial }: { queryKey: string; initial: InitialProducts | null }) {
  latest = useInfiniteProducts(["c1"], { sort: "newest" }, queryKey, initial);
  return <div data-count={latest.products.length} />;
}
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

beforeEach(() => {
  fetchPage.mockReset().mockResolvedValue([]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("useInfiniteProducts with a server-rendered first page", () => {
  const initial: InitialProducts = { key: "k1", limit: 12, rows: [row("a"), row("b")] };

  it("has the posters on the very first render and does not fetch", async () => {
    let firstRenderCount = -1;
    function First() {
      const r = useInfiniteProducts(["c1"], { sort: "newest" }, "k1", initial);
      if (firstRenderCount < 0) firstRenderCount = r.products.length;
      return null;
    }
    await act(async () => root.render(<First />));
    await flush();
    expect(firstRenderCount).toBe(2);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("an incomplete page means the list is complete", async () => {
    await act(async () => root.render(<Probe queryKey="k1" initial={initial} />));
    await flush();
    expect(latest.state).toBe("end");
  });

  it("continues after the seeded rows, not from the start", async () => {
    const full: InitialProducts = { key: "k1", limit: 2, rows: [row("a"), row("b")] };
    fetchPage.mockResolvedValue([row("c")]);
    await act(async () => root.render(<Probe queryKey="k1" initial={full} />));
    await flush();
    expect(latest.state).toBe("idle");
    await act(async () => latest.loadMore());
    await flush();
    expect(fetchPage.mock.calls[0][0].data.offset).toBe(2);
    expect(latest.products.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("a different list (other sort / sub-category) ignores the seed and fetches", async () => {
    fetchPage.mockResolvedValue([row("z")]);
    await act(async () => root.render(<Probe queryKey="k2" initial={initial} />));
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(latest.products.map((p) => p.id)).toEqual(["z"]);
  });

  it("changing the list after the seed was used fetches the new one", async () => {
    await act(async () => root.render(<Probe queryKey="k1" initial={initial} />));
    await flush();
    fetchPage.mockResolvedValue([row("y")]);
    await act(async () => root.render(<Probe queryKey="k3" initial={initial} />));
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(latest.products.map((p) => p.id)).toEqual(["y"]);
  });
});
