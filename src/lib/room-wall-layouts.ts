// Gallery-wall layouts for the homepage "room" section.
//
// Every number is in "stage-width units": 1 unit = 1% of the stage's width
// (rendered with the CSS `cqw` unit), so a layout keeps its proportions at
// any width. `d` is the desktop placement, `m` the phone placement (the stage
// is taller on phones, so frames can be bigger). `l` = left edge, `t` = top
// edge, `w` = frame width; the height follows from the frame's aspect ratio.

export type WallSize = "20x30" | "30x40" | "40x60";

export type WallPlacement = { l: number; t: number; w: number };

export type WallFrame = {
  size: WallSize;
  /** width / height of the frame */
  aspect: number;
  d: WallPlacement;
  m: WallPlacement;
};

const ASPECT: Record<WallSize, number> = {
  "20x30": 2 / 3,
  "30x40": 3 / 4,
  "40x60": 2 / 3,
};

function frame(size: WallSize, d: WallPlacement, m: WallPlacement): WallFrame {
  return { size, aspect: ASPECT[size], d, m };
}

/** An evenly spaced grid of identical frames, centred on the wall. */
type Grid = { cols: number; rows: number; w: number; gapX: number; gapY: number; top: number };

/** Placements in row-major order (left to right, top to bottom). */
function gridPlacements(aspect: number, g: Grid): WallPlacement[] {
  const height = g.w / aspect;
  const left = (100 - (g.cols * g.w + (g.cols - 1) * g.gapX)) / 2;
  const round = (n: number) => Math.round(n * 100) / 100;
  const out: WallPlacement[] = [];
  for (let r = 0; r < g.rows; r += 1) {
    for (let c = 0; c < g.cols; c += 1) {
      out.push({
        l: round(left + c * (g.w + g.gapX)),
        t: round(g.top + r * (height + g.gapY)),
        w: g.w,
      });
    }
  }
  return out;
}

/**
 * Identical frames of one size on a grid. `desktop` and `phone` size the same
 * grid for the wide and the tall stage; `order` lists the grid cells (row-major
 * indices) in the order the frames hang.
 */
function gridLayout(size: WallSize, desktop: Grid, phone: Grid, order: number[]): WallFrame[] {
  const d = gridPlacements(ASPECT[size], desktop);
  const m = gridPlacements(ASPECT[size], phone);
  return order.map((i) => frame(size, d[i], m[i]));
}

/**
 * 6 x 20x30 as 3 + 3, and 4 x 30x40 in one row: every frame in a layout has
 * the same size. The grids stay clear of the lamp, the books and the vase on
 * the console, and everything is in stage-width units so the room scales as a
 * whole on any screen.
 */
export const WALL_LAYOUTS: Record<4 | 6, WallFrame[]> = {
  // Cells: 0 1 2 / 3 4 5. The middle of the top row hangs first, then outwards.
  6: gridLayout(
    "20x30",
    { cols: 3, rows: 2, w: 11.5, gapX: 2.5, gapY: 2.5, top: 3.5 },
    { cols: 3, rows: 2, w: 17, gapX: 2.5, gapY: 2.5, top: 3 },
    [1, 0, 2, 4, 3, 5],
  ),
  // Cells: 0 1 2 3. The two middle frames hang first, then the outer two.
  4: gridLayout(
    "30x40",
    { cols: 4, rows: 1, w: 17, gapX: 3, gapY: 0, top: 8 },
    { cols: 4, rows: 1, w: 21, gapX: 2.5, gapY: 0, top: 10 },
    [1, 2, 0, 3],
  ),
};
