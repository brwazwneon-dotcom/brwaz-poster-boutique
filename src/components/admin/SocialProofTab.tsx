import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  SOCIAL_PROOF_KEY,
  DEFAULT_SOCIAL_PROOF,
  type SocialProofConfig,
  EG_NAMES,
  EG_CITIES,
  SALE_MESSAGES,
  pick,
  randomInt,
  timeAgo,
} from "@/lib/social-proof";
import { X, Sparkles } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function SocialProofTab() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<SocialProofConfig>(DEFAULT_SOCIAL_PROOF);
  const [saving, setSaving] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<null | {
    name: string;
    city: string;
    message: string;
    minsAgo: number;
  }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-social-proof"],
    queryFn: async (): Promise<SocialProofConfig> => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", SOCIAL_PROOF_KEY)
        .maybeSingle();
      const v = (data?.value ?? {}) as Partial<SocialProofConfig>;
      return {
        ...DEFAULT_SOCIAL_PROOF,
        ...v,
        sales: { ...DEFAULT_SOCIAL_PROOF.sales, ...(v.sales ?? {}) },
        visitors: { ...DEFAULT_SOCIAL_PROOF.visitors, ...(v.visitors ?? {}) },
        orders: { ...DEFAULT_SOCIAL_PROOF.orders, ...(v.orders ?? {}) },
      };
    },
  });

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  async function save(next: SocialProofConfig) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert(
          { key: SOCIAL_PROOF_KEY, value: JSON.parse(JSON.stringify(next)) },
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("Social proof settings saved");
      qc.invalidateQueries({ queryKey: ["social-proof-config"] });
      qc.invalidateQueries({ queryKey: ["admin-social-proof"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof SocialProofConfig>(k: K, v: SocialProofConfig[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  function updateSales<K extends keyof SocialProofConfig["sales"]>(
    k: K,
    v: SocialProofConfig["sales"][K],
  ) {
    setCfg((c) => ({ ...c, sales: { ...c.sales, [k]: v } }));
  }
  function updateVisitors<K extends keyof SocialProofConfig["visitors"]>(
    k: K,
    v: SocialProofConfig["visitors"][K],
  ) {
    setCfg((c) => ({ ...c, visitors: { ...c.visitors, [k]: v } }));
  }
  function updateOrders<K extends keyof SocialProofConfig["orders"]>(
    k: K,
    v: SocialProofConfig["orders"][K],
  ) {
    setCfg((c) => ({ ...c, orders: { ...c.orders, [k]: v } }));
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-display text-2xl">Social Proof</h2>
          <p className="text-sm text-muted-foreground">
            Sales popups, live visitors, and recent-orders counters.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const n = {
                name: pick(EG_NAMES),
                city: pick(EG_CITIES),
                message: pick(SALE_MESSAGES),
                minsAgo: randomInt(1, 42),
              };
              setPreviewNotice(n);
              window.setTimeout(
                () => setPreviewNotice(null),
                Math.max(3, cfg.sales.durationSec) * 1000,
              );
            }}
            className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            Preview notification
          </button>
          <button
            onClick={() => setCfg(DEFAULT_SOCIAL_PROOF)}
            className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            Reset defaults
          </button>
          <button
            onClick={() => save(cfg)}
            disabled={saving}
            className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sales Notifications">
          <Row label="Enabled">
            <Switch
              checked={cfg.sales.enabled}
              onCheckedChange={(v) => updateSales("enabled", v)}
            />
          </Row>
          <Row label="Show on">
            <select
              value={cfg.sales.device}
              onChange={(e) =>
                updateSales("device", e.target.value as SocialProofConfig["sales"]["device"])
              }
              className="rounded-sm border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="both">Both</option>
              <option value="desktop">Desktop only</option>
              <option value="mobile">Mobile only</option>
            </select>
          </Row>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Interval</span>
              <span className="text-muted-foreground">{cfg.sales.intervalSec}s</span>
            </div>
            <Slider
              min={10}
              max={120}
              step={5}
              value={[cfg.sales.intervalSec]}
              onValueChange={(v) => updateSales("intervalSec", v[0])}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Duration</span>
              <span className="text-muted-foreground">{cfg.sales.durationSec}s</span>
            </div>
            <Slider
              min={3}
              max={20}
              step={1}
              value={[cfg.sales.durationSec]}
              onValueChange={(v) => updateSales("durationSec", v[0])}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Max per session</span>
              <span className="text-muted-foreground">{cfg.sales.maxPerSession}</span>
            </div>
            <Slider
              min={1}
              max={30}
              step={1}
              value={[cfg.sales.maxPerSession]}
              onValueChange={(v) => updateSales("maxPerSession", v[0])}
            />
          </div>
          <Row label="Use real products">
            <Switch
              checked={cfg.sales.useRealProducts}
              onCheckedChange={(v) => updateSales("useRealProducts", v)}
            />
          </Row>
          <Row label="Use fake / demo names">
            <Switch
              checked={cfg.sales.useFakeNames}
              onCheckedChange={(v) => updateSales("useFakeNames", v)}
            />
          </Row>
        </Section>

        <Section title="Live Visitors">
          <Row label="Enabled">
            <Switch
              checked={cfg.visitors.enabled}
              onCheckedChange={(v) => updateVisitors("enabled", v)}
            />
          </Row>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Min visitors</span>
              <span className="text-muted-foreground">{cfg.visitors.min}</span>
            </div>
            <Slider
              min={1}
              max={30}
              step={1}
              value={[cfg.visitors.min]}
              onValueChange={(v) => updateVisitors("min", Math.min(v[0], cfg.visitors.max))}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Max visitors</span>
              <span className="text-muted-foreground">{cfg.visitors.max}</span>
            </div>
            <Slider
              min={2}
              max={50}
              step={1}
              value={[cfg.visitors.max]}
              onValueChange={(v) => updateVisitors("max", Math.max(v[0], cfg.visitors.min))}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Update interval</span>
              <span className="text-muted-foreground">{cfg.visitors.updateSec}s</span>
            </div>
            <Slider
              min={10}
              max={90}
              step={5}
              value={[cfg.visitors.updateSec]}
              onValueChange={(v) => updateVisitors("updateSec", v[0])}
            />
          </div>
          <Row label="Show on product pages">
            <Switch
              checked={cfg.visitors.onProduct}
              onCheckedChange={(v) => updateVisitors("onProduct", v)}
            />
          </Row>
          <Row label="Show on offers pages">
            <Switch
              checked={cfg.visitors.onOffers}
              onCheckedChange={(v) => updateVisitors("onOffers", v)}
            />
          </Row>
        </Section>

        <Section title="Recent Orders Counter">
          <Row label="Enabled">
            <Switch
              checked={cfg.orders.enabled}
              onCheckedChange={(v) => updateOrders("enabled", v)}
            />
          </Row>
          <Row label="Use real orders">
            <Switch
              checked={cfg.orders.useRealOrders}
              onCheckedChange={(v) => updateOrders("useRealOrders", v)}
            />
          </Row>
          <Row label="Fallback to demo numbers">
            <Switch
              checked={cfg.orders.fallbackDemo}
              onCheckedChange={(v) => updateOrders("fallbackDemo", v)}
            />
          </Row>
          <Row label="Show on product pages">
            <Switch
              checked={cfg.orders.onProduct}
              onCheckedChange={(v) => updateOrders("onProduct", v)}
            />
          </Row>
          <Row label="Show on offers">
            <Switch
              checked={cfg.orders.onOffers}
              onCheckedChange={(v) => updateOrders("onOffers", v)}
            />
          </Row>
          <Row label="Show on checkout">
            <Switch
              checked={cfg.orders.onCheckout}
              onCheckedChange={(v) => updateOrders("onCheckout", v)}
            />
          </Row>
        </Section>

        <Section title="Global">
          <Row label="Pause while checkout is open">
            <Switch
              checked={cfg.pauseOnCheckout}
              onCheckedChange={(v) => update("pauseOnCheckout", v)}
            />
          </Row>
          <Row label="Hide for returning admin">
            <Switch checked={cfg.hideForAdmin} onCheckedChange={(v) => update("hideForAdmin", v)} />
          </Row>
        </Section>
      </div>

      {previewNotice && (
        <div className="fixed bottom-8 left-6 z-[60] w-[340px] max-w-[calc(100vw-2rem)] animate-fade-in">
          <div className="relative flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 p-3 pr-8 text-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white/5 text-white/50">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">
                {previewNotice.name}{" "}
                <span className="text-white/60">from {previewNotice.city}</span>
              </div>
              <div className="truncate text-[12px] text-white/80">{previewNotice.message}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/50">
                {timeAgo(previewNotice.minsAgo)}
              </div>
            </div>
            <button
              onClick={() => setPreviewNotice(null)}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-full p-1 text-white/60 hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
