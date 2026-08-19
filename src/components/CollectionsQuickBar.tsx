import { useQuickBar } from "@/lib/quickbar";

export function CollectionsQuickBar() {
  const cfg = useQuickBar();
  if (!cfg.enabled) return null;
  const chips = cfg.chips.filter((c) => c.enabled);
  if (chips.length === 0) return null;

  const currentPath =
    typeof window !== "undefined" ? window.location.pathname + window.location.hash : "";

  return (
    <nav
      aria-label="Collections quick bar"
      className="border-b border-border bg-background/95 backdrop-blur"
    >
      <div className="container-page">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex items-center justify-start gap-2 py-3 sm:gap-3 md:justify-center">
            {chips.map((c) => {
              const active =
                currentPath === c.href ||
                (c.href.startsWith("/#") && currentPath.endsWith(c.href.slice(1)));
              return (
                <li key={c.id} className="shrink-0">
                  <a
                    href={c.href}
                    className={[
                      "inline-flex items-center whitespace-nowrap rounded-full border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] transition-all duration-200",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:-translate-y-0.5 hover:border-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {c.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
