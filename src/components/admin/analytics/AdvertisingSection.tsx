import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsAdvertising } from "@/lib/analytics-center.functions";
import type { ConnectionStatus, RangeInput } from "@/lib/analytics-center.types";
import {
  ErrorState,
  Notice,
  NotConnected,
  SectionTitle,
  fmtEgp,
  fmtNum,
  periodLabel,
  useAsync,
} from "./ui";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  partial: "Partly set up",
  not_connected: "Not connected",
};
const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connected: "text-emerald-500",
  partial: "text-amber-500",
  not_connected: "text-muted-foreground",
};

const PLATFORM_METRICS = [
  "Spend",
  "Impressions",
  "Reach",
  "Clicks",
  "CTR",
  "CPC",
  "CPM",
  "Conversions",
  "Cost per order",
  "ROAS",
];

export function AdvertisingSection({ input }: { input: RangeInput }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsAdvertising({ data: input }),
    [input.range, input.from, input.to],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={3} />;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">{periodLabel(data.period)}</p>
      <Notice>
        Ad-platform figures (spend, impressions, reach, clicks, CPC, CPM, conversions, cost per
        order, ROAS) come only from the platforms' own APIs. None is connected, so none is shown or
        estimated. What <em>is</em> shown below is measured on this website: tracking status, and
        orders from UTM-tagged paid traffic.
      </Notice>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {data.platforms.map((p) => (
          <div key={p.key} className="rounded-sm border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{p.label}</h4>
              <NotConnected>Ads API not connected</NotConnected>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{p.apiNeeds}</p>

            <div className="mt-3 flex flex-wrap gap-1">
              {PLATFORM_METRICS.map((m) => (
                <span
                  key={m}
                  className="rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {m}: —
                </span>
              ))}
            </div>

            <div className="mt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Tracking on this site
            </div>
            <ul className="mt-1 space-y-1 text-xs">
              {p.tracking.map((t) => (
                <li key={t.label} className="flex flex-col">
                  <span>
                    {t.label}:{" "}
                    <strong className={STATUS_CLASS[t.status]}>{STATUS_LABEL[t.status]}</strong>
                  </span>
                  <span className="text-muted-foreground">{t.detail}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Measured from UTM-tagged paid traffic
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold tabular-nums">{fmtNum(p.paidSessions)}</div>
                <div className="text-[10px] text-muted-foreground">Sessions</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">{fmtNum(p.orders)}</div>
                <div className="text-[10px] text-muted-foreground">Orders</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">{fmtEgp(p.revenue)}</div>
                <div className="text-[10px] text-muted-foreground">Revenue</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Manually logged ad expenses</SectionTitle>
      <div className="rounded-sm border border-border p-4">
        <div className="text-2xl font-semibold tabular-nums">
          {fmtEgp(data.manualExpenses.total)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {data.manualExpenses.entries === 0
            ? "No ad expenses logged in Finance for this period"
            : `${fmtNum(data.manualExpenses.entries)} entr${data.manualExpenses.entries === 1 ? "y" : "ies"} in Finance (category "ads")`}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{data.manualExpenses.note}</p>
      </div>

      {data.blended && (
        <div className="mt-3 rounded-sm border border-border p-4">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Blended ROAS (manual)
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {data.blended.roas === null ? "—" : `${data.blended.roas.toFixed(2)}×`}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{data.blended.note}</p>
        </div>
      )}
    </div>
  );
}

export default AdvertisingSection;
