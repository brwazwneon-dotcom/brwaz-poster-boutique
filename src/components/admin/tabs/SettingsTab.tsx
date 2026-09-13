import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAllSiteSettingsAdmin, setSiteSetting } from "@/lib/db-admin.functions";
import { AdminThemeToggle } from "@/components/admin/layout/AdminThemeToggle";
import { useAdminTheme } from "@/components/admin/layout/AdminThemeProvider";
import { LoadingForm } from "@/components/admin/layout/LoadingState";
import { PERFORMANCE_DEFAULTS, type PerformanceFlags } from "@/lib/performance-flags";
import {
  GRID_DISPLAY_MODE_KEY,
  GRID_DISPLAY_MODE_DEFAULT,
  type GridDisplayMode,
  PHOTO_4X6_KEY,
  PHOTO_4X6_DEFAULTS,
  parsePhoto4x6,
  type Photo4x6Config,
  type Photo4x6Package,
  POST_ORDER_MESSAGE_ENABLED_KEY,
  parsePostOrderMessageEnabled,
} from "@/lib/use-settings";

const SETTING_FIELDS: { key: string; label: string }[] = [
  { key: "frame_pvc_20x30", label: "PVC 20×30 (EGP)" },
  { key: "frame_pvc_30x40", label: "PVC 30×40 (EGP)" },
  { key: "frame_pvc_40x50", label: "PVC 40×50 (EGP)" },
  { key: "frame_wood_20x30", label: "Wood 20×30 (EGP)" },
  { key: "frame_wood_30x40", label: "Wood 30×40 (EGP)" },
  { key: "frame_wood_40x50", label: "Wood 40×50 (EGP)" },
  { key: "frame_wood_40x60", label: "Wood 40×60 (EGP)" },
  { key: "frame_wood_50x60", label: "Wood 50×60 (EGP)" },
  { key: "frame_wood_50x70", label: "Wood 50×70 (EGP)" },
  { key: "frame_wood_60x90", label: "Wood 60×90 (EGP)" },
  { key: "frame_wood_100x60", label: "Wood 100×60 (EGP)" },
  { key: "photo_10x15", label: "Photo 10×15 (EGP)" },
  { key: "photo_13x18", label: "Photo 13×18 (EGP)" },
  { key: "photo_15x20", label: "Photo 15×20 (EGP)" },
  { key: "custom_design_fee", label: "Custom design fee (EGP)" },
  { key: "packaging_fee", label: "Packaging fee (EGP)" },
  { key: "offer_6_20x30", label: "Bundle: 6× 20×30 (EGP)" },
  { key: "offer_4_30x40", label: "Bundle: 4× 30×40 (EGP)" },
  { key: "double_face_tape_price", label: "Double-face tape (EGP)" },
  { key: "shipping_fee", label: "Shipping fee (EGP)" },
  { key: "free_shipping_threshold", label: "Free shipping over (EGP)" },
];

