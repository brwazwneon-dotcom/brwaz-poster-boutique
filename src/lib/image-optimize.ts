/**
 * Client-side image optimization for poster uploads.
 * - Resizes the long edge down to maxDim (default 2000px)
 * - Re-encodes as JPEG at the given quality (default 0.85)
 * - Leaves small images untouched if already smaller than the target
 * Returns a new File preserving the original base name.
 */
export async function optimizeImage(
  file: File,
  opts: { maxDim?: number; quality?: number; mime?: string } = {},
): Promise<File> {
  const maxDim = opts.maxDim ?? 2000;
  const quality = opts.quality ?? 0.85;
  const mime = opts.mime ?? "image/jpeg";

  // Skip optimization for non-raster types we can't safely re-encode.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, quality),
  );
  if (!blob) return file;

  // Only use the optimized version if it's actually smaller; otherwise keep original.
  if (blob.size >= file.size && scale === 1) return file;

  const base = file.name.replace(/\.[^.]+$/, "");
  const ext = mime === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
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