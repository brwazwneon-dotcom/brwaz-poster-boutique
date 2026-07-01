type Variant = "pvc" | "wood" | "photo" | "all";

export function ProductInfoSections({ variant = "all" }: { variant?: Variant }) {
  const showPvc = variant === "all" || variant === "pvc";
  const showWood = variant === "all" || variant === "wood";
  const showPhoto = variant === "all" || variant === "photo";

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-14 sm:py-20">
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            Crafted for your walls
          </p>
          <h2 className="text-display mt-3 text-4xl sm:text-5xl">Premium Materials</h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
          {showPvc && (
            <MaterialCard
              tag="Frames"
              title="PVC Frame"
              intro="Our Premium PVC Frames are manufactured using high-quality durable PVC and printed on original FujiFilm Chemical Photo Paper using professional photo lab technology."
              features={[
                "Premium High-Quality PVC Frame",
                "Original FujiFilm Chemical Photo Paper",
                "Sharp Ultra-HD Details",
                "Rich & Accurate Colors",
                "Fade Resistant",
                "Long-Lasting Quality",
                "Professional Laboratory Printing",
                "Elegant Modern Finish",
                "Built to Last for Years",
              ]}
            />
          )}
          {showWood && (
            <MaterialCard
              tag="Wood"
              title="Wooden Portrait"
              intro="Our Wooden Portraits are printed directly on premium high-density wood using professional printing technology."
              features={[
                "Premium Wooden Board",
                "High-Definition Printing",
                "Rich & Vibrant Colors",
                "Matte Elegant Finish",
                "Scratch Resistant",
                "Long-Lasting Quality",
                "Premium Craftsmanship",
              ]}
            />
          )}
          {showPhoto && (
            <MaterialCard
              tag="Prints"
              title="Photo Printing"
              intro="Our photo prints are produced on Original FujiFilm Chemical Photo Paper using professional laboratory printing to ensure outstanding image quality and color accuracy."
              features={[
                "Original FujiFilm Chemical Photo Paper",
                "Professional Laboratory Printing",
                "Sharp True-to-Life Detail",
                "Accurate Color Reproduction",
                "Archival-Grade Quality",
              ]}
            />
          )}
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-2">
          <InfoBlock title="Return & Exchange Policy">
            <p>Every order is custom-made especially for you.</p>
            <p className="mt-3">Returns or exchanges are accepted only if:</p>
            <ul className="mt-3 space-y-1.5">
              <li className="flex gap-2"><span className="text-foreground">•</span> The wrong item was delivered.</li>
              <li className="flex gap-2"><span className="text-foreground">•</span> The product arrived damaged or broken.</li>
              <li className="flex gap-2"><span className="text-foreground">•</span> There is a manufacturing or printing defect.</li>
            </ul>
            <p className="mt-3">
              Please contact us within 48 hours of receiving your order and send clear photos of the issue so our support team can assist you.
            </p>
          </InfoBlock>
          <InfoBlock title="Copyright & Credits">
            <p>
              All movie, TV series, anime, football club, player names, logos, characters, trademarks, and artwork copyrights belong to their respective owners.
            </p>
            <p className="mt-3">
              BRWAZWNEON creates premium custom wall frames and decorative posters for personal use and fan art appreciation only.
            </p>
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