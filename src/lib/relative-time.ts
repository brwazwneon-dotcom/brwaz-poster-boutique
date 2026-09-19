import type { TFunction } from "i18next";

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" — in the visitor's language. */
export function relativeMinutes(t: TFunction, mins: number): string {
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  return t("time.daysAgo", { count: Math.floor(hours / 24) });
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "1 month ago" from an ISO date. */
export function relativeFromDate(t: TFunction, iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const day = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.floor((Date.now() - then) / day));
  if (days <= 0) return t("time.today");
  if (days === 1) return t("time.yesterday");
  if (days < 7) return t("time.daysAgo", { count: days });
  if (days < 30) return t("time.weeksAgo", { count: Math.round(days / 7) });
  return t("time.monthsAgo", { count: Math.round(days / 30) });
}
