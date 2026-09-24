import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsFunnel } from "@/lib/analytics-center.functions";
import type { RangeInput, TouchModel } from "@/lib/analytics-center.types";
import { FunnelBars } from "./FunnelBars";
import {
  ErrorState,
  Kpi,
  Limitations,
  Notice,
  NotConnected,
  SectionTitle,
  fmtNum,
  periodLabel,
  useAsync,
} from "./ui";

export function FunnelSection({ input, model }: { input: RangeInput; model: TouchModel }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsFunnel({ data: { ...input, model } }),
    [input.range, input.from, input.to, model],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={4} />;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">{periodLabel(data.period)}</p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi
          label="Paid sessions (UTM-tagged)"
          value={fmtNum(data.paidSessions)}
          hint="Sessions whose UTM medium marks them as paid traffic"
        />
        <div className="rounded-sm border border-dashed border-border p-4">
          <div className="text-2xl font-semibold text-muted-foreground">—</div>
          <div className="mt-1 text-xs text-muted-foreground">Ad clicks</div>
          <div className="mt-1">
            <NotConnected>Not connected — needs ad-platform APIs</NotConnected>
          </div>
        </div>
      </div>

      <SectionTitle>Visit → purchase</SectionTitle>
      <FunnelBars steps={data.steps} />
      <div className="mt-4">
        <Notice>
          Drop-off is measured against the previous step that could be measured. Sessions are
          counted once per step; Purchase counts checkouts from orders.
        </Notice>
      </div>
      <Limitations items={data.limitations} />
    </div>
  );
}

export default FunnelSection;
