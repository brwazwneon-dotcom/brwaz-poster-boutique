import { fmtNum, fmtPct } from "./ui";

export type FunnelBarStep = {
  key: string;
  label: string;
  count: number | null;
  pctOfFirst?: number | null;
  dropFromPrevious?: number | null;
  note?: string;
};

/**
 * A vertical funnel. Steps that can't be measured for the period render as
 * "Not tracked" with the reason — never as a zero-width bar that looks like a
 * real drop to 0.
 */
export function FunnelBars({ steps }: { steps: FunnelBarStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count ?? 0));
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.key}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {s.count === null ? (
                <span className="text-xs">Not tracked</span>
              ) : (
                <>
                  <strong className="text-foreground">{fmtNum(s.count)}</strong>
                  {s.pctOfFirst !== null && s.pctOfFirst !== undefined
                    ? ` · ${fmtPct(s.pctOfFirst)} of start`
                    : ""}
                  {s.dropFromPrevious !== null && s.dropFromPrevious !== undefined ? (
                    <span className="ml-2 text-xs text-red-500">
                      −{fmtPct(s.dropFromPrevious)} drop-off
                    </span>
                  ) : null}
                </>
              )}
            </span>
          </div>
          <div
            className="h-5 rounded-sm bg-accent"
            role="img"
            aria-label={`${s.label}: ${s.count ?? "not tracked"}`}
          >
            {s.count !== null && (
              <div
                className="h-5 rounded-sm bg-primary/70"
                style={{ width: `${Math.max(s.count > 0 ? 1.5 : 0, (s.count / max) * 100)}%` }}
              />
            )}
          </div>
          {s.note ? <p className="mt-0.5 text-[11px] text-muted-foreground">{s.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
