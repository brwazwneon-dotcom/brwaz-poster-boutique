import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";

export type AnnouncementConfig = {
  enabled: boolean;
  text: string;
  speed: number; // seconds per full loop
  bg: string;
  color: string;
  accent: string;
};

export const ANNOUNCEMENT_KEY = "announcement_bar";

export const ANNOUNCEMENT_DEFAULTS: AnnouncementConfig = {
  enabled: true,
  text: "🚚 Free Shipping Over 1600 EGP",
  speed: 30,
  bg: "#000000",
  color: "#ffffff",
  accent: "#F5C542",
};

function parse(raw: unknown): AnnouncementConfig {
  if (!raw || typeof raw !== "object") return ANNOUNCEMENT_DEFAULTS;
  const v = raw as Partial<AnnouncementConfig>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : ANNOUNCEMENT_DEFAULTS.enabled,
    text: typeof v.text === "string" && v.text.trim() ? v.text : ANNOUNCEMENT_DEFAULTS.text,
    speed:
      Number.isFinite(Number(v.speed)) && Number(v.speed) > 0
        ? Number(v.speed)
        : ANNOUNCEMENT_DEFAULTS.speed,
    bg: typeof v.bg === "string" && v.bg ? v.bg : ANNOUNCEMENT_DEFAULTS.bg,
    color: typeof v.color === "string" && v.color ? v.color : ANNOUNCEMENT_DEFAULTS.color,
    accent: typeof v.accent === "string" && v.accent ? v.accent : ANNOUNCEMENT_DEFAULTS.accent,
  };
}

export function useAnnouncementConfig() {
  const q = useQuery({
    queryKey: ["announcement-bar"],
    staleTime: 60_000,
    queryFn: async (): Promise<AnnouncementConfig> => {
      const settings = await getSiteSettingsPublic({ data: { keys: [ANNOUNCEMENT_KEY] } });
      return parse(settings[ANNOUNCEMENT_KEY]);
    },
  });
  return q.data ?? ANNOUNCEMENT_DEFAULTS;
}

export function AnnouncementBar() {
  const { t } = useTranslation();
  const cfg = useAnnouncementConfig();
  if (!cfg.enabled || !cfg.text.trim()) return null;

  // Highlight numbers + currency subtly with the accent color.
  const parts = cfg.text.split(/(\d[\d,.]*\s*(?:EGP|LE|EUR|USD)?)/gi);

  const item = (key: string) => (
    <span
      key={key}
      className="mx-8 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.28em] sm:text-[13px]"
    >
      {parts.map((p, i) =>
        /\d/.test(p) ? (
          <span key={i} style={{ color: cfg.accent }}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
      <span aria-hidden style={{ color: cfg.accent }}>
        •
      </span>
    </span>
  );

  const REPEAT = 8;
  const track = Array.from({ length: REPEAT }, (_, i) => item(`a-${i}`));
  const track2 = Array.from({ length: REPEAT }, (_, i) => item(`b-${i}`));

  return (
    <div
      className="relative w-full overflow-hidden border-b border-white/10"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
      role="region"
      aria-label={t("announcement.ariaLabel")}
    >
      <div
        data-brw-marquee
        className="flex whitespace-nowrap py-1.5 will-change-transform"
        style={{
          animation: `brw-marquee ${cfg.speed}s linear infinite`,
        }}
      >
        <div className="flex shrink-0">{track}</div>
        <div className="flex shrink-0" aria-hidden>
          {track2}
        </div>
      </div>
      <style>{`
        @keyframes brw-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-brw-marquee] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
