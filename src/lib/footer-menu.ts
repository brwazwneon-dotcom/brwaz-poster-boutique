import { useQuery } from "@tanstack/react-query";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";

export type FooterLink = {
  id: string;
  label: string;
  href: string;
  enabled: boolean;
};

export type FooterMenuConfig = {
  links: FooterLink[];
};

export const FOOTER_MENU_KEY = "footer_menu_v1";

export const DEFAULT_FOOTER_MENU: FooterMenuConfig = {
  links: [
    { id: "football", label: "Football", href: "/category/football", enabled: true },
    { id: "movies", label: "Movies", href: "/category/movies", enabled: true },
    { id: "tv-series", label: "TV Series", href: "/category/tv-series", enabled: true },
    { id: "marvel-dc", label: "Marvel & DC", href: "/category/marvel-dc", enabled: true },
    { id: "anime", label: "Anime", href: "/category/anime", enabled: true },
    { id: "cars", label: "Cars", href: "/category/cars", enabled: true },
    { id: "custom-design", label: "Custom Design", href: "/custom-design", enabled: true },
    { id: "photo-printing", label: "Photo Printing", href: "/photo-printing", enabled: true },
    { id: "sets", label: "Sets", href: "/sets", enabled: true },
    { id: "best-sellers", label: "Best Sellers", href: "/#best-sellers", enabled: true },
  ],
};

function normalize(raw: unknown): FooterMenuConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_FOOTER_MENU;
  const v = raw as Partial<FooterMenuConfig>;
  const links = Array.isArray(v.links)
    ? v.links
        .filter(
          (l): l is FooterLink =>
            !!l && typeof l === "object" && typeof (l as FooterLink).id === "string",
        )
        .map((l) => ({
          id: String(l.id),
          label: String(l.label ?? l.id),
          href: String(l.href ?? "/"),
          enabled: l.enabled !== false,
        }))
    : DEFAULT_FOOTER_MENU.links;
  return { links: links.length ? links : DEFAULT_FOOTER_MENU.links };
}

export function useFooterMenu() {
  const q = useQuery({
    queryKey: ["footer-menu"],
    staleTime: 60_000,
    queryFn: async (): Promise<FooterMenuConfig> => {
      const settings = await getSiteSettingsPublic({ data: { keys: [FOOTER_MENU_KEY] } });
      return normalize(settings[FOOTER_MENU_KEY]);
    },
  });
  return q.data ?? DEFAULT_FOOTER_MENU;
}
