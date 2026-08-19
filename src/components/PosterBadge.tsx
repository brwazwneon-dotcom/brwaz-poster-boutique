import { badgeLabel } from "@/lib/poster-badges";
import { cn } from "@/lib/utils";

export function PosterBadge({ badge, className }: { badge?: string | null; className?: string }) {
  const label = badgeLabel(badge);
  if (!label) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-2 top-2 z-10 rounded-sm bg-primary px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-primary-foreground shadow",
        className,
      )}
    >
      {label}
    </span>
  );
}
