export const FRAME_TYPES = [
  { id: "pvc", label: "High Quality PVC" },
  { id: "wood", label: "Wooden Portrait" },
] as const;

export const SIZES = [
  { id: "20x30", label: "20 x 30 cm" },
  { id: "30x40", label: "30 x 40 cm" },
  { id: "40x50", label: "40 x 50 cm" },
  { id: "40x60", label: "40 x 60 cm" },
  { id: "50x60", label: "50 x 60 cm" },
  { id: "50x70", label: "50 x 70 cm" },
  { id: "60x90", label: "60 x 90 cm" },
  { id: "100x60", label: "100 x 60 cm" },
] as const;

export const FRAME_COLORS = [
  { id: "black", label: "Black", swatch: "#0a0a0a" },
  { id: "white", label: "White", swatch: "#f5f5f5" },
  { id: "wood", label: "Wood", swatch: "#7a4a26" },
] as const;

export type FrameTypeId = (typeof FRAME_TYPES)[number]["id"];
export type SizeId = (typeof SIZES)[number]["id"];
export type FrameColorId = (typeof FRAME_COLORS)[number]["id"];

/** Sizes available for the PVC frame family. */
export const PVC_SIZE_IDS = ["20x30", "30x40", "40x50"] as const;
/** Sizes available for Wooden Portrait. Includes the shared small sizes and the large-format additions. */
export const WOOD_SIZE_IDS = [
  "20x30",
  "30x40",
  "40x50",
  "40x60",
  "50x60",
  "50x70",
  "60x90",
  "100x60",
] as const;

export const SIZES_BY_FRAME: Record<FrameTypeId, readonly SizeId[]> = {
  pvc: PVC_SIZE_IDS,
  wood: WOOD_SIZE_IDS,
};

export function sizesForFrame(frameType: FrameTypeId): readonly SizeId[] {
  return SIZES_BY_FRAME[frameType] ?? PVC_SIZE_IDS;
}

export const labelForFrame = (id: FrameTypeId) =>
  FRAME_TYPES.find((f) => f.id === id)?.label ?? id;
export const labelForSize = (id: SizeId) =>
  SIZES.find((s) => s.id === id)?.label ?? id;
export const labelForColor = (id: FrameColorId) =>
  FRAME_COLORS.find((c) => c.id === id)?.label ?? id;