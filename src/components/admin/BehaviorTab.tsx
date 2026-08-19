import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Download,
  Trash2,
  RotateCcw,
  Users,
  ShoppingCart,
  Heart,
  Eye,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Dashboard = {
  totals?: { total: number; returning: number; identified: number };
  abandoned_7d?: number;
  interest_categories?: Array<{ id: string; name: string; score: number }>;
  interest_tags?: Array<{ tag: string; score: number }>;
  top_searches?: Array<{ q: string; c: number }>;
  top_viewed?: Array<{ id: string; title: string; image_url: string | null; views_count: number }>;
  top_wishlisted?: Array<{
    id: string;
    title: string;
    image_url: string | null;
    wishlist_count: number;
  }>;
  top_cart?: Array<{
    id: string;
    title: string;
    image_url: string | null;
    cart_adds_count: number;
  }>;
};

type Setting = { key: string; value: unknown };

function useToggleSetting(key: string, defaultValue: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["site_settings", key],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      const v = data?.value as unknown;
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v === "true" || v === "1";
      return defaultValue;
    },
  });
  const setValue = async (next: boolean) => {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value: next }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["site_settings", key] });
  };
  return { value: q.data ?? defaultValue, setValue };
}

export function BehaviorTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-behavior-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_behavior_dashboard");
      if (error) throw error;
      return (data ?? {}) as Dashboard;
    },
  });

  const tracking = useToggleSetting("behavior.tracking_enabled", true);
  const personalization = useToggleSetting("behavior.personalization_enabled", true);

  const [phone, setPhone] = useState("");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const lookup = async () => {
    if (!phone.trim()) return;
    setLoadingProfile(true);
    try {
      const { data, error } = await supabase.rpc("admin_customer_profile", {
        _phone: phone.trim(),
      });
      if (error) throw error;
      setProfile(data as Record<string, unknown>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoadingProfile(false);
    }
  };

  const clearAnon = async () => {
    if (!confirm("Delete anonymous visitor data older than 90 days?")) return;
    const { data, error } = await supabase.rpc("admin_clear_anonymous_behavior", {
      _older_than_days: 90,
    });
    if (error) return toast.error(error.message);
    toast.success(`Removed ${data ?? 0} visitor profiles`);
    qc.invalidateQueries({ queryKey: ["admin-behavior-dashboard"] });
  };

  const resetEngine = async () => {
    if (
      !confirm(
        "Reset interest scores for ALL visitors? Their profiles remain but personalization restarts from zero.",
      )
    )
      return;
    const { error } = await supabase.rpc("admin_reset_recommendation_engine");
    if (error) return toast.error(error.message);
    toast.success("Recommendation engine reset");
    qc.invalidateQueries({ queryKey: ["admin-behavior-dashboard"] });
  };

  const exportCsv = async () => {
    const { data, error } = await supabase.from("visitor_profiles").select("*").limit(5000);
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) return toast.error("No data to export");
    const cols = [
      "visitor_id",
      "phone",
      "first_seen",
      "last_seen",
      "visits_count",
      "device",
      "city",
      "governorate",
      "country",
      "interests",
    ];
    const csv = [cols.join(",")]
      .concat(rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visitor_profiles_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = data?.totals ?? { total: 0, returning: 0, identified: 0 };

  return (
    <div className="space-y-8">
      {/* Settings row */}
      <div className="rounded-sm border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Controls</div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={tracking.value} onCheckedChange={tracking.setValue} />
            Tracking
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={personalization.value} onCheckedChange={personalization.setValue} />
            Personalization
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
            >
              <RotateCcw className="h-3 w-3" /> Refresh
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
            >
              <Download className="h-3 w-3" /> Export CSV
            </button>
            <button
              onClick={clearAnon}
              className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/40 px-3 py-1.5 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" /> Clear anon (&gt;90d)
            </button>
            <button
              onClick={resetEngine}
              className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/40 px-3 py-1.5 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10"
            >
              Reset engine
            </button>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total visitors"
          value={totals.total}
        />
        <StatCard icon={<Users className="h-4 w-4" />} label="Returning" value={totals.returning} />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Identified"
          value={totals.identified}
        />
        <StatCard
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Abandoned carts (7d)"
          value={data?.abandoned_7d ?? 0}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading behavior data…
        </div>
      ) : null}

      {/* Interests */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RankedList
          title="Top category interests"
          icon={<Tag className="h-4 w-4" />}
          items={(data?.interest_categories ?? []).map((c) => ({
            key: c.id,
            label: c.name,
            count: Math.round(c.score),
          }))}
        />
        <RankedList
          title="Top tag interests"
          icon={<Tag className="h-4 w-4" />}
          items={(data?.interest_tags ?? []).map((t) => ({
            key: t.tag,
            label: t.tag,
            count: Math.round(t.score),
          }))}
        />
      </div>

      {/* Searches + product leaderboards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RankedList
          title="Top searches (30d)"
          icon={<Search className="h-4 w-4" />}
          items={(data?.top_searches ?? []).map((s) => ({ key: s.q, label: s.q, count: s.c }))}
        />
        <PosterList
          title="Most viewed"
          icon={<Eye className="h-4 w-4" />}
          items={(data?.top_viewed ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            image: p.image_url,
            count: p.views_count,
          }))}
        />
        <PosterList
          title="Most wishlisted"
          icon={<Heart className="h-4 w-4" />}
          items={(data?.top_wishlisted ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            image: p.image_url,
            count: p.wishlist_count,
          }))}
        />
        <PosterList
          title="Most added to cart"
          icon={<ShoppingCart className="h-4 w-4" />}
          items={(data?.top_cart ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            image: p.image_url,
            count: p.cart_adds_count,
          }))}
        />
      </div>

      {/* Customer lookup */}
      <div className="rounded-sm border border-border bg-card p-4">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
          Customer profile
        </h3>
        <div className="mt-3 flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Search by phone number…"
            className="w-full max-w-sm rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={lookup}
            disabled={loadingProfile || !phone.trim()}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {loadingProfile ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Look up
          </button>
        </div>
        {profile ? (
          <pre className="mt-4 max-h-96 overflow-auto rounded-sm border border-border bg-background p-3 text-[11px] leading-relaxed">
            {JSON.stringify(profile, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RankedList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ key: string; label: string; count: number }>;
}) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.count)), [items]);
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3">
              <div className="w-32 truncate text-sm">{it.label}</div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full bg-primary")}
                  style={{ width: `${(it.count / max) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right text-xs text-muted-foreground">{it.count}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PosterList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ id: string; title: string; image: string | null; count: number }>;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <SafeImage
                src={p.image ?? ""}
                alt={p.title}
                className="h-10 w-8 shrink-0 rounded-sm object-cover"
              />
              <div className="flex-1 truncate text-sm">{p.title}</div>
              <div className="text-xs text-muted-foreground">{p.count}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
