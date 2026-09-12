import { createServerFn } from "@tanstack/react-start";
import { put } from "@vercel/blob";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";

// Replaces the old Supabase Storage upload (src/lib/storage-url.ts's
// uploadAndSign, bucket "posters") with Vercel Blob — same role (public
// object storage for poster images), different backend. Client sends the
// already-optimized image as a data: URL (same convention already used
// by photo-ai.functions.ts for photo enhancement), so this function
// never needs a separate multipart/form-data route.
export const uploadPosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { dataUrl: string; filename: string })
  .handler(async ({ data }) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 12 * 1024 * 1024) {
      throw new Error("Image too large (max 12MB after optimization)");
    }
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `posters/${crypto.randomUUID()}-${safeName}`;
    const blob = await put(path, buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  });
