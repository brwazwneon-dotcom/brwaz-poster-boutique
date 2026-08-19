/**
 * Client-side thumbnail + high-quality preview generator.
 *
 * Strategy:
 *  - THUMBNAIL: long edge ~600px, WebP (JPEG fallback), quality 0.78.
 *    Used in grids / order lists — small, sharp, fast.
 *  - PREVIEW: long edge ~1600px, WebP quality 0.9.
 *    Used in the lightbox — high quality but still much smaller than the original.
 *  - ORIGINAL: uploaded untouched to the "-originals" bucket for print quality.
 *
 * Returns a { width, height, size, mime } describe object for quality warnings.
 */

export type ImageVariant = {
  file: File;
  width: number;
  height: number;
  size: number;
  mime: string;
};

export type ImageBundle = {
  original: File;
  preview: ImageVariant;
  thumb: ImageVariant;
  info: {
    originalWidth: number;
    originalHeight: number;
    originalSize: number;
    originalMime: string;
    dpiAt10x15cm: number; // estimated DPI when printed at 10×15cm (4×6")
    printQuality: "excellent" | "good" | "acceptable" | "low";
  };
};

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

async function encodeVariant(
  bitmap: ImageBitmap | HTMLImageElement,
  maxDim: number,
  quality: number,
  baseName: string,
  label: string,
): Promise<ImageVariant> {
  const width = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const height = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  const longest = Math.max(width, height);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);

  // Try WebP first (broad support 2024+), fallback to JPEG.
  let blob = await canvasToBlob(canvas, "image/webp", quality);
  let mime = "image/webp";
  let ext = "webp";
  if (!blob || blob.size === 0) {
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    mime = "image/jpeg";
    ext = "jpg";
  }
  if (!blob) throw new Error("Failed to encode " + label);

  const file = new File([blob], `${baseName}.${label}.${ext}`, {
    type: mime,
    lastModified: Date.now(),
  });
  return { file, width: targetW, height: targetH, size: blob.size, mime };
}

function assessPrintQuality(
  w: number,
  h: number,
): {
  dpiAt10x15cm: number;
  printQuality: ImageBundle["info"]["printQuality"];
} {
  // 10×15cm ≈ 3.94×5.91 inches. Use the short edge for a conservative estimate.
  const shortEdgePx = Math.min(w, h);
  const dpi = Math.round(shortEdgePx / 3.94);
  let printQuality: ImageBundle["info"]["printQuality"];
  if (dpi >= 300) printQuality = "excellent";
  else if (dpi >= 200) printQuality = "good";
  else if (dpi >= 150) printQuality = "acceptable";
  else printQuality = "low";
  return { dpiAt10x15cm: dpi, printQuality };
}

/**
 * Build the full image bundle (original + preview + thumb) from a user-uploaded file.
 * Non-raster files (SVG, GIF) pass through — no thumbnails generated.
 */
export async function buildImageBundle(file: File): Promise<ImageBundle | null> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return null;
  }
  const bitmap = await loadBitmap(file);
  const width = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const height = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "image";

  const [preview, thumb] = await Promise.all([
    encodeVariant(bitmap, 1600, 0.9, baseName, "preview"),
    encodeVariant(bitmap, 600, 0.78, baseName, "thumb"),
  ]);

  const q = assessPrintQuality(width, height);
  return {
    original: file,
    preview,
    thumb,
    info: {
      originalWidth: width,
      originalHeight: height,
      originalSize: file.size,
      originalMime: file.type,
      dpiAt10x15cm: q.dpiAt10x15cm,
      printQuality: q.printQuality,
    },
  };
}

/** Read the dimensions of an image URL (used for backfill / quality checks). */
export async function readImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await loadBitmap(new File([blob], "probe"));
    const width = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
    const height = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
    return { width, height };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
