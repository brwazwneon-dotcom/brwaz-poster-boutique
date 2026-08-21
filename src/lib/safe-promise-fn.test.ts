import { describe, expect, it, vi } from "vitest";
import { safePromiseFn } from "./safe-promise-fn";

describe("safePromiseFn — failure isolation", () => {
  it("returns ok status when the promise resolves", async () => {
    const result = await safePromiseFn(Promise.resolve(42), 0, "test");
    expect(result.status).toBe("ok");
    expect(result.value).toBe(42);
  });

  it("returns fallback and unavailable status when the promise rejects", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = Promise.reject(new Error("db down"));
    const result = await safePromiseFn(failing, 0, "db-count");
    expect(result.status).toBe("unavailable");
    expect(result.value).toBe(0);
    expect(result.error).toBe("db down");
    warnSpy.mockRestore();
  });

  it("does not propagate the rejection to the caller", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = Promise.reject(new Error("network"));
    await expect(safePromiseFn(failing, null, "x")).resolves.toBeDefined();
    warnSpy.mockRestore();
  });

  it("preserves the fallback object reference when rejected", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = { ok: false };
    const failing = Promise.reject(new Error("boom"));
    const result = await safePromiseFn(failing, fallback, "y");
    expect(result.value).toBe(fallback);
    expect(result.status).toBe("unavailable");
    warnSpy.mockRestore();
  });

  it("never hangs: a promise that never resolves is caught as unavailable after the timeout", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A promise that never settles (no resolve/reject) must not block the caller.
    const hanging = new Promise<number>(() => {});
    const start = Date.now();
    const result = await safePromiseFn(hanging, 0, "hang", 30);
    expect(result.status).toBe("unavailable");
    expect(result.value).toBe(0);
    // It must resolve near the timeout, not hang indefinitely.
    expect(Date.now() - start).toBeLessThan(1000);
    warnSpy.mockRestore();
  });

  it("resolves normally when the promise settles before the timeout", async () => {
    const result = await safePromiseFn(Promise.resolve("ok"), "fallback", "fast", 30);
    expect(result.status).toBe("ok");
    expect(result.value).toBe("ok");
  });
});
