// What the thank-you page shows right after checkout. Kept in sessionStorage
// (this tab only, gone when it closes) so a refresh of the thank-you page still
// works. Only what the page displays is stored: no address, no phone number.
export type LastOrder = {
  numbers: string[];
  name: string;
  /** Sum of the placed frame rows; null when unknown (e.g. photo-only order). */
  total: number | null;
  itemCount: number;
  paymentMethod: "cod" | "instapay";
  governorate: string;
  placedAt: string;
};

const KEY = "brw_last_order_v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function saveLastOrder(order: LastOrder): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* storage can be blocked (private mode) — the page then shows the generic thanks */
  }
}

export function readLastOrder(now = Date.now()): LastOrder | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LastOrder>;
    const placed = Date.parse(String(o.placedAt));
    if (!Number.isFinite(placed) || now - placed > MAX_AGE_MS) return null;
    const numbers = Array.isArray(o.numbers)
      ? o.numbers.filter((n): n is string => typeof n === "string" && n.length <= 40).slice(0, 20)
      : [];
    return {
      numbers,
      name: typeof o.name === "string" ? o.name.slice(0, 80) : "",
      total: typeof o.total === "number" && Number.isFinite(o.total) ? o.total : null,
      itemCount: Number.isFinite(Number(o.itemCount)) ? Math.max(0, Number(o.itemCount)) : 0,
      paymentMethod: o.paymentMethod === "instapay" ? "instapay" : "cod",
      governorate: typeof o.governorate === "string" ? o.governorate.slice(0, 60) : "",
      placedAt: new Date(placed).toISOString(),
    };
  } catch {
    return null;
  }
}

/** "Youssef Saed" → "Youssef". */
export function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** "BRW-1130", "BRW-1131", "BRW-1132" → "BRW-1130 → BRW-1132" (as in the admin list). */
export function orderNumberRange(numbers: string[]): string {
  if (numbers.length === 0) return "";
  if (numbers.length === 1) return numbers[0];
  return `${numbers[0]} → ${numbers[numbers.length - 1]}`;
}
