import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsClicks } from "@/lib/analytics-center.functions";
import type { LabelCount, RangeInput } from "@/lib/analytics-center.types";
import {
  BarList,
  ErrorState,
  Kpi,
  Limitations,
  SectionTitle,
  TableWrap,
  Td,
  Th,
  fmtDay,
  fmtNum,
  periodLabel,
  useAsync,
} from "./ui";

const toBars = (rows: LabelCount[]) => rows.map((r) => ({ key: r.label, value: r.n }));

export function ClicksSection({ input }: { input: RangeInput }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsClicks({ data: input }),
    [input.range, input.from, input.to],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={4} />;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">{periodLabel(data.period)}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Total clicks"
          value={fmtNum(data.totalClicks)}
          hint="Product, category, subcategory, banner, offer and WhatsApp clicks"
        />
        <Kpi label="Searches" value={fmtNum(data.searches.total)} />
        <Kpi label="Searches with no results" value={fmtNum(data.searches.zeroResult)} />
        <Kpi
          label="Add to cart events"
          value={fmtNum(data.rows.find((r) => r.key === "cart_add")?.events ?? 0)}
        />
      </div>

      <SectionTitle>By type</SectionTitle>
      <TableWrap>
        <thead className="border-b border-border bg-card">
          <tr>
            <Th>Interaction</Th>
            <Th right>Events</Th>
            <Th right>Sessions</Th>
            <Th>Tracked since</Th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <Td>{r.label}</Td>
              <Td right>{r.firstSeen ? fmtNum(r.events) : "—"}</Td>
              <Td right>{r.firstSeen ? fmtNum(r.sessions) : "—"}</Td>
              <Td muted>{r.firstSeen ? fmtDay(r.firstSeen) : "Not recorded yet"}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="mt-2 grid gap-6 md:grid-cols-3">
        <div>
          <SectionTitle>Top categories clicked</SectionTitle>
          <BarList rows={toBars(data.topCategories)} />
        </div>
        <div>
          <SectionTitle>Top banners clicked</SectionTitle>
          <BarList rows={toBars(data.topBanners)} />
        </div>
        <div>
          <SectionTitle>Top offers clicked</SectionTitle>
          <BarList rows={toBars(data.topOffers)} />
        </div>
      </div>
      <div className="mt-2 grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Top searches</SectionTitle>
          <BarList rows={toBars(data.topSearches)} unit="×" />
        </div>
        <div>
          <SectionTitle>Searches with no results</SectionTitle>
          <BarList rows={toBars(data.zeroResultSearches)} unit="×" />
        </div>
      </div>
      <Limitations items={data.limitations} />
    </div>
  );
}

export default ClicksSection;
