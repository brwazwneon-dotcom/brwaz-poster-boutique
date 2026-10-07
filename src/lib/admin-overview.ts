export type Line = {
  id: string;
  created_at: string;
  customer_name: string;
  phone: string;
  governorate: string;
  total_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  poster_title: string | null;
  order_number: string | null;
};

export type Order = {
  key: string;
  at: string;
  customer: string;
  phone: string;
  gov: string;
  total: number;
  status: string;
  payment: string;
  paymentStatus: string;
  items: number;
  numbers: string[];
  titles: string[];
};

export const DAY = 86_400_000;
export const egp = (n: number) => `${Math.round(n).toLocaleString("en-US")} EGP`;
export const CLOSED = new Set(["delivered", "cancelled", "canceled", "refunded", "returned"]);

/** One cart = several order rows inserted in one statement (same created_at + phone). */
export function groupOrders(lines: Line[]): Order[] {
  const map = new Map<string, Order>();
  for (const l of lines) {
    const key = `${l.phone}|${l.created_at}`;
    const o = map.get(key);
    if (o) {
      o.total += Number(l.total_price) || 0;
      o.items += 1;
      if (l.order_number) o.numbers.push(l.order_number);
      if (l.poster_title) o.titles.push(l.poster_title);
    } else {
      map.set(key, {
        key,
        at: l.created_at,
        customer: l.customer_name,
        phone: l.phone,
        gov: l.governorate,
        total: Number(l.total_price) || 0,
        status: l.status,
        payment: l.payment_method,
        paymentStatus: l.payment_status,
        items: 1,
        numbers: l.order_number ? [l.order_number] : [],
        titles: l.poster_title ? [l.poster_title] : [],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
}
