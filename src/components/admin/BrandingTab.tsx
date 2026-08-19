import { createElement, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Upload, ExternalLink, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_BRANDING,
  type BrandingConfig,
  useBranding,
  useSaveBranding,
} from "@/lib/branding";

type Row = {
  key: keyof Pick<
    BrandingConfig,
    "headerDesktop" | "headerMobile" | "footerDesktop" | "footerMobile" | "maintenance" | "pwa"
  >;
  label: string;
  min: number;
  max: number;
  help: string;
};

function LogoImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return createElement("img", props);
}

const ROWS: Row[] = [
  {
    key: "headerDesktop",
    label: "Desktop header logo",
    min: 40,
    max: 300,
    help: "Height on desktop header (px).",
  },
  {
    key: "headerMobile",
    label: "Mobile header logo",
    min: 30,
    max: 200,
    help: "Height on mobile header (px).",
  },
  {
    key: "footerDesktop",
    label: "Desktop footer logo",
    min: 40,
    max: 250,
    help: "Height in footer on desktop (px).",
  },
  {
    key: "footerMobile",
    label: "Mobile footer logo",
    min: 30,
    max: 200,
    help: "Height in footer on mobile (px).",
  },
  {
    key: "maintenance",
    label: "Maintenance page logo",
    min: 40,
    max: 400,
    help: "Logo height on the maintenance page (px).",
  },
  {
    key: "pwa",
    label: "PWA app logo",
    min: 64,
    max: 512,
    help: "Square icon size for install/PWA reference (px).",
  },
];

export function BrandingTab() {
  const server = useBranding();
  const save = useSaveBranding();
  const [draft, setDraft] = useState<BrandingConfig>(server);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Keep local draft in sync when server data first loads / changes externally.
  useEffect(() => {
    setDraft(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    server.logoUrl,
    server.keepAspect,
    server.headerDesktop,
    server.headerMobile,
    server.footerDesktop,
    server.footerMobile,
    server.maintenance,
    server.pwa,
  ]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(server), [draft, server]);

  const setField = <K extends keyof BrandingConfig>(k: K, v: BrandingConfig[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const onUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `branding/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("public-assets")
        .upload(path, file, { upsert: true, cacheControl: "31536000", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
      // Read intrinsic ratio.
      const ratio = await new Promise<number | null>((resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve(
            img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null,
          );
        img.onerror = () => resolve(null);
        img.src = data.publicUrl;
      });
      setDraft((d) => ({ ...d, logoUrl: data.publicUrl, aspectRatio: ratio }));
      toast.success("Logo uploaded. Click Save to apply.");
    } catch (e) {
      console.error(e);
      toast.error("Upload failed. If the bucket is missing, use an image URL instead.");
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await save(draft);
      toast.success("Branding saved.");
    } catch (e) {
      console.error(e);
      toast.error("Could not save branding.");
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setDraft({ ...DEFAULT_BRANDING, logoUrl: draft.logoUrl, aspectRatio: draft.aspectRatio });
    toast.info("Sizes reset to defaults. Click Save to apply.");
  };

  const previewHeight = device === "desktop" ? draft.headerDesktop : draft.headerMobile;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-8">
        <section className="rounded-sm border border-border p-5">
          <h2 className="text-display text-2xl">Branding Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the site logo and its size across header, footer, maintenance and PWA surfaces.
          </p>
        </section>

        <section className="rounded-sm border border-border p-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Logo image
          </h3>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-32 w-48 items-center justify-center rounded-sm border border-dashed border-border bg-neutral-950">
              {draft.logoUrl ? (
                <LogoImage
                  src={draft.logoUrl}
                  alt="Current logo"
                  className="max-h-28 max-w-44 object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload logo
                </button>
                <a
                  href={draft.logoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="logo-url"
                  className="text-xs uppercase tracking-widest text-muted-foreground"
                >
                  Or paste image URL
                </Label>
                <Input
                  id="logo-url"
                  value={draft.logoUrl}
                  onChange={(e) => setField("logoUrl", e.target.value)}
                  placeholder="https://…/logo.png"
                />
              </div>
              <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Keep aspect ratio</div>
                  <div className="text-xs text-muted-foreground">
                    Prevents stretching. Width scales automatically from height.
                  </div>
                </div>
                <Switch
                  checked={draft.keepAspect}
                  onCheckedChange={(v) => setField("keepAspect", v)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-sm border border-border p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Sizes
            </h3>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
          </div>
          <div className="mt-4 grid gap-6">
            {ROWS.map((r) => (
              <div key={r.key} className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">{r.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="h-8 w-20 text-right"
                      min={r.min}
                      max={r.max}
                      value={draft[r.key]}
                      onChange={(e) => setField(r.key, Number(e.target.value) as never)}
                    />
                    <span className="text-xs text-muted-foreground">px</span>
                  </div>
                </div>
                <Slider
                  value={[draft[r.key]]}
                  min={r.min}
                  max={r.max}
                  step={1}
                  onValueChange={(v) => setField(r.key, v[0] as never)}
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{r.help}</span>
                  <span>
                    {r.min}–{r.max}px
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraft(server)}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-sm border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save branding
          </button>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-sm border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Live preview
            </h3>
            <div className="flex overflow-hidden rounded-sm border border-border text-[10px] uppercase tracking-widest">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={
                    "px-3 py-1 " +
                    (device === d ? "bg-primary text-primary-foreground" : "hover:bg-accent")
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <PreviewBlock label="Header" bg="bg-background border-b border-border">
              <LogoImage
                src={draft.logoUrl}
                alt="Preview"
                style={{
                  height: `${previewHeight}px`,
                  width: draft.keepAspect ? "auto" : undefined,
                  maxWidth: "100%",
                  objectFit: "contain",
                }}
              />
            </PreviewBlock>
            <PreviewBlock label="Footer" bg="bg-neutral-950 border border-border">
              <LogoImage
                src={draft.logoUrl}
                alt="Preview"
                style={{
                  height: `${device === "desktop" ? draft.footerDesktop : draft.footerMobile}px`,
                  width: draft.keepAspect ? "auto" : undefined,
                  maxWidth: "100%",
                  objectFit: "contain",
                }}
              />
            </PreviewBlock>
            <PreviewBlock label="Maintenance" bg="bg-black">
              <LogoImage
                src={draft.logoUrl}
                alt="Preview"
                style={{
                  height: `${draft.maintenance}px`,
                  width: draft.keepAspect ? "auto" : undefined,
                  maxWidth: "100%",
                  objectFit: "contain",
                }}
              />
            </PreviewBlock>
            <PreviewBlock label="PWA icon" bg="bg-neutral-900">
              <div
                className="flex items-center justify-center rounded-2xl bg-white"
                style={{ width: Math.min(draft.pwa, 128), height: Math.min(draft.pwa, 128) }}
              >
                <LogoImage
                  src={draft.logoUrl}
                  alt="Preview"
                  className="max-h-[75%] max-w-[75%] object-contain"
                />
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Rendered at {Math.min(draft.pwa, 128)}px (target {draft.pwa}px)
              </div>
            </PreviewBlock>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Preview as Client</span>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              Open homepage <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PreviewBlock({
  label,
  bg,
  children,
}: {
  label: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`flex min-h-16 items-center justify-center rounded-sm px-4 py-5 ${bg}`}>
        {children}
      </div>
    </div>
  );
}
