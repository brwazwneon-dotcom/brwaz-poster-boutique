import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getAllSiteSettingsAdmin, setSiteSetting, listPostersAdmin } from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import {
  MOCKUP_DEFAULTS,
  MOCKUP_KEYS,
  parseMockup,
  type FrameMockup,
  type FrameMockups,
} from "@/lib/use-settings";
import { fileToDataUrl, type AdminPoster } from "./shared";

export const MOCKUP_COLORS: Array<keyof FrameMockups> = ["black", "white", "wood"];

function MockupArtworkPreview({ mockup, posterUrl }: { mockup: FrameMockup; posterUrl: string }) {
  const skewX = mockup.skewX ?? 0;
  const skewY = mockup.skewY ?? 0;
  const rotateX = mockup.rotateX ?? 0;
  const rotateY = mockup.rotateY ?? 0;
  const perspective = Math.max(200, mockup.perspective ?? 1000);
  const transform = [
    rotateX ? `rotateX(${rotateX}deg)` : "",
    rotateY ? `rotateY(${rotateY}deg)` : "",
    mockup.rotate ? `rotate(${mockup.rotate}deg)` : "",
    skewX ? `skewX(${skewX}deg)` : "",
    skewY ? `skewY(${skewY}deg)` : "",
    `scale(${(mockup.scale ?? 1) * (mockup.flipX ? -1 : 1)}, ${(mockup.scale ?? 1) * (mockup.flipY ? -1 : 1)})`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden">
      <div
        className="absolute z-0 overflow-hidden"
        style={{
          top: `${mockup.top}%`,
          left: `${mockup.left}%`,
          width: `${mockup.width}%`,
          height: `${mockup.height}%`,
          borderRadius: `${mockup.borderRadius ?? 0}%`,
          perspective: `${perspective}px`,
        }}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            className="block h-full w-full object-cover object-center"
            style={{ transform, transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
          />
        )}
      </div>
      {mockup.image && (
        <img src={mockup.image} alt="" className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill" />
      )}
    </div>
  );
}

const MOCKUP_NUMBER_FIELDS: Array<{ key: keyof FrameMockup; label: string; step?: number; min?: number; max?: number }> = [
  { key: "top", label: "Top (%)", step: 0.1 },
  { key: "left", label: "Left (%)", step: 0.1 },
  { key: "width", label: "Width (%)", step: 0.1 },
  { key: "height", label: "Height (%)", step: 0.1 },
  { key: "rotate", label: "Rotate (deg)", step: 0.5 },
  { key: "skewX", label: "Skew X (deg)", step: 0.5 },
  { key: "skewY", label: "Skew Y (deg)", step: 0.5 },
  { key: "rotateX", label: "3D tilt X (deg)", step: 0.5 },
  { key: "rotateY", label: "3D tilt Y (deg)", step: 0.5 },
  { key: "scale", label: "Scale", step: 0.01 },
  { key: "perspective", label: "Perspective (px)", step: 10 },
  { key: "borderRadius", label: "Corner radius (%)", step: 0.5 },
];

export function FrameMockupsTab() {
  const [color, setColor] = useState<keyof FrameMockups>("black");
  const [mockups, setMockups] = useState<FrameMockups | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [settings, posters] = await Promise.all([
      getAllSiteSettingsAdmin(),
      listPostersAdmin({ data: {} }),
    ]);
    const rows = settings as Array<{ key: string; value: unknown }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    setMockups({
      black: parseMockup(map.get(MOCKUP_KEYS.black), MOCKUP_DEFAULTS.black),
      white: parseMockup(map.get(MOCKUP_KEYS.white), MOCKUP_DEFAULTS.white),
      wood: parseMockup(map.get(MOCKUP_KEYS.wood), MOCKUP_DEFAULTS.wood),
    });
    const withImage = (posters as AdminPoster[]).find((p) => p.image_url);
    if (withImage) setSampleUrl(withImage.image_url);
  };
  useEffect(() => {
    load();
  }, []);

  const current = mockups?.[color];

  const update = (patch: Partial<FrameMockup>) => {
    if (!mockups) return;
    setMockups({ ...mockups, [color]: { ...mockups[color], ...patch } });
  };

  const save = async () => {
    if (!mockups) return;
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: MOCKUP_KEYS[color], value: mockups[color] } });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => update({ ...MOCKUP_DEFAULTS[color] });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.9 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      update({ image: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (mockups === null || !current) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold">Frame mockups</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Controls exactly where and how the product photo sits inside each frame mockup photo.
      </p>

      <div className="mt-4 flex gap-1">
        {MOCKUP_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`rounded-sm border px-3 py-1.5 text-xs capitalize ${
              color === c ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-6 sm:grid-cols-[220px_1fr]">
        <div>
          <MockupArtworkPreview mockup={current} posterUrl={sampleUrl} />
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Live preview (sample product photo)</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Mockup photo</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={current.image}
                onChange={(e) => update({ image: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 rounded-sm border border-border px-3 py-2 text-xs disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MOCKUP_NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="text-xs text-muted-foreground">
                {f.label}
                <input
                  type="number"
                  step={f.step ?? 1}
                  value={(current[f.key] as number | undefined) ?? 0}
                  onChange={(e) => update({ [f.key]: Number(e.target.value) } as Partial<FrameMockup>)}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(current.flipX)} onChange={(e) => update({ flipX: e.target.checked })} />
              Flip horizontal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(current.flipY)} onChange={(e) => update({ flipY: e.target.checked })} />
              Flip vertical
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={current.enabled !== false}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
              Enabled on storefront
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={resetToDefault} className="rounded-sm border border-border px-4 py-2 text-xs">
              Reset to default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
