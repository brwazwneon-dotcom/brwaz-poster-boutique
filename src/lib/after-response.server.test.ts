import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterResponse } from "./after-response.server";

const CTX = Symbol.for("@vercel/request-context");
const g = globalThis as Record<symbol, unknown>;

/** A promise the test resolves by hand, to model a slow Meta call. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  delete g[CTX];
  delete process.env.VERCEL;
});
afterEach(() => {
  delete g[CTX];
  delete process.env.VERCEL;
  vi.useRealTimers();
});

describe("afterResponse — Vercel waitUntil (production)", () => {
  it("returns immediately while a slow task keeps running under waitUntil", async () => {
    const registered: Promise<unknown>[] = [];
    g[CTX] = { get: () => ({ waitUntil: (p: Promise<unknown>) => registered.push(p) }) };
    process.env.VERCEL = "1";
    const slow = deferred();
    let finished = false;

    const mode = await afterResponse(async ({ deferred: d }) => {
      expect(d).toBe(true);
      await slow.promise; // "Meta is slow"
      finished = true;
    });

    // The caller (the order response) is released BEFORE the task finishes...
    expect(mode).toBe("deferred");
    expect(finished).toBe(false);
    expect(registered).toHaveLength(1);
    // ...and the platform is told to keep the function alive for it.
    slow.resolve();
    await registered[0];
    expect(finished).toBe(true);
  });

  it("a task that never finishes does not delay the caller at all", async () => {
    g[CTX] = { get: () => ({ waitUntil: () => {} }) };
    process.env.VERCEL = "1";
    const t0 = Date.now();
    const mode = await afterResponse(() => new Promise(() => {})); // hangs forever
    expect(mode).toBe("deferred");
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it("a failing task never rejects into the caller or into waitUntil", async () => {
    const registered: Promise<unknown>[] = [];
    g[CTX] = { get: () => ({ waitUntil: (p: Promise<unknown>) => registered.push(p) }) };
    await expect(
      afterResponse(async () => {
        throw new Error("meta exploded");
      }),
    ).resolves.toBe("deferred");
    await expect(registered[0]).resolves.toBeUndefined();
  });

  it("a task that throws synchronously is contained too", async () => {
    g[CTX] = { get: () => ({ waitUntil: () => {} }) };
    await expect(
      afterResponse((() => {
        throw new Error("sync");
      }) as never),
    ).resolves.toBe("deferred");
  });
});

describe("afterResponse — not on Vercel (dev / long-lived server)", () => {
  it("detaches: the caller is released and the task still completes", async () => {
    const slow = deferred();
    let finished = false;
    const mode = await afterResponse(async () => {
      await slow.promise;
      finished = true;
    });
    expect(mode).toBe("detached");
    expect(finished).toBe(false);
    slow.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(finished).toBe(true);
  });

  it("swallows failures", async () => {
    await expect(
      afterResponse(async () => {
        throw new Error("boom");
      }),
    ).resolves.toBe("detached");
  });
});

describe("afterResponse — on Vercel but no waitUntil found (safe fallback)", () => {
  it("waits for a fast task (nothing is lost)…", async () => {
    process.env.VERCEL = "1";
    let done = false;
    const mode = await afterResponse(async ({ deferred: d }) => {
      expect(d).toBe(false);
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    expect(mode).toBe("bounded");
    expect(done).toBe(true);
  });

  it("…but never waits longer than the bound for a hanging task", async () => {
    process.env.VERCEL = "1";
    vi.useFakeTimers();
    let released = false;
    const p = afterResponse(() => new Promise(() => {}), { boundMs: 3_500 }).then((m) => {
      released = true;
      return m;
    });
    await vi.advanceTimersByTimeAsync(3_400);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(released).toBe(true);
    await expect(p).resolves.toBe("bounded");
  });

  it("a failing task does not fail the caller", async () => {
    process.env.VERCEL = "1";
    await expect(
      afterResponse(async () => {
        throw new Error("boom");
      }),
    ).resolves.toBe("bounded");
  });
});
