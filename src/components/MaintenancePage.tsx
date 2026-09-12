import { useEffect, useState } from "react";
import { Instagram, Facebook, MessageCircle, Mail, MapPin, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SOCIAL } from "@/lib/site";
import { useLogoSize } from "@/lib/branding";
import type { MaintenanceConfig } from "@/lib/maintenance";

function useCountdown(endTime: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endTime) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endTime]);
  if (!endTime) return null;
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(end)) return null;
  const diff = Math.max(0, end - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, done: diff === 0 };
}

function Unit({ v, label }: { v: number; label: string }) {
  return (
    <div className="flex min-w-[68px] flex-col items-center rounded-sm border border-white/15 bg-black/40 px-3 py-3 backdrop-blur">
      <span className="text-display text-3xl leading-none text-white tabular-nums sm:text-4xl">
        {String(v).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-white/60">{label}</span>
    </div>
  );
}

export function MaintenancePage({ cfg }: { cfg: MaintenanceConfig }) {
  const { t } = useTranslation();
  const cd = useCountdown(cfg.endTime);
  const logo = useLogoSize("maintenance");

  // SEO: keep robots off the maintenance page.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const prev = document.title;
    document.title = `${cfg.title} — BRWAZWNEON`;
    // Best-effort 503 hint for crawlers via meta refresh retry-after equivalent.
    return () => {
      meta.remove();
      document.title = prev;
    };
  }, [cfg.title]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black text-white">
      {/* Background */}
      {cfg.backgroundVideo ? (
        <video
          src={cfg.backgroundVideo}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : cfg.backgroundImage ? (
        <img
          src={cfg.backgroundImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-950" />
      )}
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: cfg.overlayOpacity }}
        aria-hidden
      />

      {/* Content */}
      <div className="container-page relative z-10 mx-auto max-w-2xl px-6 py-16 text-center">
        <img
          src={logo.src}
          alt="BRWAZWNEON"
          className="mx-auto object-contain"
          style={logo.style}
          loading="eager"
        />

        <h1 className="text-display mt-8 text-4xl leading-tight text-white sm:text-6xl">
          {cfg.title}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm text-white/70 sm:text-base">{cfg.subtitle}</p>

        {cd && !cd.done && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Unit v={cd.days} label={t("maintenance.days")} />
            <Unit v={cd.hours} label={t("maintenance.hours")} />
            <Unit v={cd.minutes} label={t("maintenance.minutes")} />
            <Unit v={cd.seconds} label={t("maintenance.seconds")} />
          </div>
        )}

        {/* Contact */}
        <div className="mt-10 grid gap-2 text-sm text-white/80">
          <div className="flex items-center justify-center gap-2">
            <MapPin className="h-4 w-4" /> {t("maintenance.location")}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Phone className="h-4 w-4" /> {t("whatsappLabel")} {SOCIAL.whatsapp}
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={cfg.buttons.contactHref}
            className="inline-flex items-center gap-2 rounded-sm bg-white px-5 py-3 text-xs font-semibold uppercase tracking-widest text-black transition hover:bg-white/90"
          >
            <Mail className="h-4 w-4" /> {cfg.buttons.contactLabel}
          </a>
          <a
            href={cfg.buttons.whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-white/30 bg-black/40 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-white/10"
          >
            <MessageCircle className="h-4 w-4" /> {cfg.buttons.whatsappLabel}
          </a>
          <a
            href={cfg.buttons.instagramHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-white/30 bg-black/40 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-white/10"
          >
            <Instagram className="h-4 w-4" /> {cfg.buttons.instagramLabel}
          </a>
          <a
            href={cfg.buttons.facebookHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-white/30 bg-black/40 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-white/10"
          >
            <Facebook className="h-4 w-4" /> {cfg.buttons.facebookLabel}
          </a>
        </div>

        <p className="mt-10 text-[10px] uppercase tracking-[0.3em] text-white/40">
          © {new Date().getFullYear()} BRWAZWNEON
        </p>
      </div>
    </div>
  );
}
