/**
 * Geometry + styling for rendering a customer's image inside the frame that
 * was actually ordered. Order rows store human labels ("High Quality PVC",
 * "20 x 30 cm", "Black"), so everything here parses labels as well as ids.
 *
 * The image is always placed with `object-fit: cover; object-position:
 * center` — the same rule the storefront preview uses — and the frame box
 * always has the real print aspect ratio, so nothing is ever stretched.
 */

export type FrameFamily = "pvc" | "wood";
export type FrameTone = "black" | "white" | "wood";

export type FrameSpec = {
  family: FrameFamily;
  tone: FrameTone;
  /** Print width / height in cm (portrait sizes are width × height). */
  widthCm: number;
  heightCm: number;
  /** width / height */
  aspect: number;
  /** Frame moulding thickness in cm. */
  mouldingCm: number;
  /** Moulding thickness as a % of the frame's OUTER width (for left/right insets). */
  mouldingXPct: number;
  /** Moulding thickness as a % of the frame's OUTER height (for top/bottom insets). */
  mouldingYPct: number;
  /** True when the size could not be parsed and a default was used. */
  fallback: boolean;
};

/** Approximate moulding widths (cm). Visual estimate, not a manufacturing spec. */
export const MOULDING_CM: Record<FrameFamily, number> = { pvc: 1.6, wood: 2.2 };

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
  const mouldingCm = MOULDING_CM[family];
  const outerW = w + mouldingCm * 2;
  const outerH = h + mouldingCm * 2;
  return {
    family,
    tone,
    widthCm: w,
    heightCm: h,
    aspect: outerW / outerH,
    mouldingCm,
    mouldingXPct: (mouldingCm / outerW) * 100,
    mouldingYPct: (mouldingCm / outerH) * 100,
    fallback: !parsed,
  };
}

export type FrameCss = {
  background: string;
  boxShadow: string;
  innerShadow: string;
};

export function frameCssFor(spec: FrameSpec): FrameCss {
  const bg: Record<FrameTone, string> = {
    black: "linear-gradient(135deg,#2b2b2b 0%,#0b0b0b 45%,#1c1c1c 100%)",
    white: "linear-gradient(135deg,#ffffff 0%,#e9e9e6 50%,#f7f7f5 100%)",
    wood: "linear-gradient(135deg,#9a6334 0%,#6f4120 40%,#8b5a2e 70%,#5d3719 100%)",
  };
  const bevel: Record<FrameTone, string> = {
    black: "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 2px 3px rgba(255,255,255,0.12)",
    white: "inset 0 0 0 1px rgba(0,0,0,0.10), inset 0 2px 3px rgba(255,255,255,0.9)",
    wood: "inset 0 0 0 1px rgba(0,0,0,0.25), inset 0 2px 3px rgba(255,214,160,0.35)",
  };
  return {
    background: bg[spec.tone],
    boxShadow: `${bevel[spec.tone]}, 0 24px 48px rgba(0,0,0,0.45)`,
    innerShadow: "inset 0 0 14px rgba(0,0,0,0.45)",
  };
}
