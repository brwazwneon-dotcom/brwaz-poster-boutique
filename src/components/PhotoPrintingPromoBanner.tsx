import { useTranslation } from "react-i18next";
import { usePhotoPrintingMediaConfig, type PhotoPrintingBanner } from "@/lib/use-settings";

// Shared with src/routes/photo-printing.tsx (which renders the same banners,
// unlinked, on the photo-printing page itself) so the admin's single
// "Photo Printing → Banner Upload" set of images can also promote the page
// from elsewhere in the storefront (e.g. the empty cart) without a second
// banner system to manage.
export function PhotoPrintingBannerRail({
  banners,
  fallbackHref,
}: {
  banners: PhotoPrintingBanner[];
  fallbackHref?: string;
}) {
  if (banners.length === 0) return null;
  return (
    <section className="border-b border-border bg-background">
      <div className="container-page py-8 sm:py-10">
        <div className="space-y-4">
          {banners.map((banner) => (
            <PhotoPrintingBannerCard key={banner.id} banner={banner} fallbackHref={fallbackHref} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function PhotoPrintingBannerCard({
  banner,
  fallbackHref,
}: {
  banner: PhotoPrintingBanner;
  fallbackHref?: string;
}) {
  const { t } = useTranslation();
  const desktop = banner.desktopImageUrl || banner.mobileImageUrl;
  const mobile = banner.mobileImageUrl || banner.desktopImageUrl;
  const image = (
    <picture>
      {mobile && <source media="(max-width: 640px)" srcSet={mobile} />}
      <img
        src={desktop}
        alt={banner.altText || banner.title || t("photoPrinting.bannerAlt")}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
        loading="lazy"
        decoding="async"
        sizes="(max-width: 640px) 100vw, min(1120px, 100vw)"
      />
    </picture>
  );
  const content = (
    <div className="group relative isolate aspect-[16/9] overflow-hidden rounded-sm border border-border bg-card shadow-[0_24px_70px_rgba(0,0,0,0.18)] sm:aspect-[21/7]">
      {image}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.34),rgba(0,0,0,0.04)_48%,rgba(255,255,255,0.08))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/35 to-transparent" />
    </div>
  );
  const href = banner.linkUrl || fallbackHref;
  if (!href) return content;
  return (
    <a href={href} className="block outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {content}
    </a>
  );
}

// Drop-in promo strip for pages other than /photo-printing itself — pulls
// the same admin-managed banners (Content → Photo Printing → Banner
// Upload) and links to the photo-printing page when a banner has no
// explicit link of its own.
export function PhotoPrintingPromoBanner({
  fallbackHref = "/photo-printing",
}: {
  fallbackHref?: string;
}) {
  const media = usePhotoPrintingMediaConfig();
  const banners = media.banners.filter(
    (banner) => banner.enabled && (banner.desktopImageUrl || banner.mobileImageUrl),
  );
  return <PhotoPrintingBannerRail banners={banners} fallbackHref={fallbackHref} />;
}
