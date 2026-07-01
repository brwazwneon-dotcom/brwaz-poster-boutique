import {
  Star,
  Frame,
  Camera,
  Palette,
  Truck,
  Eye,
  Heart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Card = { icon: LucideIcon; title: string; body: string };

const CARDS: Card[] = [
  { icon: Star, title: "Over 7 Million Photos Printed", body: "A milestone earned one memory at a time." },
  { icon: Frame, title: "Premium PVC Frames", body: "High-quality PVC with a hand-finished feel." },
  { icon: Camera, title: "Original FujiFilm Photo Paper", body: "Real chemical photo paper — sharp, rich, lasting." },
  { icon: Palette, title: "Professional Designer Included", body: "Every order is reviewed and refined before printing." },
  { icon: Truck, title: "Cash On Delivery — Egypt Wide", body: "Pay only when your order arrives at your door." },
  { icon: Eye, title: "Preview Before Printing", body: "See exactly how your frame will look — no surprises." },
  { icon: Heart, title: "Made With Care In Egypt", body: "Designed, printed and framed locally with pride." },
];

export function TrustedQuality({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16 sm:py-20">
        <div className="mb-10 text-center">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {subtitle ?? "Why BRWAZWNEON"}
          </p>
          <h2 className="text-display mt-3 text-4xl sm:text-5xl">
            {title ?? "Trusted Quality"}
          </h2>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="group relative flex flex-col gap-3 bg-background p-6 transition duration-300 hover:bg-card sm:p-7"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-border bg-card text-foreground transition duration-300 group-hover:border-foreground group-hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
                {title}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}