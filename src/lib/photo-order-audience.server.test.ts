import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/neon.server", () => ({ sql: () => () => Promise.resolve([]) }));

import { storePhotoAudience } from "./photo-order-audience.server";

describe("storePhotoAudience", () => {
  it("stores the two known audiences for the order", async () => {
    const run = vi.fn().mockResolvedValue([]);
    expect(await storePhotoAudience("o1", { first: "youth", last: "album" }, run)).toBe(true);
    expect(run).toHaveBeenCalledWith("o1", JSON.stringify({ first: "youth", last: "album" }));
  });

  it("one audience is enough", async () => {
    const run = vi.fn().mockResolvedValue([]);
    await storePhotoAudience("o1", { last: "ALBUM" }, run);
    expect(run).toHaveBeenCalledWith("o1", JSON.stringify({ first: null, last: "album" }));
  });

  it("drops anything that is not a known audience, and writes nothing when nothing is left", async () => {
    const run = vi.fn().mockResolvedValue([]);
    for (const junk of [
      undefined,
      null,
      "album",
      42,
      {},
      { first: "hacker", last: { x: 1 } },
      { first: "'; drop table orders;--" },
    ]) {
      expect(await storePhotoAudience("o1", junk, run)).toBe(false);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("a database error (for example the column does not exist yet) never throws: the order is safe", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue(new Error('column "audience" does not exist'));
    await expect(storePhotoAudience("o1", { last: "album" }, run)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
