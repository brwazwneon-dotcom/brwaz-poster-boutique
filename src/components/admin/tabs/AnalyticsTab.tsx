import { useEffect, useState } from "react";
import { getAnalyticsOverviewAdmin } from "@/lib/db-admin.functions";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";

type AnalyticsData = Awaited<ReturnType<typeof getAnalyticsOverviewAdmin>>;

const DAY_OPTIONS = [
  { id: 7, label: "7 Days" },
  { id: 30, label: "30 Days" },
  { id: 90, label: "90 Days" },
];

export function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    setData(null);
    getAnalyticsOverviewAdmin({ data: { days } }).then(setData);
  }, [days]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Website Analytics</h2>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDays(d.id)}
              className={`rounded-sm border px-3 py-1.5 text-xs ${
                days === d.id ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <LoadingTiles />
      ) : (
        <>
          <p className="mb-4 text-xs text-muted-foreground">
            Reads the tracking already running on every storefront visit ({" "}
            <code className="rounded-sm bg-accent px-1">analytics_visits</code>,{" "}
            <code className="rounded-sm bg-accent px-1">analytics_poster_events</code>,{" "}
            <code className="rounded-sm bg-accent px-1">search_queries</code> ) — no new tracking, just
            surfacing what's already there.
          </p>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Visits by day
          </h3>
          {data.byDay.length === 0 ? (
            <p className="mb-6 text-sm text-muted-foreground">No visits recorded in this range yet.</p>
          ) : (
            <VisitsChart byDay={data.byDay as { day: string; visitors: number; visits: number }[]} />
          )}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Traffic sources
              </h3>
              {data.bySource.length === 0 ? (
                <p className="text-sm text-muted-foreground">No traffic yet.</p>
              ) : (
                <div className="overflow-hidden rounded-sm border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Visitors</th>
                        <th className="px-3 py-2">Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.bySource as { source: string; visitors: number; visits: number }[]).map((s) => (
                        <tr key={s.source} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 capitalize">{s.source}</td>
                          <td className="px-3 py-2">{s.visitors}</td>
                          <td className="px-3 py-2">{s.visits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Top products by views
              </h3>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No product views recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {(data.topProducts as { id: string; title: string; image_url: string; views: number }[]).map(
                    (p) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-sm border border-border p-1.5">
                        <img src={p.image_url} alt="" className="h-8 w-6 rounded-sm object-cover" />
                        <span className="flex-1 truncate text-xs">{p.title}</span>
                        <span className="text-xs font-medium text-muted-foreground">{p.views} views</span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Top searches
              </h3>
              {data.topSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No searches recorded yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(data.topSearches as { query: string; n: number }[]).map((s) => (
                    <li key={s.query} className="flex justify-between rounded-sm border border-border px-2.5 py-1.5">
                      <span dir="ltr">{s.query}</span>
                      <span className="text-xs text-muted-foreground">{s.n}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Zero-result searches
              </h3>
              <p className="mb-2 text-[11px] text-muted-foreground">
                What customers looked for and didn't find — candidates for new products or categories.
              </p>
              {data.zeroResultSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">None — every search found something.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(data.zeroResultSearches as { query: string; n: number }[]).map((s) => (
                    <li
                      key={s.query}
                      className="flex justify-between rounded-sm border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5"
                    >
                      <span dir="ltr">{s.query}</span>
                      <span className="text-xs text-amber-500">{s.n}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function VisitsChart({ byDay }: { byDay: { day: string; visitors: number; visits: number }[] }) {
  const max = Math.max(1, ...byDay.map((d) => d.visits));
  return (
    <div className="mb-6 rounded-sm border border-border p-3">
      <div className="flex h-32 items-end gap-1">
        {byDay.map((d) => (
          <div key={d.day} className="group relative flex-1">
            <div
              className="w-full rounded-t-sm bg-primary/70 transition group-hover:bg-primary"
              style={{ height: `${Math.max(2, (d.visits / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-sm bg-card px-1.5 py-0.5 text-[10px] shadow group-hover:block">
              {new Date(d.day).toLocaleDateString()} · {d.visits} visits · {d.visitors} visitors
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{new Date(byDay[0].day).toLocaleDateString()}</span>
        <span>{new Date(byDay[byDay.length - 1].day).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
