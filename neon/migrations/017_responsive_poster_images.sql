-- Same responsive-image pattern as migration 015 (hero_banners/slider_images),
-- applied to the actual product catalog. Every product card and mockup
-- preview currently ships the full original poster image (upload-quality,
-- sometimes multi-MB) to a ~200-300px grid slot — this is the single
-- biggest image-weight problem on the site. The frontend (FramePreview.tsx,
-- SafeImage.tsx, public-images.ts's ResponsivePosterImage type) already
-- has full <picture>/srcset support wired and waiting; only the data was
-- missing. Additive only — image_url keeps working as the fallback.
alter table posters
  add column if not exists webp_srcset text,
  add column if not exists avif_srcset text;
