import { useTranslation } from "react-i18next";
import {
  PHOTO_VOLUME_TIERS,
  photoUnitPrice,
  type LoosePhotoSize,
} from "@/lib/photo-volume-pricing";

type SizeInfo = { key: LoosePhotoSize; label: string };

/**
 * "Print more, pay less" offer cards for the per-photo sizes. One card per
 * size; each tier is a button that selects that size and the quantity that
 * unlocks it. The tier the customer is currently getting is highlighted.
 */
export function PhotoVolumeOffers({
  sizes,
  basePrices,
  activeSize,
  activeQty,
  minQty,
  onPick,
}: {
  sizes: SizeInfo[];
  basePrices: Record<LoosePhotoSize, number>;
  /** Selected size, or null when the 4x6 bundles are selected. */
  activeSize: LoosePhotoSize | null;
  /** Photos currently in the order (only meaningful when activeSize is set). */
  activeQty: number;
  /** Fewest photos that can be ordered in these sizes. */
  minQty: number;
  onPick: (size: LoosePhotoSize, qty: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {t("photo4x6.offersEyebrow")}
          </p>
          <h3 className="text-display mt-2 text-2xl sm:text-3xl">{t("photo4x6.offersTitle")}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{t("photo4x6.offersSubtitle")}</p>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-sm border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
        <span aria-hidden="true" className="text-lg leading-none">
          ⓘ
        </span>
        <p className="leading-relaxed">
          <span className="font-semibold">{t("photo4x6.minNoticeTitle", { min: minQty })}</span>{" "}
          <span className="text-muted-foreground">{t("photo4x6.minNoticeBody")}</span>
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {sizes.map((size) => {
          const base = basePrices[size.key];
          const isActiveSize = activeSize === size.key;
          const currentPrice = isActiveSize ? photoUnitPrice(size.key, activeQty, base) : base;
          return (
            <div
              key={size.key}
              className={`flex flex-col rounded-sm border bg-card p-5 transition ${isActiveSize ? "border-primary" : "border-border"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-display text-2xl">{size.label}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("photo4x6.offerRegular")}: {base} {t("egp")}
                </span>
              </div>

              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {PHOTO_VOLUME_TIERS[size.key]
                  .filter((tier) => tier.price < base)
                  .map((tier) => {
                    const applied = isActiveSize && currentPrice === tier.price;
                    const percent = Math.round(((base - tier.price) / base) * 100);
                    return (
                      <li key={tier.minQty}>
                        <button
                          type="button"
                          onClick={() => onPick(size.key, tier.minQty)}
                          className={`flex w-full items-center justify-between gap-3 rounded-sm border px-3 py-2.5 text-start transition ${applied ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/60"}`}
                        >
                          <span className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest opacity-70">
                              {applied
                                ? t("photo4x6.offerApplied")
                                : t("photo4x6.offerTierLabel", { qty: tier.minQty })}
                            </span>
                            <span className="text-display text-2xl leading-none">
                              {tier.price}{" "}
                              <span className="text-xs font-normal uppercase tracking-widest">
                                {t("photo4x6.offerPerPhoto")}
                              </span>
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${applied ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}
                          >
                            {t("photo4x6.offerSave", { percent })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
