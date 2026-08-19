import { useTranslation } from "react-i18next";

type Variant = "pvc" | "wood" | "photo" | "all";

export function ProductInfoSections({ variant = "all" }: { variant?: Variant }) {
  const { t } = useTranslation();
  const showPvc = variant === "all" || variant === "pvc";
  const showWood = variant === "all" || variant === "wood";
  const showPhoto = variant === "all" || variant === "photo";

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-14 sm:py-20">
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {t("productInfo.eyebrow")}
          </p>
          <h2 className="text-display mt-3 text-4xl sm:text-5xl">{t("productInfo.title")}</h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
          {showPvc && (
            <MaterialCard
              tag={t("productInfo.pvcTag")}
              title={t("productInfo.pvcTitle")}
              intro={t("productInfo.pvcIntro")}
              features={[
                t("productInfo.pvcFeature1"),
                t("productInfo.pvcFeature2"),
                t("productInfo.pvcFeature3"),
                t("productInfo.pvcFeature4"),
                t("productInfo.pvcFeature5"),
                t("productInfo.pvcFeature6"),
                t("productInfo.pvcFeature7"),
                t("productInfo.pvcFeature8"),
                t("productInfo.pvcFeature9"),
              ]}
            />
          )}
          {showWood && (
            <MaterialCard
              tag={t("productInfo.woodTag")}
              title={t("productInfo.woodTitle")}
              intro={t("productInfo.woodIntro")}
              features={[
                t("productInfo.woodFeature1"),
                t("productInfo.woodFeature2"),
                t("productInfo.woodFeature3"),
                t("productInfo.woodFeature4"),
                t("productInfo.woodFeature5"),
                t("productInfo.woodFeature6"),
                t("productInfo.woodFeature7"),
              ]}
            />
          )}
          {showPhoto && (
            <MaterialCard
              tag={t("productInfo.photoTag")}
              title={t("productInfo.photoTitle")}
              intro={t("productInfo.photoIntro")}
              features={[
                t("productInfo.photoFeature1"),
                t("productInfo.photoFeature2"),
                t("productInfo.photoFeature3"),
                t("productInfo.photoFeature4"),
                t("productInfo.photoFeature5"),
              ]}
            />
          )}
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-2">
          <InfoBlock title={t("productInfo.returnTitle")}>
            <p>{t("productInfo.returnCustomMade")}</p>
            <p className="mt-3">{t("productInfo.returnAcceptedOnly")}</p>
            <ul className="mt-3 space-y-1.5">
              <li className="flex gap-2">
                <span className="text-foreground">•</span> {t("productInfo.returnWrongItem")}
              </li>
              <li className="flex gap-2">
                <span className="text-foreground">•</span> {t("productInfo.returnDamaged")}
              </li>
              <li className="flex gap-2">
                <span className="text-foreground">•</span> {t("productInfo.returnDefect")}
              </li>
            </ul>
            <p className="mt-3">{t("productInfo.returnContact")}</p>
          </InfoBlock>
          <InfoBlock title={t("productInfo.copyrightTitle")}>
            <p>{t("productInfo.copyrightText1")}</p>
            <p className="mt-3">{t("productInfo.copyrightText2")}</p>
          </InfoBlock>
        </div>
      </div>
    </section>
  );
}

function MaterialCard({
  tag,
  title,
  intro,
  features,
}: {
  tag: string;
  title: string;
  intro: string;
  features: string[];
}) {
  return (
    <div className="bg-background p-8">
      <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">{tag}</div>
      <h3 className="text-display mt-3 text-3xl">{title}</h3>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{intro}</p>
      <ul className="mt-5 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-[2px] text-foreground">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-background p-8">
      <h3 className="text-display text-2xl sm:text-3xl">{title}</h3>
      <div className="mt-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
