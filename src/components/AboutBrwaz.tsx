import { useInView } from "@/hooks/use-in-view";

const GOLD = "#c9a24a";

const CLIENTS = [
  { name: "Arab Academy for Science & Technology", kind: "University" },
  { name: "Pharos University", kind: "University" },
  { name: "Alexandria University — Faculty of Engineering", kind: "University" },
  { name: "Faculty of Fine Arts", kind: "Academy" },
  { name: "Boutique Hospitality Group", kind: "Hospitality" },
  { name: "Signature Restaurants", kind: "Hospitality" },
];

export function AboutBrwaz() {
  const [ref, visible] = useInView<HTMLElement>({ rootMargin: "0px" });

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden border-t border-border bg-black text-white"
    >
      {/* Ambient depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1000px 500px at 15% 0%, rgba(201,162,74,0.10), transparent 60%), radial-gradient(900px 500px at 100% 100%, rgba(201,162,74,0.06), transparent 60%), linear-gradient(180deg, #000 0%, #050505 60%, #000 100%)",
        }}
      />
      {/* Subtle grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      <div className="container-page py-24 sm:py-32">
        <div className="grid gap-16 md:grid-cols-[1.1fr_1fr] md:gap-20">
          {/* Left — story */}
          <div
            className={`transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
          >
            <div className="mb-6 flex items-center gap-3">
              <span
                className="h-px w-10"
                style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }}
              />
              <span
                className="text-[10px] font-medium uppercase tracking-[0.55em]"
                style={{ color: GOLD }}
              >
                About · Since 2000
              </span>
            </div>

            <h2 className="text-display text-4xl leading-[1.05] sm:text-6xl">
              A Quiet Legacy of Framing.
            </h2>

            <p className="mt-6 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
              For over <span className="font-semibold" style={{ color: GOLD }}>25 years</span>,
              BRWAZWNEON has been shaping walls across Egypt — one frame at a time.
              From private homes to universities and celebrated restaurants, our work
              lives quietly in the spaces that matter.
            </p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/50 sm:text-base">
              We believe a great frame is never noticed first — it holds the moment,
              the memory, the artwork. That obsession with restraint is what our
              partners have trusted us with for a quarter of a century.
            </p>

            {/* Timeline chips */}
            <div className="mt-10 flex flex-wrap gap-3">
              <MilestoneChip label="Est. 2000" />
              <MilestoneChip label="7M+ Prints" />
              <MilestoneChip label="Made in Egypt" />
              <MilestoneChip label="Handcrafted" />
            </div>
          </div>

          {/* Right — trusted by */}
          <div
            className={`transition-all delay-200 duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
          >
            <div className="rounded-md border border-white/10 bg-white/[0.02] p-8 backdrop-blur-md sm:p-10">
              <div className="mb-6 flex items-center gap-3">
                <span style={{ color: GOLD }}>✦</span>
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.4em]"
                  style={{ color: GOLD }}
                >
                  Trusted By
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <ul className="divide-y divide-white/10">
                {CLIENTS.map((c) => (
                  <li
                    key={c.name}
                    className="group flex items-center gap-4 py-4 transition-colors hover:bg-white/[0.02]"
                  >
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/60"
                      style={{ boxShadow: "inset 0 0 15px rgba(201,162,74,0.08)" }}
                    >
                      <span
                        className="text-display text-sm"
                        style={{ color: GOLD }}
                      >
                        {c.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white/85 sm:text-sm">
                        {c.name}
                      </div>
                      <div className="text-[9px] uppercase tracking-[0.35em] text-white/40">
                        {c.kind}
                      </div>
                    </div>
                    <span
                      className="h-px w-6 transition-all duration-500 group-hover:w-12"
                      style={{ background: `linear-gradient(to right, ${GOLD}, transparent)` }}
                    />
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-center text-[10px] uppercase tracking-[0.4em] text-white/40">
                …and dozens more studios, cafés & residences
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MilestoneChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.3em] text-white/70 backdrop-blur-md"
    >
      <span style={{ color: GOLD }}>◆</span>
      {label}
    </span>
  );
}
