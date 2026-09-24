import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsTraffic } from "@/lib/analytics-center.functions";
import type { RangeInput, TouchModel, TrafficRow } from "@/lib/analytics-center.types";
import {
  BarList,
  EmptyState,
  ErrorState,
  Kpi,
  Notice,
  SectionTitle,
  TableWrap,
  Td,
  Th,
  fmtEgp,
  fmtNum,
  fmtPct,
  periodLabel,
  useAsync,
} from "./ui";

type GroupBy = "source" | "medium" | "campaign";

function rollUp(rows: TrafficRow[], by: GroupBy): TrafficRow[] {
  const map = new Map<string, TrafficRow>();
  for (const r of rows) {
    const key =
      by === "source"
        ? r.source
        : by === "medium"
          ? `${r.source}|${r.medium ?? ""}`
          : `${r.source}|${r.medium ?? ""}|${r.campaign ?? ""}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        ...r,
        medium: by === "source" ? null : r.medium,
        campaign: by === "campaign" ? r.campaign : null,
      });
      continue;
    }
    cur.visitors += r.visitors; // upper bound when groups merge (a visitor can appear in two)
    cur.sessions += r.sessions;
    cur.pageViews += r.pageViews;
    cur.productViews += r.productViews;
    cur.addToCart += r.addToCart;
    cur.viewCart += r.viewCart;
    cur.checkout += r.checkout;
    cur.orders += r.orders;
    cur.revenue += r.revenue;
  }
  return Array.from(map.values())
    .map((r) => ({ ...r, conversionRate: r.sessions > 0 ? r.orders / r.sessions : null }))
    .sort((a, b) => b.sessions - a.sessions || b.orders - a.orders);
}

export function TrafficSection({ input, model }: { input: RangeInput; model: TouchModel }) {
  const [by, setBy] = useState<GroupBy>("source");
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsTraffic({ data: { ...input, model } }),
    [input.range, input.from, input.to, model],
  );
  const rows = useMemo(() => (data ? rollUp(data.rows, by) : []), [data, by]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={4} />;

  const q = data.attributionQuality;
  const chart = rollUp(data.rows, "source").map((r) => ({
    source: r.source,
    sessions: r.sessions,
  }));
  const totalVisitors = data.newVisitors + data.returningVisitors;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">
        {periodLabel(data.period)} · {model === "last" ? "last-touch" : "first-touch"} attribution
      </p>

      {data.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Sessions" value={fmtNum(q.sessions)} />
            <Kpi
              label="New visitors"
              value={fmtNum(data.newVisitors)}
              sub={
                <span className="text-xs text-muted-foreground">
                  {fmtPct(totalVisitors ? data.newVisitors / totalVisitors : null, 0)} of visitors
                </span>
              }
            />
            <Kpi label="Returning visitors" value={fmtNum(data.returningVisitors)} />
            <Kpi
              label="With first-party attribution"
              value={fmtPct(q.sessions ? q.stamped / q.sessions : null, 0)}
              sub={
                <span className="text-xs text-muted-foreground">
                  {fmtNum(q.stamped)} of {fmtNum(q.sessions)} sessions
                </span>
              }
              hint="Sessions recorded after first/last-touch capture shipped. Older sessions use the entry page's source only."
            />
          </div>

          <SectionTitle>Sessions by source</SectionTitle>
          <div className="rounded-sm border border-border p-3">
            <ChartContainer
              className="aspect-auto h-[220px] w-full"
              config={{ sessions: { label: "Sessions", color: "var(--chart-1)" } }}
            >
              <BarChart data={chart} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="source"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>

          <SectionTitle
            aside={
              <div className="flex gap-1">
                {(["source", "medium", "campaign"] as GroupBy[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setBy(g)}
                    className={`rounded-sm border px-2 py-1 text-[11px] ${by === g ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {g === "source" ? "Source" : g === "medium" ? "+ Medium" : "+ Campaign"}
                  </button>
                ))}
              </div>
            }
          >
            Traffic sources
          </SectionTitle>
          <TableWrap>
            <thead className="border-b border-border bg-card">
              <tr>
                <Th>Source</Th>
                {by !== "source" && <Th>Medium</Th>}
                {by === "campaign" && <Th>Campaign</Th>}
                <Th right>Visitors</Th>
                <Th right>Sessions</Th>
                <Th right>Product views</Th>
                <Th right>Add to cart</Th>
                <Th right>Checkout</Th>
                <Th right>Orders</Th>
                <Th right>Revenue</Th>
                <Th right>Conv.</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.source}|${r.medium}|${r.campaign}`}
                  className="border-b border-border last:border-0"
                >
                  <Td>
                    <span className="capitalize">{r.source}</span>
                  </Td>
                  {by !== "source" && <Td muted>{r.medium ?? "—"}</Td>}
                  {by === "campaign" && <Td muted>{r.campaign ?? "—"}</Td>}
                  <Td right>{fmtNum(r.visitors)}</Td>
                  <Td right>{fmtNum(r.sessions)}</Td>
                  <Td right>{fmtNum(r.productViews)}</Td>
                  <Td right>{fmtNum(r.addToCart)}</Td>
                  <Td right>{fmtNum(r.checkout)}</Td>
                  <Td right>{fmtNum(r.orders)}</Td>
                  <Td right>{fmtEgp(r.revenue)}</Td>
                  <Td right>{fmtPct(r.conversionRate)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Conversion = orders ÷ sessions. Orders/revenue include cancelled checkouts, like the
            Executive Dashboard.
            {by !== "campaign"
              ? " Visitors are summed across rolled-up rows, so a visitor seen in two rows counts twice."
              : ""}
          </p>

          <div className="mt-4 space-y-2">
            {q.legacy > 0 && (
              <Notice>
                {fmtNum(q.legacy)} of {fmtNum(q.sessions)} sessions were recorded before
                first/last-touch attribution shipped: they carry only the entry page's source, with
                no medium or campaign.
                {q.legacyInternalReferrer > 0
                  ? ` ${fmtNum(q.legacyInternalReferrer)} of them entered from our own site (a reload or new tab), so their real origin was never recorded and they appear as "other".`
                  : ""}
              </Notice>
            )}
            <Notice>
              Orders are attributed by the UTM saved on the order, otherwise by the visitor's most
              recent session before the order: {fmtNum(q.ordersFromOrderUtm)} from order UTM,{" "}
              {fmtNum(q.ordersFromSession)} from session, {fmtNum(q.ordersUnattributed)}{" "}
              unattributed.
            </Notice>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <SectionTitle>Device</SectionTitle>
              <BarList rows={data.devices.map((d) => ({ key: d.key, value: d.sessions }))} />
            </div>
            <div>
              <SectionTitle>Browser</SectionTitle>
              <BarList rows={data.browsers.map((d) => ({ key: d.key, value: d.sessions }))} />
            </div>
            <div>
              <SectionTitle>Operating system</SectionTitle>
              <BarList
                rows={data.operatingSystems.map((d) => ({ key: d.key, value: d.sessions }))}
              />
            </div>
          </div>
          <div className="mt-2 grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle>Landing pages (sessions)</SectionTitle>
              <BarList rows={data.landingPages.map((d) => ({ key: d.key, value: d.sessions }))} />
            </div>
            <div>
              <SectionTitle>Exit pages (sessions)</SectionTitle>
              <BarList rows={data.exitPages.map((d) => ({ key: d.key, value: d.sessions }))} />
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Country and city are not shown: they come from a third-party IP lookup that is not
            reliable enough to report.
          </p>
        </>
      )}
    </div>
  );
}

export default TrafficSection;
