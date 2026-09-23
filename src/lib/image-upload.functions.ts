import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { cloudinary, deleteCloudinaryAsset } from "@/lib/cloudinary.server";

// Public object storage for poster images. Was Vercel Blob (before that,
// Supabase Storage — src/lib/storage-url.ts's uploadAndSign) until the
// Vercel Blob store's Hobby-plan billing went inactive and started 403ing
// every image on the storefront with no way to pay it off on Hobby. Now
// Cloudinary, whose free plan needs no card on file. Client sends the
// already-optimized image as a data: URL (same convention already used by
// photo-ai.functions.ts), so this never needs a multipart/form-data route
// — Cloudinary's upload API accepts a data: URI directly as `file`.
export const uploadPosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { dataUrl: string; filename: string })
  .handler(async ({ data }) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error("Image too large (max 10MB after optimization)");
    }
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
    const publicId = `posters/${crypto.randomUUID()}-${safeName}`;
    const result = await cloudinary.uploader.upload(data.dataUrl, {
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
    });
    return { url: result.secure_url };
  });

// Public — customer-submitted order photos (4x6 printing, photo printing,
// custom design). No admin auth: checkout is anonymous, same as the old
// Supabase Storage buckets these replace ("photo-4x6", "customer-photos",
// "custom-designs" all allowed public inserts). Kept to a stricter size
// cap than the admin upload since these are unmoderated at upload time.
export const uploadCustomerPhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { dataUrl: string; filename: string; folder: string })
  .handler(async ({ data }) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const [, mime, base64] = match;
    if (!mime.startsWith("image/")) throw new Error("Only images are allowed");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error("Image too large (max 10MB)");
    }
    const folder = /^[a-z0-9_-]+$/i.test(data.folder) ? data.folder : "customer-uploads";
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
    const publicId = `${folder}/${crypto.randomUUID()}-${safeName}`;
    const result = await cloudinary.uploader.upload(data.dataUrl, {
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
    });
    return { url: result.secure_url };
  });

// Media Library — lists uploaded assets directly from Cloudinary (not
// derived from `posters`), so it also surfaces orphaned uploads (drafts
// abandoned mid-upload, replaced images) that no product currently
// references.
export const listMediaLibraryAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { cursor?: string } | undefined) ?? {})
  .handler(async ({ data }) => {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "posters/",
      max_results: 100,
      next_cursor: data.cursor,
    });
    return {
      blobs: result.resources.map(
        (r: { secure_url: string; public_id: string; bytes: number; created_at: string }) => ({
          url: r.secure_url,
          pathname: r.public_id,
          size: r.bytes,
          uploadedAt: r.created_at,
        }),
      ),
      cursor: result.next_cursor as string | undefined,
      hasMore: Boolean(result.next_cursor),
    };
  });

export const deleteMediaAssetAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { url: string }).url)
  .handler(async ({ data: url }) => {
    await deleteCloudinaryAsset(url);
    return { ok: true };
  });

// Recovers the real Cloudinary URL for a custom-design order item whose
// `orders.poster_image` isn't a usable URL. Root cause (see
// OrderDetailsDrawer.tsx's ItemThumb): the custom-design checkout
// (src/routes/cart.tsx) currently stores a client-side dedup key
// ("<uuid>/<filename>") in `poster_image` instead of the real
// `uploadCustomerPhoto` result — that real URL is never written to the
// order at all. The uploaded file itself is still on Cloudinary; this
// looks it up read-only by the filename/size the order DID keep (in
// `orders.notes`'s customImageMeta), the same way `listMediaLibraryAdmin`
// above lists poster uploads. Never writes anything — the order's stored
// `poster_image` is untouched either way; the caller only uses the
// returned URL to render this one admin view.
export const resolveCustomDesignImageAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { filename: string; fileSize?: number | null })
  .handler(async ({ data }) => {
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
    if (!safeName) return { url: null as string | null };
    try {
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: "custom-designs/",
        max_results: 200,
      });
      const candidates = (
        result.resources as Array<{ public_id: string; secure_url: string; bytes: number }>
      ).filter((r) => r.public_id.includes(safeName));
      // Two customers uploading a same-named file (e.g. "IMG_0470") is
      // plausible, and showing the WRONG customer's photo is worse than
      // showing the placeholder — only resolve when confident: the file
      // size also agrees, or the filename alone was already unambiguous.
      // Otherwise return no match rather than guess.
      const bySize =
        data.fileSize != null ? candidates.find((r) => r.bytes === data.fileSize) : undefined;
      const match = bySize ?? (candidates.length === 1 ? candidates[0] : undefined);
      return { url: match?.secure_url ?? null };
    } catch {
      // A Cloudinary hiccup here should just leave the admin's existing
      // "Image unavailable" placeholder in place, not break the drawer.
      return { url: null as string | null };
    }
  });
