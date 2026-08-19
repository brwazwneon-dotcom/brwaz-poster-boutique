import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath, signStoragePath, SIGNED_URL_TTL } from "@/lib/storage-url";

/**
 * Auto Image Optimization Pipeline.
 *
 * Given a source image (File OR URL) belonging to `sourceTable`/`sourceId`,
 * generate display variants only for the storefront: thumb (240px), small
 * (480px), medium (800px), large (1200px max). The ORIGINAL is private print
 * material and must never be used by customer-facing pages.
 * The ORIGINAL is never modified or deleted.
 */

export type Variant = "thumb" | "small" | "medium" | "large";

const SPECS: Record<
  Variant,
  { maxDim: number; quality: number; minQuality: number; targetBytes: number }
> = {
  thumb: { maxDim: 240, quality: 0.78, minQuality: 0.62, targetBytes: 40 * 1024 },
  small: { maxDim: 480, quality: 0.8, minQuality: 0.64, targetBytes: 80 * 1024 },
  medium: { maxDim: 800, quality: 0.84, minQuality: 0.68, targetBytes: 150 * 1024 },
  large: { maxDim: 1200, quality: 0.86, minQuality: 0.7, targetBytes: 250 * 1024 },
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
  const srcW =
    "naturalWidth" in bmp ? (bmp as HTMLImageElement).naturalWidth : (bmp as ImageBitmap).width;
  const srcH =
    "naturalHeight" in bmp ? (bmp as HTMLImageElement).naturalHeight : (bmp as ImageBitmap).height;
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

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), mime, quality);
  });
}

/** Build one variant Blob. */
async function makeVariant(
  bmp: HTMLImageElement | ImageBitmap,
  variant: Variant,
  mime: "image/avif" | "image/webp",
): Promise<{ blob: Blob; width: number; height: number; format: "avif" | "webp" }> {
  const spec = SPECS[variant];
  const { canvas, w, h } = drawTo(bmp, spec.maxDim);
  const format = mime === "image/avif" ? "avif" : "webp";
  let blob = await canvasToBlob(canvas, mime, spec.quality);
  if (blob.type !== mime) throw new Error(`${format} encoding unsupported`);

  let quality = spec.quality;
  while (blob.size > spec.targetBytes && quality > spec.minQuality) {
    quality = Math.max(spec.minQuality, quality - 0.06);
    blob = await canvasToBlob(canvas, mime, quality);
    if (blob.type !== mime) throw new Error(`${format} encoding unsupported`);
  }
  return { blob, width: w, height: h, format };
}

function variantPathFor(originalPath: string, variant: Variant, format: string): string {
  const dot = originalPath.lastIndexOf(".");
  const base = dot >= 0 ? originalPath.slice(0, dot) : originalPath;
  return `variants/${variant}/${format}/${base}.${format}`;
}

function variantKeyFor(variant: Variant, format: "avif" | "webp") {
  return `${variant}_${format}`;
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

  for (const variant of ["thumb", "small", "medium", "large"] as Variant[]) {
    let lastError: unknown = null;

    for (const mime of ["image/avif", "image/webp"] as const) {
      try {
        const { blob, width, height, format } = await makeVariant(bmp, variant, mime);
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
            variant: variantKeyFor(variant, format),
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
        lastError = err;
      }
    }

    if (lastError) {
      const webpKey = variantKeyFor(variant, "webp");
      const existingQuery = supabase
        .from("image_variants")
        .select("id")
        .eq("source_table", opts.sourceTable)
        .eq("original_path", originalPath)
        .eq("variant", webpKey)
        .eq("status", "done");
      const { data: existing } = await (
        opts.sourceId === null
          ? existingQuery.is("source_id", null)
          : existingQuery.eq("source_id", opts.sourceId)
      ).maybeSingle();
      if (existing) continue;

      failed += 1;
      await supabase.from("image_variants").upsert(
        {
          source_table: opts.sourceTable,
          source_id: opts.sourceId,
          original_path: originalPath,
          bucket,
          variant: webpKey,
          status: "failed",
          error: String((lastError as Error)?.message ?? lastError).slice(0, 500),
        },
        { onConflict: "source_table,source_id,original_path,variant" },
      );
    }
  }

  // If the variant Blob turned out heavier than the original, note it (heavy warning).
  return { done, failed };
}

/** Refresh a signed variant URL if it expired. */
export async function refreshVariantUrl(
  id: string,
  bucket: string,
  path: string,
): Promise<string | null> {
  try {
    const url = await signStoragePath(bucket, path);
    await supabase.from("image_variants").update({ url }).eq("id", id);
    return url;
  } catch {
    return null;
  }
}
