import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunk-recovery";

describe("isChunkLoadError", () => {
  it("recognises failed script / chunk loads", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: https://x/assets/cart-abc.js"),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 12 failed."))).toBe(true);
    expect(isChunkLoadError("error loading dynamically imported module")).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
