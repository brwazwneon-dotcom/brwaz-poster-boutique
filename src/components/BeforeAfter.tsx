import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Item = {
  id: string;
  title: string | null;
  description: string | null;
  before_url: string;
  after_url: string;
  location: string;
  sort_order: number;
};

export function BeforeAfter({
  location,
}: {
  location: "homepage" | "product" | "photo-printing" | "custom-design";
}) {
  const { t } = useTranslation();
  const { data: items = [] } = useQuery({
    queryKey: ["before_after", location],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("before_after")
        .select("id,title,description,before_url,after_url,location,sort_order")
        .eq("active", true)
        .eq("location", location)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  if (items.length === 0) return null;

  return (
    <section className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        {t("beforeAfter.label")}
      </div>
      <h2 className="text-display text-3xl sm:text-4xl mt-2">{t("beforeAfter.title")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {t("beforeAfter.description")}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-sm border border-border bg-card p-3">
            <Slider before={it.before_url} after={it.after_url} title={it.title ?? ""} />
            {(it.title || it.description) && (
              <div className="mt-3 px-1">
                {it.title && <h3 className="text-display text-xl">{it.title}</h3>}
                {it.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Slider({
  before,
  after,
  title,
  className,
}: {
  before: string;
  after: string;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, x)));
  };

  return (
    <div
      ref={ref}
      className={cn(
        "relative aspect-[4/3] w-full select-none overflow-hidden rounded-sm bg-background",
        className,
      )}
      onMouseDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      <SafeImage
        src={after}
        alt={title ? t("beforeAfter.afterAlt", { title }) : t("beforeAfter.after")}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      <SafeImage
        src={before}
        alt={title ? t("beforeAfter.beforeAlt", { title }) : t("beforeAfter.before")}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `calc(${pos}% - 1px)` }}>
        <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-xs font-bold">
          ⇆
        </div>
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded-sm bg-background/85 px-2 py-0.5 text-[10px] uppercase tracking-widest">
        {t("beforeAfter.before")}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-sm bg-background/85 px-2 py-0.5 text-[10px] uppercase tracking-widest">
        {t("beforeAfter.after")}
      </span>
    </div>
  );
}
