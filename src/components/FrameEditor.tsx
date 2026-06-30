import { useCallback, useEffect, useRef, useState } from "react";
import { FramePreview } from "@/components/FramePreview";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EDIT_SETTINGS,
  normalizeEditSettings,
  type EditSettings,
} from "@/lib/poster-edit";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Move,
} from "lucide-react";

type Props = {
  posterUrl: string;
  title?: string;
  frameType: FrameTypeId;
  color: FrameColorId;
  value?: EditSettings;
  onChange: (v: EditSettings) => void;
  className?: string;
};

/**
 * Pure CSS frame editor. The customer can drag / zoom / rotate / fit / fill /
 * stretch the poster inside the printable area. No canvas, no image processing.
 * All edits are stored as transform parameters and replayed by FramePreview.
 */
export function FrameEditor({
  posterUrl,
  title,
  frameType,
  color,
  value,
  onChange,
  className,
}: Props) {
  const [s, setS] = useState<EditSettings>(() =>
    value ? normalizeEditSettings(value) : { ...DEFAULT_EDIT_SETTINGS },
  );
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Sync upstream changes (e.g. reset from parent).
  useEffect(() => {
    if (value) setS(normalizeEditSettings(value));
  }, [value]);

  const update = useCallback(
    (patch: Partial<EditSettings>) => {
      setS((prev) => {
        const next = { ...prev, ...patch };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  // Drag to pan (mouse + touch). Offsets stored as fraction of frame box.
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; w: number; h: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: s.offsetX,
      oy: s.offsetY,
      w: r.width,
      h: r.height,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.w;
    const dy = (e.clientY - d.y) / d.h;
    update({
      offsetX: clamp(d.ox + dx, -1, 1),
      offsetY: clamp(d.oy + dy, -1, 1),
    });
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    update({ zoom: clamp(s.zoom + delta, 0.3, 4) });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={boxRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        className="relative touch-none cursor-grab active:cursor-grabbing"
        style={{ userSelect: "none" }}
      >
        <FramePreview
          posterUrl={posterUrl}
          title={title}
          frameType={frameType}
          color={color}
          editSettings={s}
          loading="eager"
        />
        <div className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Move className="h-3 w-3" /> Drag · scroll to zoom
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ToggleBtn active={s.fit === "fit"} onClick={() => update({ fit: "fit" })}>
          <Minimize2 className="h-3.5 w-3.5" /> Fit
        </ToggleBtn>
        <ToggleBtn active={s.fit === "fill"} onClick={() => update({ fit: "fill" })}>
          <Maximize2 className="h-3.5 w-3.5" /> Fill
        </ToggleBtn>
      </div>

      <SliderRow
        label="Zoom"
        value={s.zoom}
        min={0.3}
        max={4}
        step={0.01}
        onChange={(v) => update({ zoom: v })}
      />
      <SliderRow
        label="Rotate"
        value={s.rotate}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => update({ rotate: v })}
        suffix="°"
        leading={
          <button
            type="button"
            onClick={() => update({ rotate: ((s.rotate - 90) % 360 + 540) % 360 - 180 })}
            className="rounded-sm border border-border p-1 hover:bg-accent"
            aria-label="Rotate left"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        }
        trailing={
          <button
            type="button"
            onClick={() => update({ rotate: ((s.rotate + 90) % 360 + 540) % 360 - 180 })}
            className="rounded-sm border border-border p-1 hover:bg-accent"
            aria-label="Rotate right"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        }
      />
      <SliderRow
        label="Stretch H"
        value={s.stretchX}
        min={0.5}
        max={2}
        step={0.01}
        onChange={(v) => update({ stretchX: v })}
      />
      <SliderRow
        label="Stretch V"
        value={s.stretchY}
        min={0.5}
        max={2}
        step={0.01}
        onChange={(v) => update({ stretchY: v })}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => update({ ...DEFAULT_EDIT_SETTINGS })}
      >
        Reset
      </Button>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-1.5 uppercase tracking-widest transition",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  leading,
  trailing,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <span>{label}</span>
        <span>
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix ?? ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {leading}
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0])}
          className="flex-1"
        />
        {trailing}
      </div>
    </div>
  );
}