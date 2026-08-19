import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PHOTO_4X6_DEFAULTS,
  PHOTO_4X6_KEY,
  usePhoto4x6Config,
  type Photo4x6Config,
  type Photo4x6Package,
} from "@/lib/use-settings";
import { Download, Trash2, Plus, Save } from "lucide-react";

type Order = {
  id: string;
  order_number: string | null;
  customer_name: string;
  phone: string;
  address: string | null;
  governorate: string | null;
  package_key: string;
  photo_count: number;
  total_price: number;
  original_paths: string[];
  enhanced_paths: string[];
  suit_paths: string[];
  selected_versions: Record<string, string>;
  notes: string | null;
  status: string;
  created_at: string;
};

export function Photo4x6Tab() {
  return (
    <div className="space-y-10">
      <Photo4x6Settings />
      <Photo4x6Orders />
    </div>
  );
}

/* ------------ SETTINGS ------------ */

function Photo4x6Settings() {
  const initial = usePhoto4x6Config();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<Photo4x6Config>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setCfg(initial), [initial]);

  const updatePkg = (idx: number, patch: Partial<Photo4x6Package>) =>
    setCfg((c) => ({
      ...c,
      packages: c.packages.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));

  const addPkg = () =>
    setCfg((c) => ({
      ...c,
      packages: [
        ...c.packages,
        { key: `p${c.packages.length + 1}`, photos: 8, price: 80, label: "New Package" },
      ],
    }));

  const removePkg = (idx: number) =>
    setCfg((c) => ({ ...c, packages: c.packages.filter((_, i) => i !== idx) }));

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: PHOTO_4X6_KEY, value: cfg as unknown as never }, { onConflict: "key" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["photo-4x6-config"] });
      toast.success("4×6 settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setCfg(PHOTO_4X6_DEFAULTS);

  return (
    <section className="rounded-sm border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-display text-2xl">4×6 Photo Printing — Settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage packages, AI features, and the checkout upsell popup.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="rounded-sm border border-border px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            Reset
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Toggles */}
        <div className="space-y-3">
          <Toggle
            label="Service enabled"
            value={cfg.enabled}
            onChange={(v) => setCfg((c) => ({ ...c, enabled: v }))}
          />
          <Toggle
            label="AI Photo Enhancement"
            value={cfg.aiEnhanceEnabled}
            onChange={(v) => setCfg((c) => ({ ...c, aiEnhanceEnabled: v }))}
          />
          <Toggle
            label='Wear a Suit ("خلي الصورة ببدلة")'
            value={cfg.aiSuitEnabled}
            onChange={(v) => setCfg((c) => ({ ...c, aiSuitEnabled: v }))}
          />
          <Toggle
            label="Checkout upsell popup"
            value={cfg.upsellEnabled}
            onChange={(v) => setCfg((c) => ({ ...c, upsellEnabled: v }))}
          />
        </div>

        {/* Upsell copy */}
        <div className="space-y-3">
          <Text
            label="Popup title"
            value={cfg.upsellTitle}
            onChange={(v) => setCfg((c) => ({ ...c, upsellTitle: v }))}
          />
          <Text
            label="Popup subtitle"
            value={cfg.upsellSubtitle}
            onChange={(v) => setCfg((c) => ({ ...c, upsellSubtitle: v }))}
            textarea
          />
          <Text
            label="Popup example image URL"
            value={cfg.upsellExampleImage}
            onChange={(v) => setCfg((c) => ({ ...c, upsellExampleImage: v }))}
            placeholder="https://…"
          />
        </div>
      </div>

      {/* Packages */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-display text-xl">Packages</h3>
          <button
            onClick={addPkg}
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Add package
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {cfg.packages.map((p, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-sm border border-border bg-background p-3 sm:grid-cols-[100px_100px_100px_1fr_40px] sm:items-end"
            >
              <Text label="Key" value={p.key} onChange={(v) => updatePkg(i, { key: v })} />
              <Text
                label="Photos"
                value={String(p.photos)}
                onChange={(v) => updatePkg(i, { photos: Number(v) || 0 })}
              />
              <Text
                label="Price (EGP)"
                value={String(p.price)}
                onChange={(v) => updatePkg(i, { price: Number(v) || 0 })}
              />
              <Text label="Label" value={p.label} onChange={(v) => updatePkg(i, { label: v })} />
              <button
                onClick={() => removePkg(i)}
                className="rounded-sm border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove package"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-sm border border-border bg-background p-3">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

function Text({
  label,
  value,
  onChange,
  textarea,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  placeholder?: string;
}) {
  const props = {
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    className:
      "mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary",
  };
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {textarea ? <textarea rows={2} {...props} /> : <input type="text" {...props} />}
    </label>
  );
}

/* ------------ ORDERS ------------ */

const STATUSES = ["new", "processing", "printed", "shipped", "delivered", "cancelled"] as const;

function Photo4x6Orders() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["photo-4x6-orders", statusFilter],
    queryFn: async (): Promise<Order[]> => {
      let q = supabase
        .from("photo_4x6_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("photo_4x6_orders").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["photo-4x6-orders"] });
    toast.success(`Marked ${status}`);
  };

  return (
    <section className="rounded-sm border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-display text-2xl">4×6 Photo Orders</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {orders.length} order{orders.length === 1 ? "" : "s"}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && orders.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No 4×6 orders yet.</p>
      )}

      <div className="mt-6 space-y-4">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} onStatus={setStatus} />
        ))}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  onStatus,
}: {
  order: Order;
  onStatus: (id: string, status: string) => void;
}) {
  const [signedByPath, setSignedByPath] = useState<Record<string, string>>({});
  const config = usePhoto4x6Config();
  const pkgLabel =
    config.packages.find((p) => p.key === order.package_key)?.label ?? order.package_key;

  const allPaths = useMemo(
    () => [...order.original_paths, ...order.enhanced_paths, ...order.suit_paths],
    [order],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (allPaths.length === 0) return;
      const { data, error } = await supabase.storage
        .from("photo-4x6")
        .createSignedUrls(allPaths, 60 * 60);
      if (cancelled || error || !data) return;
      const map: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) map[allPaths[i]] = d.signedUrl;
      });
      setSignedByPath(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [allPaths]);

  const downloadAll = async () => {
    for (const p of allPaths) {
      const url = signedByPath[p];
      if (!url) continue;
      const a = document.createElement("a");
      a.href = url;
      a.download = p.split("/").pop() ?? "photo.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-display text-xl">{order.order_number ?? order.id.slice(0, 8)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleString()} · {order.status}
          </div>
          <div className="mt-2 text-sm">
            <div>
              <span className="text-muted-foreground">Customer:</span> {order.customer_name} ·{" "}
              {order.phone}
            </div>
            <div>
              <span className="text-muted-foreground">Address:</span> {order.governorate} ·{" "}
              {order.address}
            </div>
            <div>
              <span className="text-muted-foreground">Package:</span> {pkgLabel} ·{" "}
              {order.photo_count} photos · {order.total_price} EGP
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadAll}
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            <Download className="h-3 w-3" /> Download all
          </button>
          <button
            onClick={() => onStatus(order.id, "printed")}
            className="rounded-sm border border-border px-2 py-1 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            Mark printed
          </button>
          <button
            onClick={() => onStatus(order.id, "delivered")}
            className="rounded-sm border border-border px-2 py-1 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            Mark delivered
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-sm border border-primary/30 bg-primary/5 p-3">
        <div className="text-[10px] uppercase tracking-widest text-primary">
          Customer Notes · ملاحظات العميل
        </div>
        {order.notes?.trim() ? (
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{order.notes}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">No notes from customer.</p>
        )}
      </div>

      <PhotoGroup title="Originals" paths={order.original_paths} signedByPath={signedByPath} />
      {order.enhanced_paths.length > 0 && (
        <PhotoGroup title="Enhanced" paths={order.enhanced_paths} signedByPath={signedByPath} />
      )}
      {order.suit_paths.length > 0 && (
        <PhotoGroup title="Suit versions" paths={order.suit_paths} signedByPath={signedByPath} />
      )}
    </div>
  );
}

function PhotoGroup({
  title,
  paths,
  signedByPath,
}: {
  title: string;
  paths: string[];
  signedByPath: Record<string, string>;
}) {
  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {title} · {paths.length}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {paths.map((p) => {
          const url = signedByPath[p];
          return (
            <a
              key={p}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-sm bg-muted"
            >
              {url ? (
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}
