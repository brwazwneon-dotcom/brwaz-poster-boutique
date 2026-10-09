// Browser-side "save this image" helper for the admin. Cloudinary images use
// its own attachment delivery (no server of ours in the path); anything else
// is fetched as a blob, and if even that is blocked the image opens in a new
// tab so the admin can still long-press / right-click it.
import { cloudinaryDownloadUrl, safeFileStem } from "./order-invoice";

function clickAnchor(href: string, filename?: string) {
  const a = document.createElement("a");
  a.href = href;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export type DownloadResult = "started" | "opened";

export async function downloadImage(url: string, name: string): Promise<DownloadResult> {
  const stem = safeFileStem(name, "poster");
  const viaCloudinary = cloudinaryDownloadUrl(url, name);
  if (viaCloudinary) {
    clickAnchor(viaCloudinary, `${stem}.jpg`);
    return "started";
  }
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = EXT_BY_TYPE[blob.type] ?? "jpg";
    const obj = URL.createObjectURL(blob);
    clickAnchor(obj, `${stem}.${ext}`);
    setTimeout(() => URL.revokeObjectURL(obj), 30_000);
    return "started";
  } catch {
    window.open(url, "_blank", "noopener");
    return "opened";
  }
}

/** Saves a Blob (e.g. the invoice PNG) under the given file name. */
export function downloadBlob(blob: Blob, filename: string) {
  const obj = URL.createObjectURL(blob);
  clickAnchor(obj, filename);
  setTimeout(() => URL.revokeObjectURL(obj), 30_000);
}
