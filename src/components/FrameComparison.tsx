import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

type Card = {
  title: string;
  tag?: string;
  features: string[];
  highlight?: boolean;
};

export function FrameComparison() {
  const { t } = useTranslation();
  const CARDS: Card[] = [
    {
      title: t("frameComparison.pvcTitle"),
      tag: t("frameComparison.pvcTag"),
      highlight: true,
      features: [
        t("frameComparison.pvcFeature1"),
        t("frameComparison.pvcFeature2"),
        t("frameComparison.pvcFeature3"),
        t("frameComparison.pvcFeature4"),
        t("frameComparison.pvcFeature5"),
      ],
    },
    {
      title: t("frameComparison.woodTitle"),
      tag: t("frameComparison.woodTag"),
      features: [
        t("frameComparison.woodFeature1"),
        t("frameComparison.woodFeature2"),
        t("frameComparison.woodFeature3"),
        t("frameComparison.woodFeature4"),
        t("frameComparison.woodFeature5"),
      ],
    },
    {
      title: t("frameComparison.photoTitle"),
      tag: t("frameComparison.photoTag"),
      features: [
        t("frameComparison.photoFeature1"),
        t("frameComparison.photoFeature2"),
        t("frameComparison.photoFeature3"),
        t("frameComparison.photoFeature4"),
      ],
    },
  ];

  return (
    <section className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        {t("frameComparison.kicker")}
      </div>
      <h2 className="text-display text-3xl sm:text-4xl mt-2">{t("frameComparison.heading")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {t("frameComparison.description")}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <div
            key={c.title}
            className={
              "relative rounded-sm border bg-card p-6 " +
              (c.highlight ? "border-primary" : "border-border")
            }
          >
            {c.tag && (
              <span className="absolute right-4 top-4 rounded-sm bg-background/85 px-2 py-0.5 text-[9px] uppercase tracking-widest">
                {c.tag}
              </span>
            )}
            <h3 className="text-display text-2xl">{c.title}</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {c.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
