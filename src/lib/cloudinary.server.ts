import { v2 as cloudinary } from "cloudinary";

// Public object storage for poster/customer-photo images — replaces Vercel
// Blob (see image-upload.functions.ts), which suspends the whole storefront's
// images once a Hobby-plan account crosses its free Advanced-Requests/storage
// cap. Cloudinary's free plan (25 credits/month = storage+bandwidth+
// transformations combined) needs no card on file, so it doesn't have the
// same "silently 403s everything until you pay" failure mode.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

// Cloudinary delivery URLs look like:
//   https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
// public_id is what deletion (and everything else in the admin API) keys on,
// not the URL — this recovers it from a URL we already have stored in the DB
// so callers (deletePoster, deletePosterImage, deleteMediaAssetAdmin) don't
// need to separately track public_id alongside image_url.
export function extractCloudinaryPublicId(url: string): string | null {
  const m = /\/upload\/(?:[^/]+\/)*?v\d+\/(.+)\.[a-zA-Z0-9]+$/.exec(url);
  return m ? m[1] : null;
}

export async function deleteCloudinaryAsset(url: string): Promise<void> {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch(() => {});
}
