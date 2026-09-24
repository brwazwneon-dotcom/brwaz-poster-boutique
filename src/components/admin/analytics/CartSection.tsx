import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsCart, getAnalyticsFunnel } from "@/lib/analytics-center.functions";
import type { RangeInput } from "@/lib/analytics-center.types";
import { FunnelBars } from "./FunnelBars";
import {
  BarList,
  EmptyState,
  ErrorState,
  Kpi,
  Limitations,
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

export function CartSection({ input }: { input: RangeInput }) {
  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsCart({ data: input }),
    [input.range, input.from, input.to],
  );
  const funnel = useAsync(
    () => getAnalyticsFunnel({ data: { ...input, model: "last" } }),
    [input.range, input.from, input.to],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={8} />;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">{periodLabel(data.period)}</p>
      <SectionTitle>Cart funnel</SectionTitle>
      {funnel.error ? (
        <ErrorState message={funnel.error} onRetry={funnel.reload} />
      ) : funnel.data ? (
        <FunnelBars steps={funnel.data.steps} />
      ) : (
        <LoadingTiles count={2} />
      )}
      <SectionTitle>Cart numbers</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Carts (sessions with add to cart)" value={fmtNum(data.cartSessions)} />
        <Kpi label="Items added" value={fmtNum(data.itemsAdded)} />
        <Kpi
          label="Cart views (sessions)"
          value={data.viewCartSessions > 0 ? fmtNum(data.viewCartSessions) : "—"}
          hint="Only recorded from the day cart-view tracking shipped"
        />
        <Kpi label="Checkout starts" value={fmtNum(data.checkoutStarts)} />
        <Kpi label="Completed orders" value={fmtNum(data.orders)} />
        <Kpi
          label="Cart abandonment"
          value={fmtPct(data.cartAbandonment, 0)}
          hint="1 − orders ÷ sessions with add to cart"
        />
        <Kpi
          label="Checkout abandonment"
          value={fmtPct(data.checkoutAbandonment, 0)}
          hint="1 − orders ÷ checkout starts"
        />
        <Kpi
          label="Average cart value"
          value={data.averageCartValue === null ? "Not tracked yet" : fmtEgp(data.averageCartValue)}
          sub={
            data.averageCartValue !== null ? (
              <span className="text-xs text-muted-foreground">
                {fmtNum(data.averageCartValueSamples)} carts viewed
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="mt-2 grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Most common abandoned products</SectionTitle>
          {data.abandonedProducts.length === 0 ? (
            <EmptyState />
          ) : (
            <ol className="space-y-1.5">
              {data.abandonedProducts.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-xs">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-8 w-6 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <span className="h-8 w-6 shrink-0 rounded-sm bg-accent" />
                  )}
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {p.title}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{fmtNum(p.adds)} adds</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <SectionTitle>Frames per order</SectionTitle>
          <BarList
            rows={data.cartSizes.map((s) => ({
              key: `${s.label} frame${s.label === "1" ? "" : "s"}`,
              value: s.checkouts,
            }))}
          />
        </div>
      </div>

      <SectionTitle>Regular vs offers vs custom design</SectionTitle>
      {data.orderTypes.length === 0 ? (
        <EmptyState />
      ) : (
        <TableWrap>
          <thead className="border-b border-border bg-card">
            <tr>
              <Th>Type</Th>
              <Th right>Orders</Th>
              <Th right>Item revenue</Th>
            </tr>
          </thead>
          <tbody>
            {data.orderTypes.map((t) => (
              <tr key={t.type} className="border-b border-border last:border-0">
                <Td>{t.label}</Td>
                <Td right>{fmtNum(t.checkouts)}</Td>
                <Td right>{fmtEgp(t.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <Limitations items={data.notes} />
    </div>
  );
}

export default CartSection;
