// Maps a flat rectangle (the artwork) onto an arbitrary 4-corner window (the
// opening of a photographed frame that leans back in perspective) as a CSS
// matrix3d, so the artwork follows the frame's exact tilt and fills the whole
// opening. Pure maths — no DOM.
export type Pt = [number, number];
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

/** Grows a quad about its centre, so artwork tucks under the frame edge instead of leaving a hairline gap. */
export function growQuad(q: Quad, factor: number): Quad {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  return q.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]) as Quad;
}

/** Average width/height of the quad (its corners are not an exact rectangle). */
export function quadSize(q: Quad): { w: number; h: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { w: (d(q[0], q[1]) + d(q[3], q[2])) / 2, h: (d(q[0], q[3]) + d(q[1], q[2])) / 2 };
}

/** Projective coefficients taking (0,0),(w,0),(w,h),(0,h) onto the quad. */
export function quadHomography(w: number, h: number, q: Quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number, g: number, hh: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0;
    b = x3 - x0;
    d = y1 - y0;
    e = y3 - y0;
    g = 0;
    hh = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    hh = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + hh * x3;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + hh * y3;
  }
  // From unit-square coordinates to the element's own pixel box.
  return { a: a / w, b: b / h, c: x0, d: d / w, e: e / h, f: y0, g: g / w, h: hh / h };
}

/** CSS `matrix3d(...)` for an element of w×h px with transform-origin 0 0. */
export function quadMatrix3d(w: number, h: number, q: Quad): string {
  const m = quadHomography(w, h, q);
  const n = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toFixed(10)));
  return `matrix3d(${[m.a, m.d, 0, m.g, m.b, m.e, 0, m.h, 0, 0, 1, 0, m.c, m.f, 0, 1].map(n).join(",")})`;
}

/** Where a point of the w×h box lands — used by tests. */
export function applyQuad(w: number, h: number, q: Quad, x: number, y: number): Pt {
  const m = quadHomography(w, h, q);
  const den = m.g * x + m.h * y + 1;
  return [(m.a * x + m.b * y + m.c) / den, (m.d * x + m.e * y + m.f) / den];
}

/**
 * Corners of the transparent window in the built-in leaning-wood mockup
 * (/assets/mockups/frame-wood.webp, 852×1280), in % of the image — measured
 * from the image's alpha channel.
 */
export const WOOD_MOCKUP_QUAD_PCT: Quad = [
  [15.61, 12.89],
  [84.62, 15.23],
  [90.38, 86.02],
  [19.84, 89.61],
];
