export const FRAME_TYPES = [
  { id: "pvc", label: "High Quality PVC" },
  { id: "wood", label: "Wooden Portrait" },
] as const;

export const SIZES = [
  { id: "20x30", label: "20 x 30 cm" },
  { id: "30x40", label: "30 x 40 cm" },
  { id: "40x50", label: "40 x 50 cm" },
] as const;

export const FRAME_COLORS = [
  { id: "black", label: "Black", swatch: "#0a0a0a" },
  { id: "white", label: "White", swatch: "#f5f5f5" },
  { id: "wood", label: "Wood", swatch: "#7a4a26" },
] as const;

export type FrameTypeId = (typeof FRAME_TYPES)[number]["id"];
export type SizeId = (typeof SIZES)[number]["id"];
export type FrameColorId = (typeof FRAME_COLORS)[number]["id"];

export const labelForFrame = (id: FrameTypeId) =>
  FRAME_TYPES.find((f) => f.id === id)?.label ?? id;
export const labelForSize = (id: SizeId) =>
  SIZES.find((s) => s.id === id)?.label ?? id;
export const labelForColor = (id: FrameColorId) =>
  FRAME_COLORS.find((c) => c.id === id)?.label ?? id;