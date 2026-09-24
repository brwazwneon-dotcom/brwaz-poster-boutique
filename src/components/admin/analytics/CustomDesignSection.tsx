import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsCustomDesign } from "@/lib/analytics-center.functions";
import type { RangeInput } from "@/lib/analytics-center.types";
import { FunnelBars, type FunnelBarStep } from "./FunnelBars";
import {
  ErrorState,
  Kpi,
  Limitations,
  SectionTitle,
  fmtEgp,
  fmtNum,
  periodLabel,
  useAsync,
} from "./ui";

export function CustomDesignSection({ input }: { input: RangeInput }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsCustomDesign({ data: input }),
    [input.range, input.from, input.to],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={4} />;

  const first = data.steps.find((s) => s.count !== null)?.count ?? 0;
  let prev: number | null = null;
  const steps: FunnelBarStep[] = data.steps.map((s) => {
    const step: FunnelBarStep = {
      key: s.key,
      label: s.label,
      count: s.count,
      pctOfFirst: s.count !== null && first > 0 ? s.count / first : null,
      dropFromPrevious:
        s.count !== null && prev !== null && prev > 0 ? Math.max(0, 1 - s.count / prev) : null,
      note: s.note,
    };
    if (s.count !== null) prev = s.count;
    return step;
  });

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">{periodLabel(data.period)}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Custom design orders (period)" value={fmtNum(data.purchases.checkouts)} />
        <Kpi label="Custom design items" value={fmtNum(data.purchases.items)} />
        <Kpi label="Item revenue (period)" value={fmtEgp(data.purchases.revenue)} />
        <Kpi
          label="All-time custom design orders"
          value={fmtNum(data.allTime.checkouts)}
          sub={
            <span className="text-xs text-muted-foreground">{fmtEgp(data.allTime.revenue)}</span>
          }
        />
      </div>
      <SectionTitle>Custom design funnel</SectionTitle>
      <FunnelBars steps={steps} />
      <Limitations items={data.notes} />
    </div>
  );
}

export default CustomDesignSection;
