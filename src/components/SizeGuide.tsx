import { useMemo, useState } from "react";
import { ChevronDown, Ruler, Sofa, GitCompare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSizeGuide, type SizeGuideItem } from "@/lib/size-guide";

type Tab = "compare-all" | "room" | "compare-two";

/** Collapsible size guide with three tabs: visual comparison, room preview, compare mode. */
export function SizeGuide({ availableIds }: { availableIds?: readonly string[] }) {
  const { t } = useTranslation();
  const cfg = useSizeGuide();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("compare-all");

  const sizes = useMemo(
    () =>
      availableIds && availableIds.length
        ? cfg.sizes.filter((s) => availableIds.includes(s.id))
        : cfg.sizes,
    [cfg.sizes, availableIds],
  );

  const [roomSize, setRoomSize] = useState<string>("");
  const [cmpA, setCmpA] = useState<string>("");
  const [cmpB, setCmpB] = useState<string>("");

  if (!cfg.enabled || sizes.length === 0) return null;

  const activeRoom = sizes.find((s) => s.id === roomSize) ?? sizes[0];
  const a = sizes.find((s) => s.id === cmpA) ?? sizes[Math.min(1, sizes.length - 1)];
  const b = sizes.find((s) => s.id === cmpB) ?? sizes[sizes.length - 1];

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-sm border border-border px-4 py-3 text-xs uppercase tracking-[0.25em] hover:bg-accent"
      >
        <span className="inline-flex items-center gap-2">
          <Ruler className="h-4 w-4" /> {t("nav.sizeGuide")}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-4 rounded-sm border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            <TabBtn active={tab === "compare-all"} onClick={() => setTab("compare-all")}>
              <Ruler className="h-3.5 w-3.5" /> {t("sizeGuide.compareSizes")}
            </TabBtn>
            {cfg.roomEnabled && (
              <TabBtn active={tab === "room"} onClick={() => setTab("room")}>
                <Sofa className="h-3.5 w-3.5" /> {t("sizeGuide.roomPreview")}
              </TabBtn>
            )}
            <TabBtn active={tab === "compare-two"} onClick={() => setTab("compare-two")}>
              <GitCompare className="h-3.5 w-3.5" /> {t("sizeGuide.sideBySide")}
            </TabBtn>
          </div>

          <div className="mt-4">
            {tab === "compare-all" && <CompareAll sizes={sizes} />}
            {tab === "room" && cfg.roomEnabled && (
              <RoomPreview
                sizes={sizes}
                active={activeRoom}
                onPick={setRoomSize}
                roomImageUrl={cfg.roomImageUrl}
                wallWidthCm={cfg.wallWidthCm}
              />
            )}
            {tab === "compare-two" && (
              <CompareTwo sizes={sizes} a={a} b={b} onA={setCmpA} onB={setCmpB} />
            )}
          </div>

          <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("sizeGuide.disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}

function TabBtn({
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
        "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-widest transition",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function CompareAll({ sizes }: { sizes: SizeGuideItem[] }) {
  const maxH = Math.max(...sizes.map((s) => s.height));
  const maxW = Math.max(...sizes.map((s) => s.width));
  const boxMax = 160; // px
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible">
      {sizes.map((s) => {
        const scale = boxMax / Math.max(maxH, maxW);
        const w = Math.round(s.width * scale);
        const h = Math.round(s.height * scale);
        return (
          <div key={s.id} className="snap-start shrink-0 sm:shrink">
            <div
              className="flex items-end justify-center"
              style={{ width: boxMax, height: boxMax }}
            >
              <div
                className="flex items-center justify-center rounded-sm border border-primary/60 bg-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition hover:bg-primary/20"
                style={{ width: w, height: h }}
                title={s.label}
              >
                <span className="text-[10px] uppercase tracking-widest text-foreground/80">
                  {s.width}×{s.height}
                </span>
              </div>
            </div>
            <div className="mt-1 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompareTwo({
  sizes,
  a,
  b,
  onA,
  onB,
}: {
  sizes: SizeGuideItem[];
  a: SizeGuideItem;
  b: SizeGuideItem;
  onA: (id: string) => void;
  onB: (id: string) => void;
}) {
  const { t } = useTranslation();
  const maxDim = Math.max(a.width, a.height, b.width, b.height);
  const boxMax = 200;
  const scale = boxMax / maxDim;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <SizeSelect value={a.id} onChange={onA} sizes={sizes} label={t("sizeGuide.sizeA")} />
        <SizeSelect value={b.id} onChange={onB} sizes={sizes} label={t("sizeGuide.sizeB")} />
      </div>
      <div className="mt-4 flex items-end justify-center gap-8" style={{ minHeight: boxMax + 20 }}>
        <RectPreview item={a} scale={scale} tone="a" />
        <div className="pb-6 text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("sizeGuide.vs")}
        </div>
        <RectPreview item={b} scale={scale} tone="b" />
      </div>
    </div>
  );
}

function RectPreview({
  item,
  scale,
  tone,
}: {
  item: SizeGuideItem;
  scale: number;
  tone: "a" | "b";
}) {
  const w = Math.round(item.width * scale);
  const h = Math.round(item.height * scale);
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex items-center justify-center rounded-sm border",
          tone === "a"
            ? "border-primary/70 bg-primary/15"
            : "border-foreground/40 bg-foreground/10",
        )}
        style={{ width: w, height: h }}
      >
        <span className="text-[11px] uppercase tracking-widest">
          {item.width}×{item.height}
        </span>
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
        {item.label}
      </div>
    </div>
  );
}

function SizeSelect({
  value,
  onChange,
  sizes,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  sizes: SizeGuideItem[];
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-border bg-background px-2 py-2 text-sm"
      >
        {sizes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RoomPreview({
  sizes,
  active,
  onPick,
  roomImageUrl,
  wallWidthCm,
}: {
  sizes: SizeGuideItem[];
  active: SizeGuideItem;
  onPick: (id: string) => void;
  roomImageUrl: string;
  wallWidthCm: number;
}) {
  const { t } = useTranslation();
  // Compute frame footprint as % of the room image width/height.
  const widthPct = Math.min(90, (active.width / wallWidthCm) * 100);
  const heightPct = widthPct * (active.height / active.width); // relative to image width
  return (
    <div>
      <div className="relative overflow-hidden rounded-sm border border-border bg-muted">
        <div className="relative aspect-[16/10] w-full">
          {roomImageUrl ? (
            <img
              src={roomImageUrl}
              alt={t("sizeGuide.roomPreview")}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-800 to-neutral-950 text-xs text-muted-foreground">
              {t("sizeGuide.roomImageNotSet")}
            </div>
          )}
          <div
            className="absolute left-1/2 top-[38%] -translate-x-1/2 rounded-sm border-2 border-primary bg-primary/20 shadow-xl transition-all duration-300"
            style={{
              width: `${widthPct}%`,
              // approximate: use aspect via padding-top not possible with %; use vw-based height derived from image aspect (16:10).
              // Convert heightPct (as % of image width) to % of image height by * (16/10).
              paddingTop: 0,
              height: `${(heightPct * 16) / 10}%`,
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-foreground">
              {active.label}
            </span>
          </div>
        </div>
      </div>
      <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
        {sizes.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className={cn(
              "snap-start shrink-0 rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-widest transition",
              s.id === active.id
                ? "border-primary bg-primary/15"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
