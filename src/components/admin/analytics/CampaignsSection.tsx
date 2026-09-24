import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsCampaigns } from "@/lib/analytics-center.functions";
import type { RangeInput, TouchModel } from "@/lib/analytics-center.types";
import {
  EmptyState,
  ErrorState,
  Limitations,
  Notice,
  TableWrap,
  Td,
  Th,
  fmtEgp,
  fmtNum,
  periodLabel,
  useAsync,
} from "./ui";

export function CampaignsSection({ input, model }: { input: RangeInput; model: TouchModel }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsCampaigns({ data: { ...input, model } }),
    [input.range, input.from, input.to, model],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={4} />;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">
        {periodLabel(data.period)} · {model === "last" ? "last-touch" : "first-touch"} attribution ·
        from UTM parameters only
      </p>

      {data.rows.length === 0 ? (
        <div className="space-y-2">
          <EmptyState>No UTM-tagged campaign traffic in this period.</EmptyState>
          <Notice>
            Campaigns appear here when ad links carry <code>utm_campaign</code> (e.g.{" "}
            <code className="break-all">
              ?utm_source=instagram&amp;utm_medium=paid_social&amp;utm_campaign=eid_offer
            </code>
            ).
          </Notice>
        </div>
      ) : (
        <TableWrap>
          <thead className="border-b border-border bg-card">
            <tr>
              <Th>Campaign</Th>
              <Th>Source</Th>
              <Th>Medium</Th>
              <Th>Content</Th>
              <Th right>Sessions</Th>
              <Th right>Visitors</Th>
              <Th right>Product views</Th>
              <Th right>Add to cart</Th>
              <Th right>Checkout</Th>
              <Th right>Orders</Th>
              <Th right>Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={`${r.campaign}|${r.source}|${r.medium}`}
                className="border-b border-border last:border-0"
              >
                <Td>
                  <span className="break-all">{r.campaign}</span>
                </Td>
                <Td>
                  <span className="capitalize">{r.source}</span>
                </Td>
                <Td muted>{r.medium ?? "—"}</Td>
                <Td muted>{r.content ?? "—"}</Td>
                <Td right>{fmtNum(r.sessions)}</Td>
                <Td right>{fmtNum(r.visitors)}</Td>
                <Td right>{fmtNum(r.productViews)}</Td>
                <Td right>{fmtNum(r.addToCart)}</Td>
                <Td right>{fmtNum(r.checkout)}</Td>
                <Td right>{fmtNum(r.orders)}</Td>
                <Td right>{fmtEgp(r.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <Limitations items={data.limitations} />
    </div>
  );
}

export default CampaignsSection;
