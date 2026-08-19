import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Crop, ZoomIn, ZoomOut, Move, Maximize, Minimize, RotateCcw, Wand2, X } from "lucide-react";
import {
  DEFAULT_EDIT_SETTINGS,
  type EditSettings,
  type ExtendMode,
  loadImage,
  normalizeEditSettings,
  renderEditTo,
} from "@/lib/poster-edit";
import { cn } from "@/lib/utils";

type Props = {
  /** Source image — URL or File. */
  source: string | File;
  /** Initial settings (e.g. from poster.edit_settings). */
  initial?: unknown;
  /** Final printable ratio. Defaults to 2:3 for posters. */
  ratio?: number;
  onCancel: () => void;
  onSave: (settings: EditSettings) => void;
  saving?: boolean;
};

const PREVIEW_H = 520; // px, fixed live preview height

export function PosterImageEditor({
  source,
  initial,
  ratio = 2 / 3,
  onCancel,
  onSave,
  saving,
}: Props) {
  const [settings, setSettings] = useState<EditSettings>(() => ({
    ...normalizeEditSettings(initial),
    ratio,
  }));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);

  // Resolve source → HTMLImageElement.
  useEffect(() => {
    let cancelled = false;
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    if (typeof source !== "string") objectUrlRef.current = url;
    setLoading(true);
    loadImage(url)
      .then((i) => {
        if (!cancelled) {
          setImg(i);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load image");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [source]);

  const previewW = Math.round(PREVIEW_H * ratio);

  // Re-render preview whenever settings or image change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    renderEditTo(c, img, settings, previewW, PREVIEW_H);
  }, [img, settings, previewW]);

  const update = (patch: Partial<EditSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  const reset = () =>
    setSettings({ ...DEFAULT_EDIT_SETTINGS, ratio, extendMode: settings.extendMode });

  // Pan via drag on the preview canvas.
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      ox: e.clientX,
      oy: e.clientY,
      sx: settings.offsetX,
      sy: settings.offsetY,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.ox) / previewW;
    const dy = (e.clientY - dragRef.current.oy) / PREVIEW_H;
    update({
      offsetX: Math.max(-1.5, Math.min(1.5, dragRef.current.sx + dx)),
      offsetY: Math.max(-1.5, Math.min(1.5, dragRef.current.sy + dy)),
      fit: "custom",
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
    update({
      zoom: Math.max(0.2, Math.min(5, settings.zoom * factor)),
      fit: "custom",
    });
  };

  const extendOptions: { id: ExtendMode; label: string }[] = useMemo(
    () => [
      { id: "blur", label: "Blurred" },
      { id: "mirror", label: "Mirrored" },
      { id: "edge", label: "Edge color" },
      { id: "none", label: "Black" },
    ],
    [],
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <div className="relative grid w-full max-w-5xl gap-4 rounded-sm border border-border bg-card p-4 sm:p-6 md:grid-cols-[auto_1fr]">
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 z-10 rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Live preview */}
        <div className="flex flex-col items-center gap-2">
          <div
            ref={stageRef}
            className="relative overflow-hidden rounded-sm bg-black"
            style={{ width: previewW, height: PREVIEW_H, maxWidth: "100%" }}
          >
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                Loading image…
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                width={previewW}
                height={PREVIEW_H}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onWheel={onWheel}
                className="h-full w-full cursor-move touch-none select-none"
              />
            )}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10" />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Drag to move · Scroll to zoom · Ratio 2:3
          </div>
        </div>

        {/* Controls */}
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <h3 className="text-display text-2xl">Edit Artwork</h3>

          <Section title="Fit" icon={<Crop className="h-3.5 w-3.5" />}>
            <ToolButton
              active={settings.fit === "fit"}
              onClick={() =>
                update({ fit: "fit", zoom: 1, offsetX: 0, offsetY: 0, stretchX: 1, stretchY: 1 })
              }
              icon={<Minimize className="h-3.5 w-3.5" />}
            >
              Fit to frame
            </ToolButton>
            <ToolButton
              active={settings.fit === "fill"}
              onClick={() =>
                update({ fit: "fill", zoom: 1, offsetX: 0, offsetY: 0, stretchX: 1, stretchY: 1 })
              }
              icon={<Maximize className="h-3.5 w-3.5" />}
            >
              Fill frame
            </ToolButton>
            <ToolButton onClick={reset} icon={<RotateCcw className="h-3.5 w-3.5" />}>
              Reset
            </ToolButton>
          </Section>

          <Section title="Zoom" icon={<ZoomIn className="h-3.5 w-3.5" />}>
            <div className="flex items-center gap-2">
              <IconBtn
                onClick={() => update({ zoom: Math.max(0.2, settings.zoom / 1.1), fit: "custom" })}
                aria="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </IconBtn>
              <input
                type="range"
                min={0.2}
                max={5}
                step={0.01}
                value={settings.zoom}
                onChange={(e) => update({ zoom: Number(e.target.value), fit: "custom" })}
                className="flex-1 accent-primary"
              />
              <IconBtn
                onClick={() => update({ zoom: Math.min(5, settings.zoom * 1.1), fit: "custom" })}
                aria="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </IconBtn>
              <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">
                {settings.zoom.toFixed(2)}×
              </span>
            </div>
          </Section>

          <Section title="Move (offset)" icon={<Move className="h-3.5 w-3.5" />}>
            <RangeRow
              label="Horizontal"
              min={-1}
              max={1}
              step={0.01}
              value={settings.offsetX}
              onChange={(v) => update({ offsetX: v, fit: "custom" })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <RangeRow
              label="Vertical"
              min={-1}
              max={1}
              step={0.01}
              value={settings.offsetY}
              onChange={(v) => update({ offsetY: v, fit: "custom" })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Section>

          <Section title="Stretch">
            <RangeRow
              label="Horizontal"
              min={0.5}
              max={2}
              step={0.01}
              value={settings.stretchX}
              onChange={(v) => update({ stretchX: v, fit: "custom" })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <RangeRow
              label="Vertical"
              min={0.5}
              max={2}
              step={0.01}
              value={settings.stretchY}
              onChange={(v) => update({ stretchY: v, fit: "custom" })}
              format={(v) => `${v.toFixed(2)}×`}
            />
          </Section>

          <Section title="Extend background" icon={<Wand2 className="h-3.5 w-3.5" />}>
            <div className="flex flex-wrap gap-1.5">
              {extendOptions.map((opt) => (
                <ToolButton
                  key={opt.id}
                  active={settings.extendMode === opt.id}
                  onClick={() => update({ extendMode: opt.id })}
                >
                  {opt.label}
                </ToolButton>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Fills the empty area when the artwork doesn't cover the full frame. AI generative fill
              coming soon — these fallbacks run instantly in your browser.
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              <SideBtn onClick={() => update({ offsetY: settings.offsetY + 0.05, fit: "custom" })}>
                ↑ Top
              </SideBtn>
              <SideBtn onClick={() => update({ offsetY: settings.offsetY - 0.05, fit: "custom" })}>
                ↓ Bottom
              </SideBtn>
              <SideBtn onClick={() => update({ offsetX: settings.offsetX + 0.05, fit: "custom" })}>
                ← Left
              </SideBtn>
              <SideBtn onClick={() => update({ offsetX: settings.offsetX - 0.05, fit: "custom" })}>
                → Right
              </SideBtn>
            </div>
          </Section>

          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button
              onClick={onCancel}
              className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(settings)}
              disabled={saving || loading}
              className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save artwork"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-widest transition",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function IconBtn({
  onClick,
  aria,
  children,
}: {
  onClick: () => void;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="rounded-sm border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function SideBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">
        {format(value)}
      </span>
    </div>
  );
}
