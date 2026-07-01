import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Save, ShieldCheck, Trash2, Upload, Wrench, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_MAINTENANCE,
  MAINTENANCE_KEY,
  normalizeMaintenance,
  type MaintenanceConfig,
} from "@/lib/maintenance";
import { uploadAndSign } from "@/lib/storage-url";
import { notifyMaintenanceToggle } from "@/lib/maintenance.functions";
import { createBackupServer } from "@/lib/backups.functions";

export function MaintenanceTab() {
  const qc = useQueryClient();
  const notify = useServerFn(notifyMaintenanceToggle);
  const createBackup = useServerFn(createBackupServer);

  const [cfg, setCfg] = useState<MaintenanceConfig>(DEFAULT_MAINTENANCE);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [uploading, setUploading] = useState<null | "image" | "video">(null);
  const [newEmail, setNewEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-maintenance"],
    queryFn: async (): Promise<MaintenanceConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", MAINTENANCE_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeMaintenance(data?.value);
    },
  });

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  const persist = async (next: MaintenanceConfig) => {
    const { error } = await supabase.from("site_settings").upsert({
      key: MAINTENANCE_KEY,
      value: next as never,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["maintenance-mode"] });
    qc.invalidateQueries({ queryKey: ["admin-maintenance"] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await persist(cfg);
      toast.success("Maintenance settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      // Safety backup before enabling
      if (enabled) {
        try {
          await createBackup({ data: { type: "safety", note: "Pre-maintenance safety backup" } });
        } catch (e) {
          console.warn("Safety backup skipped:", e);
        }
      }
      const next = { ...cfg, enabled };
      await persist(next);
      setCfg(next);
      try {
        await notify({ data: { enabled } });
      } catch { /* notification failure is non-blocking */ }
      toast.success(enabled ? "Maintenance mode ENABLED" : "Website is LIVE");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setToggling(false);
    }
  };

  const emergencyDisable = async () => {
    if (!window.confirm("Immediately disable Maintenance Mode?")) return;
    await toggle(false);
  };

  const uploadFile = async (file: File, kind: "image" | "video") => {
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `maintenance/${kind}-${Date.now()}.${ext}`;
      const url = await uploadAndSign("slider", path, file);
      setCfg((c) => ({
        ...c,
        backgroundImage: kind === "image" ? url : c.backgroundImage,
        backgroundVideo: kind === "video" ? url : c.backgroundVideo,
      }));
      toast.success(`${kind === "image" ? "Image" : "Video"} uploaded — remember to Save`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    setCfg((c) => ({ ...c, whitelistEmails: Array.from(new Set([...c.whitelistEmails, e])) }));
    setNewEmail("");
  };

  const removeEmail = (email: string) =>
    setCfg((c) => ({ ...c, whitelistEmails: c.whitelistEmails.filter((x) => x !== email) }));

  if (isLoading)
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  const isLive = !cfg.enabled;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Big status toggle */}
      <div
        className={
          "rounded-sm border p-6 " +
          (isLive
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-red-500/40 bg-red-500/5")
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={
                "flex h-14 w-14 items-center justify-center rounded-full " +
                (isLive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")
              }
            >
              {isLive ? <ShieldCheck className="h-7 w-7" /> : <Wrench className="h-7 w-7" />}
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Current status
              </div>
              <div className="text-display text-3xl">
                {isLive ? "🟢 Website Online" : "🔴 Maintenance Mode"}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {isLive ? (
              <button
                onClick={() => toggle(true)}
                disabled={toggling}
                className="inline-flex items-center gap-2 rounded-sm bg-red-600 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                Enable Maintenance
              </button>
            ) : (
              <>
                <button
                  onClick={() => toggle(false)}
                  disabled={toggling}
                  className="inline-flex items-center gap-2 rounded-sm bg-emerald-600 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Go Live
                </button>
                <button
                  onClick={emergencyDisable}
                  disabled={toggling}
                  className="inline-flex items-center gap-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50"
                  title="Emergency disable"
                >
                  <Zap className="h-4 w-4" /> Emergency
                </button>
              </>
            )}
          </div>
        </div>
        {!isLive && (
          <p className="mt-4 flex items-center gap-2 text-xs text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Public visitors see the maintenance page. Admins & whitelisted users bypass automatically.
          </p>
        )}
      </div>

      {/* Copy */}
      <section className="rounded-sm border border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest">Page copy</h3>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Title</span>
          <input
            value={cfg.title}
            onChange={(e) => setCfg((c) => ({ ...c, title: e.target.value }))}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Subtitle</span>
          <textarea
            value={cfg.subtitle}
            onChange={(e) => setCfg((c) => ({ ...c, subtitle: e.target.value }))}
            rows={3}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>
      </section>

      {/* Countdown */}
      <section className="rounded-sm border border-border bg-card p-6 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest">Countdown</h3>
        <p className="text-xs text-muted-foreground">
          Leave empty to hide the countdown.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="datetime-local"
            value={cfg.endTime ? toLocalInput(cfg.endTime) : ""}
            onChange={(e) =>
              setCfg((c) => ({
                ...c,
                endTime: e.target.value ? new Date(e.target.value).toISOString() : null,
              }))
            }
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          {cfg.endTime && (
            <button
              onClick={() => setCfg((c) => ({ ...c, endTime: null }))}
              className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Background */}
      <section className="rounded-sm border border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest">Background</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadField
            label="Background image"
            url={cfg.backgroundImage}
            accept="image/*"
            busy={uploading === "image"}
            onFile={(f) => uploadFile(f, "image")}
            onClear={() => setCfg((c) => ({ ...c, backgroundImage: null }))}
            kind="image"
          />
          <UploadField
            label="Background video (optional)"
            url={cfg.backgroundVideo}
            accept="video/mp4,video/webm"
            busy={uploading === "video"}
            onFile={(f) => uploadFile(f, "video")}
            onClear={() => setCfg((c) => ({ ...c, backgroundVideo: null }))}
            kind="video"
          />
        </div>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Overlay opacity: {Math.round(cfg.overlayOpacity * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(cfg.overlayOpacity * 100)}
            onChange={(e) => setCfg((c) => ({ ...c, overlayOpacity: Number(e.target.value) / 100 }))}
            className="w-full"
          />
        </label>
      </section>

      {/* Buttons */}
      <section className="rounded-sm border border-border bg-card p-6 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest">Buttons</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["contactLabel", "contactHref", "Contact"],
              ["whatsappLabel", "whatsappHref", "WhatsApp"],
              ["instagramLabel", "instagramHref", "Instagram"],
              ["facebookLabel", "facebookHref", "Facebook"],
            ] as const
          ).map(([lk, hk, name]) => (
            <div key={name} className="rounded-sm border border-border bg-background p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{name}</div>
              <input
                value={cfg.buttons[lk]}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, buttons: { ...c.buttons, [lk]: e.target.value } }))
                }
                placeholder="Label"
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none"
              />
              <input
                value={cfg.buttons[hk]}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, buttons: { ...c.buttons, [hk]: e.target.value } }))
                }
                placeholder="URL"
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Whitelist */}
      <section className="rounded-sm border border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest">Access whitelist</h3>
        <p className="text-xs text-muted-foreground">
          Admins always bypass. Below adds extra access. Whitelisted emails must be signed in. The
          bypass password can be shared as a link: <code>?bypass=&lt;password&gt;</code>.
        </p>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Bypass password
          </span>
          <input
            value={cfg.bypassPassword}
            onChange={(e) => setCfg((c) => ({ ...c, bypassPassword: e.target.value }))}
            placeholder="Leave empty to disable"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Whitelisted emails
          </div>
          <div className="flex flex-wrap gap-2">
            {cfg.whitelistEmails.map((e) => (
              <span
                key={e}
                className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-1 text-xs"
              >
                {e}
                <button
                  onClick={() => removeEmail(e)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
            {cfg.whitelistEmails.length === 0 && (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmail();
                }
              }}
            />
            <button
              onClick={addEmail}
              className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              Add
            </button>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function UploadField({
  label,
  url,
  accept,
  busy,
  onFile,
  onClear,
  kind,
}: {
  label: string;
  url: string | null;
  accept: string;
  busy: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  kind: "image" | "video";
}) {
  return (
    <div className="rounded-sm border border-border bg-background p-3 space-y-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="flex h-32 items-center justify-center overflow-hidden rounded-sm border border-dashed border-border bg-black/30">
        {url ? (
          kind === "video" ? (
            <video src={url} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img src={url} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="text-xs text-muted-foreground">No file</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {url && (
          <button
            onClick={onClear}
            className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}