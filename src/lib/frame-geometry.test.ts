import { describe, expect, it } from "vitest";
import { frameCssFor, frameSpecFor, parseSize } from "./frame-geometry";

describe("frame geometry for the preview", () => {
  it("parses ids and human labels", () => {
    expect(parseSize("30x40")).toEqual({ w: 30, h: 40 });
    expect(parseSize("100 x 60 cm")).toEqual({ w: 100, h: 60 });
    expect(parseSize("20 × 30")).toEqual({ w: 20, h: 30 });
    expect(parseSize("big")).toBeNull();
    expect(parseSize(null)).toBeNull();
  });

  it("10. uses the ordered frame type, colour and size", () => {
    const pvc = frameSpecFor({
      frame_type: "High Quality PVC",
      frame_color: "Black",
      size: "30 x 40 cm",
    });
    expect(pvc).toMatchObject({ family: "pvc", tone: "black", widthCm: 30, heightCm: 40 });
    const wood = frameSpecFor({
      frame_type: "Wooden Portrait",
      frame_color: "Wood",
      size: "50 x 70 cm",
    });
    expect(wood).toMatchObject({ family: "wood", tone: "wood", widthCm: 50, heightCm: 70 });
    const white = frameSpecFor({
      frame_type: "Wooden Portrait",
      frame_color: "White",
      size: "40 x 50 cm",
    });
    expect(white.tone).toBe("white");
    expect(wood.mouldingCm).toBeGreaterThan(pvc.mouldingCm);
  });

  it("keeps the real aspect ratio (landscape sizes stay landscape)", () => {
    const land = frameSpecFor({
      frame_type: "Wooden Portrait",
      frame_color: "Black",
      size: "100 x 60 cm",
    });
    expect(land.aspect).toBeGreaterThan(1);
    const por = frameSpecFor({
      frame_type: "High Quality PVC",
      frame_color: "Black",
      size: "20 x 30 cm",
    });
    expect(por.aspect).toBeLessThan(1);
  });

  it("opening aspect equals the print aspect (image is never distorted)", () => {
    for (const size of ["20 x 30 cm", "30 x 40 cm", "40 x 60 cm", "100 x 60 cm", "60 x 90 cm"]) {
      const s = frameSpecFor({ frame_type: "Wooden Portrait", frame_color: "Black", size });
      const openW = (100 - 2 * s.mouldingXPct) * s.aspect; // in units of outer height
      const openH = 100 - 2 * s.mouldingYPct;
      expect(openW / openH).toBeCloseTo(s.widthCm / s.heightCm, 3);
    }
  });

  it("flags unknown sizes and still returns a usable ratio", () => {
    const s = frameSpecFor({ frame_type: "", frame_color: "", size: "???" });
    expect(s.fallback).toBe(true);
    expect(s.aspect).toBeGreaterThan(0);
  });

  it("returns distinct styling per colour", () => {
    const mk = (c: string) =>
      frameCssFor(frameSpecFor({ frame_type: "High Quality PVC", frame_color: c, size: "30x40" }))
        .background;
    expect(new Set([mk("Black"), mk("White"), mk("Wood")]).size).toBe(3);
  });
});
