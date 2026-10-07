/**
 * Facts about an ordered frame that come straight from the order row.
 * Order rows store human labels ("High Quality PVC", "20 x 30 cm", "Black"),
 * so everything here parses labels as well as ids.
 *
 * No physical frame thickness lives here on purpose: that is not stored
 * anywhere in the product data. The visual frame is the bundled mockup image
 * (see frame-mockup-geometry.ts), not something drawn from guessed numbers.
 */

export type FrameFamily = "pvc" | "wood";
export type FrameTone = "black" | "white" | "wood";

export type FrameSpec = {
  family: FrameFamily;
  tone: FrameTone;
  /** Printed image size in cm, as ordered (portrait sizes are width × height). */
  widthCm: number;
  heightCm: number;
  /** width / height of the printed image. */
  printAspect: number;
  /** True when the size label could not be parsed and 30×40 was assumed. */
  fallback: boolean;
};

const DEFAULT_SIZE = { w: 30, h: 40 };

export function parseSize(raw: string | null | undefined): { w: number; h: number } | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

export function frameFamilyOf(raw: string | null | undefined): FrameFamily {
  return /wood|خشب/i.test(raw ?? "") ? "wood" : "pvc";
}

export function frameToneOf(raw: string | null | undefined, family: FrameFamily): FrameTone {
  const v = (raw ?? "").toLowerCase();
  if (/white|ابيض|أبيض/.test(v)) return "white";
  if (/black|اسود|أسود/.test(v)) return "black";
  if (/wood|خشب|brown|natural/.test(v)) return "wood";
  return family === "wood" ? "wood" : "black";
}

export function frameSpecFor(order: {
  frame_type?: string | null;
  frame_color?: string | null;
  size?: string | null;
}): FrameSpec {
  const family = frameFamilyOf(order.frame_type);
  const tone = frameToneOf(order.frame_color, family);
  const parsed = parseSize(order.size);
  const { w, h } = parsed ?? DEFAULT_SIZE;
  return { family, tone, widthCm: w, heightCm: h, printAspect: w / h, fallback: !parsed };
}
