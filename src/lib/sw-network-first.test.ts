import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Loads public/sw.js with stubbed globals and returns its navigation handler.
function load(opts: { fetchImpl: () => Promise<Response>; cached?: Response | undefined }) {
  const src = readFileSync("public/sw.js", "utf8");
  const caches = {
    match: vi.fn(async () => opts.cached),
    open: vi.fn(async () => ({ put: vi.fn() })),
    keys: vi.fn(async () => []),
    delete: vi.fn(),
  };
  const self = { addEventListener: vi.fn(), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  const make = new Function(
    "self",
    "caches",
    "fetch",
    `${src}\nreturn networkFirstWithTimeout;`,
  ) as (s: unknown, c: unknown, f: unknown) => (r: unknown, t: number) => Promise<Response>;
  return make(self, caches, vi.fn(opts.fetchImpl));
}

const req = { url: "https://x.test/search?q=a", mode: "navigate" };
const slow =
  (ms: number, body = "real page") =>
  () =>
    new Promise<Response>((r) => setTimeout(() => r(new Response(body, { status: 200 })), ms));

describe("service worker navigation (network first)", () => {
  it("waits for a slow page instead of showing 'Offline' when nothing is cached", async () => {
    const handle = load({ fetchImpl: slow(120) });
    const res = await handle(req, 30);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("real page");
  });

  it("serves the cached copy when the network is slower than the timeout", async () => {
    const handle = load({ fetchImpl: slow(120), cached: new Response("cached page") });
    const res = await handle(req, 30);
    expect(await res.text()).toBe("cached page");
  });

  it("returns the network response when it is fast", async () => {
    const handle = load({ fetchImpl: slow(0), cached: new Response("cached page") });
    expect(await (await handle(req, 200)).text()).toBe("real page");
  });

  it("falls back to the cache when the network fails", async () => {
    const handle = load({
      fetchImpl: () => Promise.reject(new Error("offline")),
      cached: new Response("cached page"),
    });
    expect(await (await handle(req, 30)).text()).toBe("cached page");
  });

  it("shows Offline only when the request genuinely failed and nothing is cached", async () => {
    const handle = load({ fetchImpl: () => Promise.reject(new Error("offline")) });
    const res = await handle(req, 30);
    expect(res.status).toBe(503);
  });
});
