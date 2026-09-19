import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { PhotoPrintLine } from "@/lib/cart";

// Small Cloudinary thumbnail instead of the full-size upload.
function thumbUrl(url: string): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1 || !url.includes("res.cloudinary.com")) return url;
  return `${url.slice(0, at + marker.length)}f_auto,q_auto,w_160,h_160,c_fill/${url.slice(at + marker.length)}`;
}

/** The photo-printing order shown in the cart, next to any framed posters. */
export function PhotoPrintCartCard({
  line,
  onRemove,
}: {
  line: PhotoPrintLine;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const more = line.photoCount - line.thumbs.length;

  return (
    <div className="rounded-sm border border-primary/40 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
            {t("photo4x6.cartTitle")}
          </div>
          <div className="mt-1 font-semibold">
            {line.label} · {t("photo4x6.cartPhotos", { n: line.photoCount })}
          </div>
        </div>
        <div className="text-end">
          <div className="text-display text-2xl">
            {line.price} <span className="text-sm text-muted-foreground">{t("egp")}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {line.thumbs.map((src, index) => (
          <img
            key={`${src}-${index}`}
            src={thumbUrl(src)}
            alt=""
            loading="lazy"
            decoding="async"
            width={56}
            height={56}
            className="h-14 w-14 rounded-sm border border-border object-cover"
          />
        ))}
        {more > 0 && (
          <span className="flex h-14 w-14 items-center justify-center rounded-sm border border-border bg-background text-xs text-muted-foreground">
            +{more}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{t("photo4x6.cartReplaceNote")}</span>
        <span className="flex items-center gap-4">
          <Link to="/photo-printing" className="uppercase tracking-widest hover:text-foreground">
            {t("common.replace")}
          </Link>
          <button
            type="button"
            onClick={onRemove}
            className="uppercase tracking-widest hover:text-destructive"
          >
            {t("common.remove")}
          </button>
        </span>
      </div>
    </div>
  );
}
