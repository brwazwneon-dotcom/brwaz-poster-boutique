import { createFileRoute } from "@tanstack/react-router";
import { whatsappLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "Special Offers — BRWAZWNEON" },
      { name: "description", content: "Bundle deals on framed posters. 6 frames 20x30 for 790 EGP, 4 frames 30x40 for 890 EGP." },
      { property: "og:title", content: "Special Offers — BRWAZWNEON" },
    ],
  }),
  component: OffersPage,
});

const OFFERS = [
  {
    title: "6 Frames",
    size: "20 × 30 cm",
    price: 790,
    desc: "Build a full gallery wall. Pick any 6 designs, any categories.",
  },
  {
    title: "4 Frames",
    size: "30 × 40 cm",
    price: 890,
    desc: "Statement set of four mid-size prints. Mix and match.",
  },
];

function OffersPage() {
  return (
    <div className="container-page py-16">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Limited time
      </div>
      <h1 className="text-display mt-2 text-5xl sm:text-7xl">Special offers</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Curate a wall, save up to 40%. Order via WhatsApp and tell us which
        designs you want — we'll handle the rest.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {OFFERS.map((o) => {
          const msg = `Hi BRWAZWNEON, I'd like the bundle offer: ${o.title} ${o.size} for ${o.price} EGP.`;
          return (
            <div
              key={o.title}
              className="group relative overflow-hidden rounded-sm border border-border bg-card p-10"
            >
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Bundle
              </div>
              <div className="text-display mt-2 text-6xl">{o.title}</div>
              <div className="text-display mt-1 text-2xl text-muted-foreground">
                {o.size}
              </div>
              <div className="text-display mt-8 text-5xl">
                {o.price} <span className="text-2xl text-muted-foreground">EGP</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{o.desc}</p>
              <a
                href={whatsappLink(msg)}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex rounded-sm bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                Claim on WhatsApp
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}