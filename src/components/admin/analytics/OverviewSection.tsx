import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsOverviewCenter } from "@/lib/analytics-center.functions";
import type { Metrics, RangeInput } from "@/lib/analytics-center.types";
import {
  Delta,
  EmptyState,
  ErrorState,
  Kpi,
  Notice,
  SectionTitle,
  fmtDay,
  fmtEgp,
  fmtNum,
  fmtPct,
  previousLabel,
  periodLabel,
  useAsync,
} from "./ui";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 10 };

function shortDay(d: string) {
  return fmtDay(`${d}T12:00:00Z`).replace(/ \d{4}$/, "");
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export function OverviewSection({ input }: { input: RangeInput }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsOverviewCenter({ data: input }),
    [input.range, input.from, input.to],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={8} />;

  const c = data.current;
  const p = data.previous;
  const tile = (
    label: string,
    key: keyof Metrics,
    format: (n: number | null) => string = fmtNum,
    hint?: string,
    lowerIsBetter = false,
  ) => (
    <Kpi
      key={label}
      label={label}
      hint={hint}
      value={format(c[key] as number | null)}
      sub={
        <Delta
          current={c[key] as number | null}
          previous={p[key] as number | null}
          lowerIsBetter={lowerIsBetter}
          format={format}
        />
      }
    />
  );

  const series = data.series.map((s) => ({
    ...s,
    label: shortDay(s.day),
    conversion: s.visitors > 0 ? +((s.orders / s.visitors) * 100).toFixed(2) : null,
  }));
  const hasTraffic = series.some((s) => s.visitors > 0 || s.orders > 0);
  const tracked = data.notes.trackingStarted;
  const untracked = ["view_cart", "select_item", "whatsapp_click"].filter((k) => !tracked[k]);

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">
        {periodLabel(data.period)} · compared with {previousLabel(data.period)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tile("Visitors", "visitors")}
        {tile("Sessions", "sessions")}
        {tile("Page views", "pageViews")}
        {tile("Product views", "productViews")}
        {tile("Clicks", "clicks", fmtNum, "Product, category, banner, offer and WhatsApp clicks")}
        {tile(
          "Add to cart (sessions)",
          "addToCartSessions",
          fmtNum,
          "Sessions with at least one add to cart",
        )}
        {tile("Checkout started", "checkoutStarts")}
        {tile("Orders", "orders", fmtNum, "Checkouts placed (a multi-poster order counts once)")}
        {tile(
          "Revenue",
          "revenue",
          fmtEgp,
          "Same definition as the Executive Dashboard (includes cancelled)",
        )}
        {tile("Conversion rate", "conversionRate", fmtPct, "Orders ÷ visitors")}
        {tile("Average order value", "aov", fmtEgp)}
        <Kpi
          label="New / returning visitors"
          value={`${fmtNum(c.newVisitors)} / ${fmtNum(c.returningVisitors)}`}
          sub={
            <span className="text-xs text-muted-foreground">
              first-ever visit in vs before period
            </span>
          }
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Revenue excluding cancelled/returned:{" "}
          <strong className="text-foreground">{fmtEgp(c.revenueNet)}</strong>
        </span>
        <span>
          Cancelled/returned checkouts:{" "}
          <strong className="text-foreground">{fmtNum(c.cancelledOrders)}</strong>
        </span>
      </div>

      {!hasTraffic ? (
        <div className="mt-6">
          <EmptyState />
        </div>
      ) : (
        <>
          <SectionTitle>Trends</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Visitors & sessions per day">
              <ChartContainer
                className="aspect-auto h-[220px] w-full"
                config={{
                  visitors: { label: "Visitors", color: "var(--chart-1)" },
                  sessions: { label: "Sessions", color: "var(--chart-2)" },
                }}
              >
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="sessions"
                    type="monotone"
                    stroke="var(--color-sessions)"
                    fill="var(--color-sessions)"
                    fillOpacity={0.15}
                  />
                  <Area
                    dataKey="visitors"
                    type="monotone"
                    stroke="var(--color-visitors)"
                    fill="var(--color-visitors)"
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ChartContainer>
            </ChartCard>

            <ChartCard title="Revenue (EGP) per day">
              <ChartContainer
                className="aspect-auto h-[220px] w-full"
                config={{ revenue: { label: "Revenue (EGP)", color: "var(--chart-1)" } }}
              >
                <BarChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </ChartCard>

            <ChartCard title="Orders per day">
              <ChartContainer
                className="aspect-auto h-[200px] w-full"
                config={{ orders: { label: "Orders", color: "var(--chart-2)" } }}
              >
                <BarChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </ChartCard>

            <ChartCard title="Add to cart (sessions) per day">
              <ChartContainer
                className="aspect-auto h-[200px] w-full"
                config={{ addToCartSessions: { label: "Add to cart", color: "var(--chart-4)" } }}
              >
                <LineChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="addToCartSessions"
                    type="monotone"
                    stroke="var(--color-addToCartSessions)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </ChartCard>

            <ChartCard title="Conversion rate per day (orders ÷ visitors, %)">
              <ChartContainer
                className="aspect-auto h-[200px] w-full"
                config={{ conversion: { label: "Conversion %", color: "var(--chart-3)" } }}
              >
                <LineChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="conversion"
                    type="monotone"
                    stroke="var(--color-conversion)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ChartContainer>
            </ChartCard>
          </div>
        </>
      )}

      <div className="mt-6 space-y-2">
        {data.notes.devExcludedVisits > 0 && (
          <Notice>
            {fmtNum(data.notes.devExcludedVisits)} page views from{" "}
            {fmtNum(data.notes.devExcludedSessions)} sessions in this period were recorded from
            development/QA hosts and are excluded from every number here. The rows are kept in the
            database, not deleted.
          </Notice>
        )}
        {untracked.length > 0 && (
          <Notice>
            Not recorded yet, so shown as no data rather than zero:{" "}
            {untracked.map((k) => k.replace(/_/g, " ")).join(", ")}. They start counting once the
            updated storefront is live.
          </Notice>
        )}
        {!data.notes.attributionMigrationApplied && (
          <Notice tone="warn">
            The attribution database migration (024) is not applied, so first/last-touch attribution
            is unavailable.
          </Notice>
        )}
      </div>
    </div>
  );
}

export default OverviewSection;
