import { Check } from "lucide-react";

type Card = {
  title: string;
  tag?: string;
  features: string[];
  highlight?: boolean;
};

const CARDS: Card[] = [
  {
    title: "High Quality PVC Frame",
    tag: "Bestseller",
    highlight: true,
    features: [
      "Premium PVC Frame",
      "Available in Black & White",
      "Modern framed appearance",
      "Glass-like finish",
      "Scratch resistant",
    ],
  },
  {
    title: "Wooden Portrait",
    tag: "Premium",
    features: [
      "Printed directly on premium wood",
      "No glass",
      "No frame color selection",
      "Elegant matte finish",
      "Long-lasting print",
    ],
  },
  {
    title: "Photo Printing",
    tag: "FUJIFILM",
    features: [
      "Premium FUJIFILM printing",
      "Multiple print sizes",
      "High color accuracy",
      "Minimum order 20 photos",
    ],
  },
];

export function FrameComparison() {
  return (
    <section className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Compare</div>
      <h2 className="text-display text-3xl sm:text-4xl mt-2">Choose your finish</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every BRWAZWNEON design ships in your choice of premium finish. Pick the one that fits your
        room.
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