export function SettingsTab() {
  const [values, setValues] = useState<Record<string, string> | null>(null);

  const load = async () => {
    const rows = (await getAllSiteSettingsAdmin()) as Array<{ key: string; value: unknown }>;
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = String(row.value);
    setValues(map);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (key: string) => {
    const raw = values?.[key] ?? "";
    const num = Number(raw);
    try {
      await setSiteSetting({ data: { key, value: Number.isFinite(num) ? num : raw } });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  if (values === null) return <LoadingForm />;

  // usePricing() (src/lib/use-settings.ts) reads this key live to decide
  // whether the double-face-tape upsell prompt appears at checkout at all
  // (src/routes/cart.tsx) — it had no admin input even though the price
  // field right above it does, so the tape couldn't be turned off without
  // a DB console. Persists immediately, like the feature-flag toggles below.
  const tapeEnabled = values["double_face_tape_enabled"] !== "false" && values["double_face_tape_enabled"] !== "0";
  const toggleTapeEnabled = async (checked: boolean) => {
    setValues({ ...values, double_face_tape_enabled: String(checked) });
    try {
      await setSiteSetting({ data: { key: "double_face_tape_enabled", value: checked } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div>
      <div className="max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Pricing & shipping</h2>
        {SETTING_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            <label className="w-56 text-sm text-muted-foreground">{f.label}</label>
            <input
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              className="w-28 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button onClick={() => save(f.key)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Save
            </button>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tapeEnabled} onChange={(e) => toggleTapeEnabled(e.target.checked)} />
          Offer double-face tape at checkout
        </label>
      </div>

      <div className="mt-10 max-w-md border-t border-border pt-8">
        <FeatureFlagsSection />
      </div>

      <div className="mt-10 max-w-md border-t border-border pt-8">
        <StorefrontConfigSection />
      </div>

      <div className="mt-10 max-w-md border-t border-border pt-8">
        <AppearanceSection />
      </div>
    </div>
  );
}

function StorefrontConfigSection() {
  const [gridMode, setGridMode] = useState<GridDisplayMode>(GRID_DISPLAY_MODE_DEFAULT);
  const [postOrderMsg, setPostOrderMsg] = useState(true);
  const [photo4x6, setPhoto4x6] = useState<Photo4x6Config>(PHOTO_4X6_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const rows = (await getAllSiteSettingsAdmin()) as Array<{ key: string; value: unknown }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const gm = map.get(GRID_DISPLAY_MODE_KEY);
    setGridMode(
      typeof gm === "string" && ["black", "white", "wood"].includes(gm)
        ? (gm as GridDisplayMode)
        : GRID_DISPLAY_MODE_DEFAULT,
    );
    setPostOrderMsg(parsePostOrderMessageEnabled(map.get(POST_ORDER_MESSAGE_ENABLED_KEY)));
    setPhoto4x6(parsePhoto4x6(map.get(PHOTO_4X6_KEY)));
    setLoaded(true);
  };
  useEffect(() => {
    load();
  }, []);

  const saveGridMode = async (mode: GridDisplayMode) => {
    setGridMode(mode);
    try {
      await setSiteSetting({ data: { key: GRID_DISPLAY_MODE_KEY, value: mode } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const savePostOrderMsg = async (enabled: boolean) => {
    setPostOrderMsg(enabled);
    try {
      await setSiteSetting({ data: { key: POST_ORDER_MESSAGE_ENABLED_KEY, value: enabled } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const savePhoto4x6 = async (next: Photo4x6Config) => {
    setPhoto4x6(next);
    try {
      await setSiteSetting({ data: { key: PHOTO_4X6_KEY, value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const updatePackage = (index: number, patch: Partial<Photo4x6Package>) => {
    const packages = photo4x6.packages.map((p, i) => (i === index ? { ...p, ...patch } : p));
    savePhoto4x6({ ...photo4x6, packages });
  };

  const removePackage = (index: number) => {
    savePhoto4x6({ ...photo4x6, packages: photo4x6.packages.filter((_, i) => i !== index) });
  };

  const addPackage = () => {
    savePhoto4x6({
      ...photo4x6,
      packages: [...photo4x6.packages, { key: `p${Date.now()}`, photos: 8, price: 80, label: "8 Photos 4×6" }],
    });
  };

  if (!loaded) return <LoadingForm />;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Storefront config</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Settings the storefront reads live that previously had no admin control.
        </p>
      </div>

      <div>
        <label className="block text-sm text-muted-foreground">
          Default frame color shown in product grids
        </label>
        <select
          value={gridMode}
          onChange={(e) => saveGridMode(e.target.value as GridDisplayMode)}
          className="mt-1 rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="black">Black</option>
          <option value="white">White</option>
          <option value="wood">Wood</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={postOrderMsg} onChange={(e) => savePostOrderMsg(e.target.checked)} />
        Show the "order received" success message after checkout
      </label>

      <div>
        <h3 className="text-sm font-semibold">4×6 Photo Printing</h3>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.enabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.aiEnhanceEnabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, aiEnhanceEnabled: e.target.checked })}
          />
          Offer AI enhancement
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.aiSuitEnabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, aiSuitEnabled: e.target.checked })}
          />
          Offer AI suit conversion
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.upsellEnabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, upsellEnabled: e.target.checked })}
          />
          Show as an upsell after regular checkout
        </label>

        <div className="mt-3 space-y-2">
          {photo4x6.packages.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2">
              <input
                value={p.label}
                onChange={(e) => updatePackage(i, { label: e.target.value })}
                placeholder="Label"
                className="w-40 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                min={1}
                value={p.photos}
                onChange={(e) => updatePackage(i, { photos: Number(e.target.value) || 1 })}
                placeholder="Photos"
                className="w-20 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                min={0}
                value={p.price}
                onChange={(e) => updatePackage(i, { price: Number(e.target.value) || 0 })}
                placeholder="Price (EGP)"
                className="w-24 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button onClick={() => removePackage(i)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
          ))}
          <button onClick={addPackage} className="rounded-sm border border-border px-3 py-1.5 text-xs">
            + Add package
          </button>
        </div>
      </div>
    </div>
  );
}

const FLAG_TOGGLES: { key: keyof PerformanceFlags; label: string; hint?: string }[] = [
  { key: "safe_mode", label: "Safe mode", hint: "Forces conservative defaults across the whole site" },
  { key: "emergency_fast_mode", label: "Emergency fast mode", hint: "Smallest public payload, no slow personal rails" },
  { key: "pause_heavy_jobs", label: "Pause heavy jobs", hint: "Blocks bulk AI SEO / image-variant jobs" },
  { key: "disable_preloader", label: "Disable preloader" },
  { key: "disable_social_proof", label: "Disable social proof popups" },
  { key: "disable_floating_offer", label: "Disable floating offer bubble" },
  { key: "whatsapp_enabled", label: "WhatsApp button" },
  { key: "assistant_enabled", label: "AI assistant button" },
  { key: "offers_enabled", label: "Today's Offers bubble" },
  { key: "collapse_tools_mobile", label: "Collapse tools on mobile" },
];

// Raw parse (no SAFE_MODE_OVERRIDES/EMERGENCY_FAST_OVERRIDES applied) so
// each toggle in this editor reflects and edits exactly what's stored —
// the storefront-facing usePerformanceFlags() is the one that applies
// those overrides at read time.
function parsePerfFlagsRaw(raw: unknown): PerformanceFlags {
  const base = { ...PERFORMANCE_DEFAULTS };
  if (raw && typeof raw === "object") {
    Object.assign(base, raw as Partial<PerformanceFlags>);
  }
  return base;
}

function FeatureFlagsSection() {
  const [flags, setFlags] = useState<PerformanceFlags | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const settings = await getAllSiteSettingsAdmin();
    const row = (settings as Array<{ key: string; value: unknown }>).find(
      (r) => r.key === "performance_flags",
    );
    setFlags(parsePerfFlagsRaw(row?.value));
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (next: PerformanceFlags) => {
    setFlags(next);
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: "performance_flags", value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (flags === null) return <LoadingForm />;

  return (
    <div>
      <h2 className="text-lg font-semibold">Feature flags</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Emergency levers to stabilise the site without a code deploy.
      </p>
      <div className="mt-4 space-y-2">
        {FLAG_TOGGLES.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 rounded-sm border border-border p-2.5">
            <span>
              <span className="block text-sm">{f.label}</span>
              {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
            </span>
            <input
              type="checkbox"
              checked={Boolean(flags[f.key])}
              disabled={saving}
              onChange={(e) => save({ ...flags, [f.key]: e.target.checked })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function AppearanceSection() {
  const { mode } = useAdminTheme();

  return (
    <div>
      <h2 className="text-lg font-semibold">Appearance</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Admin theme — this only changes how the dashboard looks in your browser, not the
        storefront. The website's own theme editor (brand colors, draft/publish, versioning)
        is a separate, larger piece of work that hasn't been built yet.
      </p>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-sm border border-border p-3">
        <div>
          <span className="block text-sm">Admin theme</span>
          <span className="block text-xs text-muted-foreground">
            {mode === "system" ? "Follows your OS setting" : mode === "light" ? "Always light" : "Always dark"}
          </span>
        </div>
        <AdminThemeToggle />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto rounded-sm border border-border bg-muted/30 p-3">
        <div className="flex min-w-24 flex-col items-center gap-1">
          <div className="h-10 w-full rounded-sm border border-border bg-background" />
          <span className="text-[10px] text-muted-foreground">Background</span>
        </div>
        <div className="flex min-w-24 flex-col items-center gap-1">
          <div className="h-10 w-full rounded-sm border border-border bg-card" />
          <span className="text-[10px] text-muted-foreground">Card</span>
        </div>
        <div className="flex min-w-24 flex-col items-center gap-1">
          <div className="h-10 w-full rounded-sm bg-primary" />
          <span className="text-[10px] text-muted-foreground">Primary</span>
        </div>
        <div className="flex min-w-24 flex-col items-center gap-1">
          <div className="h-10 w-full rounded-sm bg-accent" />
          <span className="text-[10px] text-muted-foreground">Accent</span>
        </div>
        <div className="flex min-w-24 flex-col items-center gap-1">
          <div className="h-10 w-full rounded-sm border-2 border-ring" />
          <span className="text-[10px] text-muted-foreground">Ring</span>
        </div>
      </div>
    </div>
  );
}
