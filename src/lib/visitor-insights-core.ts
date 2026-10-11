// Pure helpers for the "Visitor insights" panel (no I/O, unit-tested).
//
// Built only from what the site really records for each visit: an anonymous
// visitor id, the approximate country / city (from network geolocation, never an
// IP address) and the day. Age and gender are NOT recorded anywhere, so they are
// never estimated or shown as numbers here.

export const INSIGHT_RANGES = [7, 30, 90] as const;
export type InsightDays = (typeof INSIGHT_RANGES)[number];

export function clampInsightDays(v: unknown): InsightDays {
  const n = Number(v);
  return (INSIGHT_RANGES as readonly number[]).includes(n) ? (n as InsightDays) : 30;
}

/** One row per visitor who visited inside the range. */
export type InsightVisitorRow = {
  visitor_id: string;
  visits: number;
  /** Distinct calendar days (Cairo time) with a visit inside the range. */
  days: number;
  /** The visitor's very first visit ever (any time, before or inside the range). */
  first_ever: string;
  country: string | null;
  country_code: string | null;
  city: string | null;
  governorate: string | null;
  device: string | null;
};

export type InsightTally = { key: string; label: string; count: number };

export type VisitorInsights = {
  days: InsightDays;
  visitors: number;
  visits: number;
  newVisitors: number;
  returningVisitors: number;
  /** Share of visitors who had been on the site before (0-100, whole number). */
  returningPercent: number;
  countries: InsightTally[];
  cities: InsightTally[];
  returningCities: InsightTally[];
  devices: { mobile: number; tablet: number; desktop: number };
};

const clean = (v: string | null | undefined) => (v ?? "").trim();

function tally(keys: Array<{ key: string; label: string }>, limit: number): InsightTally[] {
  const map = new Map<string, InsightTally>();
  for (const { key, label } of keys) {
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { key, label, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** A visitor is "returning" if they had visited before this range, or on more than one day inside it. */
export function isReturning(row: InsightVisitorRow, sinceMs: number): boolean {
  return new Date(row.first_ever).getTime() < sinceMs || row.days > 1;
}

function cityLabel(row: InsightVisitorRow): { key: string; label: string } | null {
  const city = clean(row.city);
  const gov = clean(row.governorate);
  const country = clean(row.country);
  const name = city || gov;
  if (!name) return null;
  const label = country && country !== name ? `${name}, ${country}` : name;
  return { key: label.toLowerCase(), label };
}

export function buildVisitorInsights(
  rows: InsightVisitorRow[],
  days: InsightDays,
  sinceMs: number,
): VisitorInsights {
  const returning = rows.filter((r) => isReturning(r, sinceMs));
  const countryKeys = rows
    .map((r) => clean(r.country))
    .filter(Boolean)
    .map((c) => ({ key: c.toLowerCase(), label: c }));
  const cityKeys = rows.map(cityLabel).filter((c): c is { key: string; label: string } => !!c);
  const returningCityKeys = returning
    .map(cityLabel)
    .filter((c): c is { key: string; label: string } => !!c);
  const devices = { mobile: 0, tablet: 0, desktop: 0 };
  for (const r of rows) {
    if (r.device === "mobile") devices.mobile += 1;
    else if (r.device === "tablet") devices.tablet += 1;
    else devices.desktop += 1;
  }
  return {
    days,
    visitors: rows.length,
    visits: rows.reduce((s, r) => s + r.visits, 0),
    newVisitors: rows.length - returning.length,
    returningVisitors: returning.length,
    returningPercent: rows.length ? Math.round((returning.length / rows.length) * 100) : 0,
    countries: tally(countryKeys, 8),
    cities: tally(cityKeys, 10),
    returningCities: tally(returningCityKeys, 8),
    devices,
  };
}
