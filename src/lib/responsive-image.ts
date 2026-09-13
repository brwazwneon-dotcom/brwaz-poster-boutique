/**
 * Generates a responsive, multi-format image set (WebP required, AVIF
 * best-effort) from one uploaded source file — so a phone downloads a
 * ~640px image instead of the same multi-megabyte file a 2560px desktop
 * gets, without losing sharpness on large screens. Same canvas re-encode
 * approach as optimizeImage() (src/lib/image-optimize.ts), just run at
 * several widths and kept as a separate module since that one always
 * returns a single File and this always returns multiple Blobs.
 */

const RESPONSIVE_WIDTHS = [640, 1024, 1600, 2200] as const;
const WEBP_QUALITY = 0.82;
const AVIF_QUALITY = 0.75;

export type ResponsiveVariant = { width: number; blob: Blob };
export type ResponsiveImageSet = {
  webp: ResponsiveVariant[];
  avif: ResponsiveVariant[];
};

let avifSupportPromise: Promise<boolean> | null = null;

// Chrome/Edge can encode AVIF via canvas.toBlob; Safari and Firefox
// generally cannot yet. Feature-detect once per session and silently fall
// back to WebP-only elsewhere — the storefront already renders <source
// type="image/avif"> only when an avifSrcSet is actually present.
function supportsAvifEncoding(): Promise<boolean> {
  if (avifSupportPromise) return avifSupportPromise;
  avifSupportPromise = new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      canvas.toBlob((blob) => resolve(Boolean(blob && blob.size > 0)), "image/avif");
    } catch {
      resolve(false);
    }
  });
  return avifSupportPromise;
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

function naturalSize(bitmap: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return "naturalWidth" in bitmap
    ? { w: bitmap.naturalWidth, h: bitmap.naturalHeight }
    : { w: bitmap.width, h: bitmap.height };
}

function drawAtWidth(bitmap: ImageBitmap | HTMLImageElement, targetWidth: number): HTMLCanvasElement {
  const { w: naturalW, h: naturalH } = naturalSize(bitmap);
  const scale = Math.min(1, targetWidth / naturalW);
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * Skips non-raster types (SVG/GIF) the same way optimizeImage() does —
 * both return an empty set, and callers should just keep image_url as the
 * only source in that case.
 */
export async function generateResponsiveImageSet(
  file: File,
  opts: { widths?: readonly number[] } = {},
): Promise<ResponsiveImageSet> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return { webp: [], avif: [] };
  }

  const bitmap = await loadBitmap(file);
  const { w: naturalW } = naturalSize(bitmap);

  // Never upscale — only emit widths at or below the source's own
  // resolution, always including the source's native width as the
  // largest variant.
  const configured = opts.widths ?? RESPONSIVE_WIDTHS;
  const targetWidths = Array.from(
    new Set([...configured.filter((w) => w < naturalW), naturalW]),
  ).sort((a, b) => a - b);

  const canAvif = await supportsAvifEncoding();

  const webp: ResponsiveVariant[] = [];
  const avif: ResponsiveVariant[] = [];
  for (const width of targetWidths) {
    const canvas = drawAtWidth(bitmap, width);
    const webpBlob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
    if (webpBlob) webp.push({ width, blob: webpBlob });
    if (canAvif) {
      const avifBlob = await canvasToBlob(canvas, "image/avif", AVIF_QUALITY);
      if (avifBlob && avifBlob.size > 0) avif.push({ width, blob: avifBlob });
    }
  }
  return { webp, avif };
}

export function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}

/** Builds a `<img srcset>` string from uploaded variant URLs, e.g. "a.webp 640w, b.webp 1600w". */
export function buildSrcSet(variants: { width: number; url: string }[]): string {
  return variants.map((v) => `${v.url} ${v.width}w`).join(", ");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Shared by every upload flow that needs a responsive srcset (admin Homepage
 * banners/slider, Products bulk upload): generates WebP/AVIF variants from
 * `file`, uploads each via `uploadPosterImage`, and returns ready-to-store
 * srcset strings (null when a format produced no variants, e.g. SVG/GIF
 * sources or browsers that can't encode AVIF).
 */
export async function uploadResponsiveSrcSets(
  file: File,
  uploadPosterImage: (args: {
    data: { dataUrl: string; filename: string };
  }) => Promise<{ url: string }>,
): Promise<{ webp_srcset: string | null; avif_srcset: string | null }> {
  const { webp, avif } = await generateResponsiveImageSet(file);
  const base = file.name.replace(/\.[^.]+$/, "");

  const uploadVariant = async (v: ResponsiveVariant, ext: string) => {
    const variantFile = blobToFile(v.blob, `${base}-${v.width}w.${ext}`);
    const dataUrl = await fileToDataUrl(variantFile);
    const { url } = await uploadPosterImage({ data: { dataUrl, filename: variantFile.name } });
    return { width: v.width, url };
  };

  const [webpUploaded, avifUploaded] = await Promise.all([
    Promise.all(webp.map((v) => uploadVariant(v, "webp"))),
    Promise.all(avif.map((v) => uploadVariant(v, "avif"))),
  ]);

  return {
    webp_srcset: webpUploaded.length ? buildSrcSet(webpUploaded) : null,
    avif_srcset: avifUploaded.length ? buildSrcSet(avifUploaded) : null,
  };
}
