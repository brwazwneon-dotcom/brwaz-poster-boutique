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

/** Frames hang in this order: the middle one first, then outwards. */
export const WALL_LAYOUTS: Record<3 | 6, WallFrame[]> = {
  6: [
    frame("40x60", { l: 42, t: 4, w: 16 }, { l: 38, t: 4, w: 24 }),
    frame("30x40", { l: 27.5, t: 8, w: 13 }, { l: 17, t: 9, w: 19 }),
    frame("30x40", { l: 59.5, t: 8, w: 13 }, { l: 64, t: 9, w: 19 }),
    frame("20x30", { l: 16.5, t: 11, w: 9 }, { l: 3.5, t: 13, w: 12 }),
    frame("20x30", { l: 74.5, t: 11, w: 9 }, { l: 84.5, t: 13, w: 12 }),
    frame("20x30", { l: 46.5, t: 31, w: 7 }, { l: 45, t: 42, w: 10 }),
  ],
  3: [
    frame("40x60", { l: 40.5, t: 5, w: 19 }, { l: 35, t: 5, w: 30 }),
    frame("30x40", { l: 22, t: 9, w: 16 }, { l: 2.5, t: 12, w: 30 }),
    frame("30x40", { l: 62, t: 9, w: 16 }, { l: 67.5, t: 12, w: 30 }),
  ],
};
