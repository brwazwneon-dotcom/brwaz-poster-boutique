import { uploadCustomerPhoto } from "@/lib/image-upload.functions";

const MAX_SIDE = 1600;
const MAX_RAW_BYTES = 3 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image"));
    reader.readAsDataURL(file);
  });
}

// Shrinks a phone screenshot so the upload stays small (server requests are
// limited to a few MB). Falls back to the original when the browser can't
// decode the format (e.g. HEIC) and it is small enough to send as is.
async function toUploadableDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    if (file.size > MAX_RAW_BYTES) {
      throw new Error("Payment screenshot is too large — please upload a smaller image");
    }
    return readAsDataUrl(file);
  }
}

/** Uploads the customer's payment screenshot and returns its public URL. */
export async function uploadPaymentProof(file: File): Promise<string> {
  const dataUrl = await toUploadableDataUrl(file);
  const uploaded = await uploadCustomerPhoto({
    data: { dataUrl, filename: "payment-proof.jpg", folder: "payment-proofs" },
  });
  return uploaded.url;
}
