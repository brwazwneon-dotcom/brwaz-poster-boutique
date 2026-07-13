import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath, signStoragePath, SIGNED_URL_TTL } from "@/lib/storage-url";

/**
 * Auto Image Optimization Pipeline.
 *
 * Given a source image (File OR URL) belonging to `sourceTable`/`sourceId`,
 * generate WebP display variants: thumb (400px), medium (900px), large (1600px).
 * The ORIGINAL is never modified or deleted.
 */

export type Variant = "thumb" | "medium" | "large";

const SPECS: Record<Variant, { maxDim: number; quality: number }> = {
  thumb: { maxDim: 400, quality: 0.82 },
  medium: { maxDim: 900, quality: 0.85 },
  large: { maxDim: 1600, quality: 0.9 },
};

const DEFAULT_BUCKET = "posters";

async function loadBitmap(source: Blob | string): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof source === "string") {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = source;
    });
  }
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(source);
    } catch {
      /* fallthrough */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function drawTo(
  bmp: HTMLImageElement | ImageBitmap,
  maxDim: number,
): { canvas: HTMLCanvasElement; w: number; h: number } {
  const srcW = "naturalWidth" in bmp ? (bmp as HTMLImageElement).naturalWidth : (bmp as ImageBitmap).width;
  const srcH = "naturalHeight" in bmp ? (bmp as HTMLImageElement).naturalHeight : (bmp as ImageBitmap).height;
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  return { canvas, w, h };
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

/** Build one variant Blob. */
async function makeVariant(
  bmp: HTMLImageElement | ImageBitmap,
  variant: Variant,
): Promise<{ blob: Blob; width: number; height: number; format: string }> {
  const spec = SPECS[variant];
  const { canvas, w, h } = drawTo(bmp, spec.maxDim);
  // Try WebP; fall back to JPEG if unsupported.
  try {
    const blob = await canvasToBlob(canvas, "image/webp", spec.quality);
    if (blob.type === "image/webp") return { blob, width: w, height: h, format: "webp" };
  } catch {
    /* fallthrough */
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", spec.quality);
  return { blob: jpeg, width: w, height: h, format: "jpeg" };
}

function variantPathFor(originalPath: string, variant: Variant, format: string): string {
  const dot = originalPath.lastIndexOf(".");
  const base = dot >= 0 ? originalPath.slice(0, dot) : originalPath;
  return `variants/${variant}/${base}.${format}`;
}

/**
 * Create + upload all three display variants for one original image.
 * Records them in `image_variants`. Safe to call more than once (upsert).
 */
export async function generateVariantsFor(opts: {
  sourceTable: string;
  sourceId: string | null;
  originalUrl: string;
  bucket?: string;
  /** If provided, uses this blob instead of fetching originalUrl. */
  file?: Blob;
}): Promise<{ done: number; failed: number }> {
  const bucket = opts.bucket ?? DEFAULT_BUCKET;
  const originalPath = extractStoragePath(opts.originalUrl, bucket);
  if (!originalPath) return { done: 0, failed: 0 };

  let bmp: HTMLImageElement | ImageBitmap;
  try {
    bmp = opts.file ? await loadBitmap(opts.file) : await loadBitmap(opts.originalUrl);
  } catch {
    return { done: 0, failed: 3 };
  }

  let done = 0;
  let failed = 0;

  for (const variant of ["thumb", "medium", "large"] as Variant[]) {
    try {
      const { blob, width, height, format } = await makeVariant(bmp, variant);
      const path = variantPathFor(originalPath, variant, format);

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: blob.type, upsert: true });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("sign failed");

      const { error: dbErr } = await supabase.from("image_variants").upsert(
        {
          source_table: opts.sourceTable,
          source_id: opts.sourceId,
          original_path: originalPath,
          bucket,
          variant,
          variant_path: path,
          url: signed.signedUrl,
          width,
          height,
          size_bytes: blob.size,
          format,
          status: "done",
          error: null,
        },
        { onConflict: "source_table,source_id,original_path,variant" },
      );
      if (dbErr) throw dbErr;
      done += 1;
    } catch (err) {
      failed += 1;
      await supabase.from("image_variants").upsert(
        {
          source_table: opts.sourceTable,
          source_id: opts.sourceId,
          original_path: originalPath,
          bucket,
          variant,
          status: "failed",
          error: String((err as Error)?.message ?? err).slice(0, 500),
        },
        { onConflict: "source_table,source_id,original_path,variant" },
      );
    }
  }

  // If the variant Blob turned out heavier than the original, note it (heavy warning).
  return { done, failed };
}

/** Refresh a signed variant URL if it expired. */
export async function refreshVariantUrl(id: string, bucket: string, path: string): Promise<string | null> {
  try {
    const url = await signStoragePath(bucket, path);
    await supabase.from("image_variants").update({ url }).eq("id", id);
    return url;
  } catch {
    return null;
  }
}