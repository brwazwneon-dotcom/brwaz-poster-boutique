import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  keyword: string;
  category: string | null;
  selected_title: string | null;
  selected_poster_id: string | null;
  action: string;
  session_id: string | null;
  created_at: string;
};

const ACTIONS = ["all", "search", "select", "wishlist", "whatsapp", "chip"] as const;

export function AssistantRequestsTab() {
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("all");
  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["assistant-requests", action],
    queryFn: async () => {
      let q = supabase
        .from("assistant_requests")
        .select("id, keyword, category, selected_title, selected_poster_id, action, session_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (action !== "all") q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const topKeywords = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data) {
      const k = r.keyword.trim().toLowerCase();
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [data]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data) {
      const c = (r.category ?? "").trim().toLowerCase();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [data]);

  const topSelected = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data) {
      if (!r.selected_title) continue;
      map.set(r.selected_title, (map.get(r.selected_title) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Customer Image Requests</h2>
          <p className="text-sm text-muted-foreground">Activity from the poster assistant.</p>
        </div>
        <div className="flex items-center gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`rounded-sm border px-2.5 py-1 text-xs uppercase tracking-widest ${
                action === a ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
              }`}
            >
              {a}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="rounded-sm border border-border px-2.5 py-1 text-xs uppercase tracking-widest hover:bg-accent"
          >
            {isFetching ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Top keywords" rows={topKeywords} />
        <StatCard title="Top categories" rows={topCategories} />
        <StatCard title="Top selected designs" rows={topSelected} />
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card/50 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Time</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Keyword</th>
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-left">Selected design</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="p-4 text-muted-foreground" colSpan={5}>Loading…</td></tr>
            ) : data.length === 0 ? (
              <tr><td className="p-4 text-muted-foreground" colSpan={5}>No assistant activity yet.</td></tr>
            ) : (
              data.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-2 text-xs uppercase tracking-widest">{r.action}</td>
                  <td className="p-2">{r.keyword}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.category ?? "—"}</td>
                  <td className="p-2 text-xs">{r.selected_title ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <ul className="space-y-1">
          {rows.map(([k, n]) => (
            <li key={k} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{k}</span>
              <span className="rounded-sm bg-accent px-1.5 text-[11px] font-medium">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}