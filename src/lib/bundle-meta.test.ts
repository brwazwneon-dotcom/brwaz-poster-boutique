import { describe, expect, it } from "vitest";
import {
  buildBundleNotes,
  bundlePosterIds,
  canonicalBundleNotes,
  parseBundleMeta,
} from "./bundle-meta";

const ID1 = "123e4567-e89b-12d3-a456-426614174000";
const ID2 = "223e4567-e89b-12d3-a456-426614174000";

describe("bundle meta", () => {
  it("round-trips posters and drops non-uuid ids / non-URL images", () => {
    const notes = buildBundleNotes([
      { posterId: ID1, title: "RANDOM (9)", image: "https://img/a.jpg" },
      { posterId: "set-abc", title: "Other", image: "/relative.jpg" },
    ]);
    expect(parseBundleMeta(notes)).toEqual({
      bundle_posters: [
        { id: ID1, title: "RANDOM (9)", image: "https://img/a.jpg" },
        { id: null, title: "Other", image: "" },
      ],
    });
  });

  it("ignores notes that are not bundle meta", () => {
    expect(parseBundleMeta(null)).toBeNull();
    expect(parseBundleMeta("please call me first")).toBeNull();
    expect(parseBundleMeta('{"originalFilename":"a.jpg"}')).toBeNull();
    expect(parseBundleMeta("{bad json")).toBeNull();
  });

  it("rewrites title/image from the catalog by id, never trusting the browser", () => {
    const notes = buildBundleNotes([
      { posterId: ID1, title: "fake", image: "https://evil/x.jpg" },
      { posterId: ID2, title: "Kept", image: "https://img/b.jpg" },
    ]);
    const out = canonicalBundleNotes(
      notes,
      new Map([[ID1, { title: "RANDOM (9)", image_url: "https://res.cloudinary.com/a.jpg" }]]),
    );
    expect(parseBundleMeta(out)!.bundle_posters).toEqual([
      { id: ID1, title: "RANDOM (9)", image: "https://res.cloudinary.com/a.jpg" },
      { id: ID2, title: "Kept", image: "https://img/b.jpg" },
    ]);
  });

  it("lists poster ids", () => {
    expect(bundlePosterIds(buildBundleNotes([{ posterId: ID1, title: "a", image: "" }]))).toEqual([
      ID1,
    ]);
    expect(bundlePosterIds("hello")).toEqual([]);
  });
});

describe("bundleImageAt", () => {
  const meta = parseBundleMeta(
    buildBundleNotes([
      { posterId: ID1, title: "A", image: "https://img/a.jpg" },
      { posterId: ID2, title: "B", image: "https://img/b.jpg" },
    ]),
  );
  it("matches by position when counts agree", async () => {
    const { bundleImageAt } = await import("./bundle-meta");
    expect(bundleImageAt(meta, ["A", "B"], 1)).toBe("https://img/b.jpg");
  });
  it("falls back to exact title when counts differ, and never guesses", async () => {
    const { bundleImageAt } = await import("./bundle-meta");
    expect(bundleImageAt(meta, ["B"], 0)).toBe("https://img/b.jpg");
    expect(bundleImageAt(meta, ["Nope"], 0)).toBeNull();
    expect(bundleImageAt(null, ["A"], 0)).toBeNull();
  });
});
