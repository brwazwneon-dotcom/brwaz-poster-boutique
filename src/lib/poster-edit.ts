/**
 * Admin poster image editor — settings + canvas renderer.
 *
 * Edits are stored as a small JSON document on the poster row. The renderer
 * composites the source image onto a fixed-ratio canvas (default 2:3) using
 * crop / zoom / pan / stretch, and can fill the gaps when the image does not
 * cover the canvas using a Background-Extend mode (blur / edge color / mirror).
 *
 * Heavy renders only happen when admin clicks Save. Live preview uses a small
 * canvas (e.g. 400×600) so editing stays snappy even on mobile.
 */

export type ExtendMode = "none" | "blur" | "edge" | "mirror";
export type FitMode = "fit" | "fill" | "custom";

export type EditSettings = {
  fit: FitMode;
  /** Multiplier on top of the base fit/fill scale. 1 = no extra zoom. */
  zoom: number;
  /** Pan offset as a fraction of the canvas width/height. -0.5..0.5 typical. */
  offsetX: number;
  offsetY: number;
  /** Stretch multipliers. 1 = no stretch. */
  stretchX: number;
  stretchY: number;
  /** Rotation in degrees. 0 = none. */
  rotate: number;
  extendMode: ExtendMode;
  /** Target output ratio width / height. Defaults to 2/3 (poster). */
  ratio: number;
  /** Schema version for forward-compat. */
  v: 1;
};

export const DEFAULT_EDIT_SETTINGS: EditSettings = {
  // Default to "fit" (contain) so a freshly uploaded image is fully visible
  // inside the frame. Any empty area is filled with a blurred copy of the
  // artwork via `extendMode` so it never reads as a black band.
  fit: "fit",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  stretchX: 1,
  stretchY: 1,
  rotate: 0,
  extendMode: "blur",
  ratio: 2 / 3,
  v: 1,
};

/** Merge partial / legacy settings with defaults. Safe against null/undefined. */
export function normalizeEditSettings(raw: unknown): EditSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EDIT_SETTINGS };
  const v = raw as Partial<EditSettings>;
  const num = (x: unknown, d: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : d;
  };
  return {
    fit: v.fit === "fit" || v.fit === "fill" || v.fit === "custom" ? v.fit : DEFAULT_EDIT_SETTINGS.fit,
    zoom: num(v.zoom, DEFAULT_EDIT_SETTINGS.zoom),
    offsetX: num(v.offsetX, 0),
    offsetY: num(v.offsetY, 0),
    stretchX: num(v.stretchX, 1),
    stretchY: num(v.stretchY, 1),
    rotate: num(v.rotate, 0),
    extendMode:
      v.extendMode === "none" || v.extendMode === "blur" || v.extendMode === "edge" || v.extendMode === "mirror"
        ? v.extendMode
        : DEFAULT_EDIT_SETTINGS.extendMode,
    ratio: num(v.ratio, DEFAULT_EDIT_SETTINGS.ratio),
    v: 1,
  };
}

/** Detect whether two settings are equal enough that nothing changed. */
export function isDefaultEdit(s: EditSettings): boolean {
  const d = DEFAULT_EDIT_SETTINGS;
  return (
    s.fit === d.fit &&
    s.zoom === d.zoom &&
    s.offsetX === 0 &&
    s.offsetY === 0 &&
    s.stretchX === 1 &&
    s.stretchY === 1 &&
    (s.rotate ?? 0) === 0 &&
    s.extendMode === d.extendMode &&
    Math.abs(s.ratio - d.ratio) < 1e-6
  );
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

type Box = { x: number; y: number; w: number; h: number };

function computeImageBox(
  img: { width: number; height: number },
  s: EditSettings,
  outW: number,
  outH: number,
): Box {
  const fitScale = Math.min(outW / img.width, outH / img.height);
  const fillScale = Math.max(outW / img.width, outH / img.height);
  const base = s.fit === "fill" ? fillScale : fitScale;
  const scale = base * Math.max(0.1, s.zoom);
  const w = img.width * scale * Math.max(0.1, s.stretchX);
  const h = img.height * scale * Math.max(0.1, s.stretchY);
  const x = (outW - w) / 2 + s.offsetX * outW;
  const y = (outH - h) / 2 + s.offsetY * outH;
  return { x, y, w, h };
}

/** Average color of a 1-pixel border around the image. */
function getEdgeColor(img: HTMLImageElement): string {
  try {
    const c = document.createElement("canvas");
    const SZ = 64;
    c.width = SZ;
    c.height = SZ;
    const ctx = c.getContext("2d");
    if (!ctx) return "#111111";
    ctx.drawImage(img, 0, 0, SZ, SZ);
    const data = ctx.getImageData(0, 0, SZ, SZ).data;
    let r = 0, g = 0, b = 0, n = 0;
    const sample = (x: number, y: number) => {
      const i = (y * SZ + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    };
    for (let i = 0; i < SZ; i++) {
      sample(i, 0); sample(i, SZ - 1); sample(0, i); sample(SZ - 1, i);
    }
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch {
    return "#111111";
  }
}

/** Draw the background-extend layer that fills the gaps around the image. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: Box,
  s: EditSettings,
  outW: number,
  outH: number,
) {
  if (s.extendMode === "none") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);
    return;
  }
  if (s.extendMode === "edge") {
    ctx.fillStyle = getEdgeColor(img);
    ctx.fillRect(0, 0, outW, outH);
    return;
  }
  if (s.extendMode === "blur") {
    // Cover-fit the image and blur it heavily.
    const fillScale = Math.max(outW / img.width, outH / img.height) * 1.15;
    const w = img.width * fillScale;
    const h = img.height * fillScale;
    const x = (outW - w) / 2;
    const y = (outH - h) / 2;
    ctx.save();
    // 6% of the smaller dimension makes a soft blur that scales with canvas.
    const blurPx = Math.max(20, Math.round(Math.min(outW, outH) * 0.06));
    ctx.filter = `blur(${blurPx}px) brightness(0.85)`;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return;
  }
  // mirror — draw 8 reflected copies tiled around the image box.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outW, outH);
  const drawMirror = (dx: number, dy: number, sx: number, sy: number) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(sx, sy);
    ctx.drawImage(img, 0, 0, box.w * sx, box.h * sy);
    ctx.restore();
  };
  const { x, y, w, h } = box;
  // Left, Right, Top, Bottom
  drawMirror(x, y, -1, 1);
  drawMirror(x + w, y, -1, 1);
  // The simple approach above can leave gaps; lay an edge-color fill behind it.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = getEdgeColor(img);
  ctx.fillRect(0, 0, outW, outH);
  ctx.globalCompositeOperation = "source-over";
}

/** Render the edited poster onto an existing canvas at outW × outH. */
export function renderEditTo(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  s: EditSettings,
  outW: number,
  outH: number,
) {
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, outW, outH);

  const box = computeImageBox(img, s, outW, outH);
  drawBackground(ctx, img, box, s, outW, outH);
  ctx.drawImage(img, box.x, box.y, box.w, box.h);
}

/** Render to an offscreen canvas and return a JPEG blob. */
export async function renderEditToBlob(
  img: HTMLImageElement,
  s: EditSettings,
  outW: number,
  outH: number,
  quality = 0.88,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  renderEditTo(canvas, img, s, outW, outH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}