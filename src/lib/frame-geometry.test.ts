import { describe, expect, it } from "vitest";
import { frameSpecFor, parseSize } from "./frame-geometry";

describe("ordered frame facts (from the order row only)", () => {
  it("parses ids and human labels", () => {
    expect(parseSize("30x40")).toEqual({ w: 30, h: 40 });
    expect(parseSize("100 x 60 cm")).toEqual({ w: 100, h: 60 });
    expect(parseSize("20 × 30")).toEqual({ w: 20, h: 30 });
    expect(parseSize("big")).toBeNull();
    expect(parseSize(null)).toBeNull();
  });

  it("reads family, tone and printed size from the order", () => {
    expect(
      frameSpecFor({ frame_type: "High Quality PVC", frame_color: "Black", size: "30 x 40 cm" }),
    ).toMatchObject({
      family: "pvc",
      tone: "black",
      widthCm: 30,
      heightCm: 40,
      fallback: false,
    });
    expect(
      frameSpecFor({ frame_type: "Wooden Portrait", frame_color: "Wood", size: "50 x 70 cm" }),
    ).toMatchObject({
      family: "wood",
      tone: "wood",
      widthCm: 50,
      heightCm: 70,
    });
    expect(
      frameSpecFor({ frame_type: "Wooden Portrait", frame_color: "White", size: "40 x 50 cm" })
        .tone,
    ).toBe("white");
  });

  it("printed-size ratio is exactly width / height (landscape stays landscape)", () => {
    expect(
      frameSpecFor({ frame_type: "", frame_color: "", size: "100 x 60 cm" }).printAspect,
    ).toBeCloseTo(100 / 60, 6);
    expect(
      frameSpecFor({ frame_type: "", frame_color: "", size: "20 x 30 cm" }).printAspect,
    ).toBeCloseTo(20 / 30, 6);
  });

  it("flags unknown sizes", () => {
    expect(frameSpecFor({ frame_type: "", frame_color: "", size: "???" }).fallback).toBe(true);
  });

  it("stores no invented physical thickness", () => {
    expect(Object.keys(frameSpecFor({ size: "30x40" }))).not.toContain("mouldingCm");
  });
});
