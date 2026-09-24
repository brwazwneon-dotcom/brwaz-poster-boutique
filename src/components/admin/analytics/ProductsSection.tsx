import { useEffect, useState } from "react";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsProducts } from "@/lib/analytics-center.functions";
import type { ProductRow, ProductSortKey, RangeInput } from "@/lib/analytics-center.types";
import {
  EmptyState,
  ErrorState,
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

const COLUMNS: Array<{ key: ProductSortKey; label: string }> = [
  { key: "views", label: "Views" },
  { key: "clicks", label: "Clicks" },
  { key: "cart_adds", label: "Add to cart" },
  { key: "purchases", label: "Purchases" },
  { key: "revenue", label: "Revenue" },
  { key: "conversion", label: "Conv." },
];

function TopList({
  title,
  rows,
  value,
}: {
  title: string;
  rows: ProductRow[];
  value: (r: ProductRow) => string;
}) {
  return (
    <div className="rounded-sm border border-border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              {r.imageUrl ? (
                <img
                  src={r.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-8 w-6 shrink-0 rounded-sm object-cover"
                />
              ) : (
                <span className="h-8 w-6 shrink-0 rounded-sm bg-accent" />
              )}
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {r.title}
              </span>
              <span className="tabular-nums text-muted-foreground">{value(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ProductsSection({ input }: { input: RangeInput }) {
  const [sort, setSort] = useState<ProductSortKey>("views");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [input.range, input.from, input.to]);

  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsProducts({ data: { ...input, sort, dir, page, pageSize: 25, q } }),
    [input.range, input.from, input.to, sort, dir, page, q],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={4} />;

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const clickSort = (k: ProductSortKey) => {
    if (k === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(k);
      setDir("desc");
    }
    setPage(1);
  };
  const arrow = (k: ProductSortKey) => (k === sort ? (dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <p className="mb-3 text-xs text-muted-foreground">
        {periodLabel(data.period)} · numerical sorts only — nothing here is a quality ranking
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TopList
          title="Most viewed"
          rows={data.top.views}
          value={(r) => `${fmtNum(r.views)} views`}
        />
        <TopList
          title="Most clicked"
          rows={data.top.clicks}
          value={(r) => `${fmtNum(r.clicks)} clicks`}
        />
        <TopList
          title="Most added to cart"
          rows={data.top.cartAdds}
          value={(r) => `${fmtNum(r.cartAdds)} adds`}
        />
        <TopList
          title="Most purchased"
          rows={data.top.purchases}
          value={(r) => `${fmtNum(r.purchases)} sold`}
        />
      </div>

      <SectionTitle
        aside={
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
            className="w-44 rounded-sm border border-border bg-background px-2 py-1 text-xs"
          />
        }
      >
        All products with activity ({fmtNum(data.total)})
      </SectionTitle>

      {data.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <TableWrap>
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <button
                  onClick={() => clickSort("title")}
                  className="uppercase hover:text-foreground"
                >
                  Product{arrow("title")}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  <button
                    onClick={() => clickSort(c.key)}
                    className="uppercase hover:text-foreground"
                  >
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
              <Th right>Wishlist</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <Td>
                  <div className="flex items-center gap-2">
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-9 w-7 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="h-9 w-7 shrink-0 rounded-sm bg-accent" />
                    )}
                    <div className="min-w-0">
                      <div className="max-w-[260px] truncate" dir="auto">
                        {r.title}
                      </div>
                      {r.category && (
                        <div className="text-[11px] text-muted-foreground">{r.category}</div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td right>{fmtNum(r.views)}</Td>
                <Td right>{data.clicksTracked ? fmtNum(r.clicks) : "—"}</Td>
                <Td right>{fmtNum(r.cartAdds)}</Td>
                <Td right>{fmtNum(r.purchases)}</Td>
                <Td right>{fmtEgp(r.revenue)}</Td>
                <Td right>{fmtPct(r.conversionRate)}</Td>
                <Td right muted>
                  {fmtNum(r.wishlists)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {data.page} of {pages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-sm border border-border px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={data.page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="rounded-sm border border-border px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
      <Limitations items={data.limitations} />
    </div>
  );
}

export default ProductsSection;
