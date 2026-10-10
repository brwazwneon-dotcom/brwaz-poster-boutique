import { describe, expect, it } from "vitest";
import {
  WOOD_MOCKUP_QUAD_PCT,
  applyQuad,
  growQuad,
  quadMatrix3d,
  quadSize,
  type Quad,
} from "./quad-transform";

const near = (p: [number, number], x: number, y: number) => {
  expect(p[0]).toBeCloseTo(x, 4);
  expect(p[1]).toBeCloseTo(y, 4);
};

describe("quad transform", () => {
  const q: Quad = [
    [100, 50],
    [700, 80],
    [760, 900],
    [160, 940],
  ];

  it("sends the four corners of the artwork box onto the four corners of the window", () => {
    near(applyQuad(300, 400, q, 0, 0), 100, 50);
    near(applyQuad(300, 400, q, 300, 0), 700, 80);
    near(applyQuad(300, 400, q, 300, 400), 760, 900);
    near(applyQuad(300, 400, q, 0, 400), 160, 940);
  });

  it("keeps straight lines straight (the centre maps inside the window)", () => {
    const [x, y] = applyQuad(300, 400, q, 150, 200);
    expect(x).toBeGreaterThan(300);
    expect(x).toBeLessThan(600);
    expect(y).toBeGreaterThan(300);
    expect(y).toBeLessThan(700);
  });

  it("handles a plain rectangle as a pure scale + offset", () => {
    const rect: Quad = [
      [10, 20],
      [110, 20],
      [110, 220],
      [10, 220],
    ];
    near(applyQuad(50, 100, rect, 25, 50), 60, 120);
  });

  it("emits a 16-number matrix3d", () => {
    const s = quadMatrix3d(300, 400, q);
    expect(s.startsWith("matrix3d(")).toBe(true);
    expect(s.slice(9, -1).split(",")).toHaveLength(16);
  });

  it("grows a quad about its centre", () => {
    const g = growQuad(q, 1.1);
    expect(g[0][0]).toBeLessThan(q[0][0]);
    expect(g[2][0]).toBeGreaterThan(q[2][0]);
  });

  it("measures the wood window as roughly portrait", () => {
    const { w, h } = quadSize(WOOD_MOCKUP_QUAD_PCT.map(([x, y]) => [x * 8.52, y * 12.8]) as Quad);
    expect(h).toBeGreaterThan(w);
  });
});
