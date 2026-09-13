-- Adds columns for a responsive, multi-format banner image set (WebP
-- required, AVIF best-effort) so the storefront can serve an
-- appropriately-sized, modern-format image per device instead of one large
-- JPEG to every visitor. Additive only — image_url keeps working exactly
-- as before as the universal <img src> fallback for browsers/situations
-- that don't use the srcset.
alter table hero_banners
  add column if not exists webp_srcset text,
  add column if not exists avif_srcset text;

alter table slider_images
  add column if not exists webp_srcset text,
  add column if not exists avif_srcset text;
