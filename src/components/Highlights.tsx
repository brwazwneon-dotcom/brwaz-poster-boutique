import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "./SafeImage";
import {
  Trophy,
  Film,
  Tv,
  Zap,
  Sparkles,
  Car,
  Image as ImageIcon,
  Printer,
  LayoutGrid,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FALLBACK_ICONS: Record<string, LucideIcon> = {
  football: Trophy,
  movies: Film,
  "tv-series": Tv,
  "marvel-dc": Zap,
  anime: Sparkles,
  cars: Car,
  "custom-design": ImageIcon,
  "photo-printing": Printer,
  sets: LayoutGrid,
};

type Highlight = {
  id: string;
  key: string;
  title: string;
  image_url: string | null;
  link: string;
  sort_order: number;
  enabled: boolean;
};

export function Highlights() {
  const { t } = useTranslation();
  const { data = [] } = useQuery({
    queryKey: ["highlights"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("highlights")
        .select("id,key,title,link,sort_order,image_url,enabled")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Highlight[];
    },
  });

  if (data.length === 0) return null;

  return (
    <section className="border-b border-border bg-background">
      <div className="container-page py-8 sm:py-10">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              {t("home.highlights")}
            </p>
            <h2 className="text-display mt-2 text-2xl sm:text-3xl">{t("home.highlights")}</h2>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex gap-3 sm:gap-4">
            {data.map((h) => {
              const Icon = FALLBACK_ICONS[h.key] ?? Sparkles;
              return (
                <li key={h.id} className="shrink-0">
                  <a
                    href={h.link}
                    className="group flex w-[92px] flex-col items-center gap-2 sm:w-[108px]"
                  >
                    <div className="relative h-[92px] w-[92px] overflow-hidden rounded-full border border-border bg-card transition group-hover:border-primary sm:h-[108px] sm:w-[108px]">
                      {h.image_url ? (
                        <SafeImage
                          src={h.image_url}
                          alt={h.title}
                          className="h-full w-full object-cover grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-foreground">
                          <Icon className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-foreground">
                      {h.title}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
