import { createServerFn } from "@tanstack/react-start";
import { sql } from "@/lib/neon.server";

export type OrderRowInput = {
  guest_session_id: string | null;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  selected_poster: string | null;
  poster_title: string;
  poster_image: string;
  notes: string | null;
  subtotal: number;
  packaging_fee: number;
  shipping_cost: number;
  total_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_screenshot: string | null;
  is_test: boolean;
};

// Public — checkout is anonymous, same as before. Runs entirely
// server-side now (previously a direct client insert into Supabase),
// so the price-guard trigger is the last line of defense, not the only
// one: this function itself never trusts anything about total_price
// beyond passing it through to the same guarded insert.
export const createOrderRows = createServerFn({ method: "POST" })
  .validator((data: unknown) => (data as { rows: OrderRowInput[] }).rows)
  .handler(async ({ data: rows }) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("At least one order row is required");
    }
    if (rows.length > 20) {
      throw new Error("Too many items in one checkout");
    }

    const client = sql();
    const results = (await client.transaction(
      rows.map(
        (r) => client`
          insert into orders (
            guest_session_id, customer_name, phone, governorate, address,
            frame_type, frame_color, size, quantity, selected_poster,
            poster_title, poster_image, notes, subtotal, packaging_fee,
            shipping_cost, total_price, status, payment_method,
            payment_status, payment_screenshot, is_test
          ) values (
            ${r.guest_session_id}, ${r.customer_name}, ${r.phone}, ${r.governorate}, ${r.address},
            ${r.frame_type}, ${r.frame_color}, ${r.size}, ${r.quantity}, ${r.selected_poster},
            ${r.poster_title}, ${r.poster_image}, ${r.notes}, ${r.subtotal}, ${r.packaging_fee},
            ${r.shipping_cost}, ${r.total_price}, ${r.status}, ${r.payment_method},
            ${r.payment_status}, ${r.payment_screenshot}, ${r.is_test}
          )
          returning id, order_number
        `,
      ),
    )) as Array<Array<{ id: string; order_number: string }>>;

    return { ok: true as const, orders: results.map((r) => r[0]) };
  });
