/**
 * Client side of the server-priced checkout (`public.place_order`).
 *
 * The browser only says WHAT was ordered; the database computes every price from
 * `site_settings` and rejects the order if the customer's expected total no longer
 * matches (prices changed while the cart was open). If the function is not deployed
 * yet, `placeOrderViaRpc` reports "unavailable" and checkout falls back to the legacy
 * direct insert, so ordering keeps working whatever order things are released in.
 */
import type { CartItem } from "./cart";

export type PlaceOrderCustomer = {
  name: string;
  phone: string;
  governorate: string;
  address: string;
  guestSessionId: string;
};

export type PlaceOrderInput = {
  items: CartItem[];
  customer: PlaceOrderCustomer;
  paymentMethod: "cod" | "instapay";
  screenshotPath: string | null;
  isTest: boolean;
  tape: boolean;
  /** Total the customer saw; the server refuses the order if it computes a different one. */
  expectedTotal: number;
  asUuid: (v: string | null | undefined) => string | null;
};

export function buildPlaceOrderPayload(i: PlaceOrderInput) {
  return {
    p_customer: {
      name: i.customer.name,
      phone: i.customer.phone,
      governorate: i.customer.governorate,
      address: i.customer.address,
      guest_session_id: i.customer.guestSessionId,
    },
    p_items: i.items.map((it) => ({
      poster_id: i.asUuid(it.posterId),
      title: it.title,
      image: it.image,
      frame_type: it.frameType,
      color: it.color,
      size: it.size,
      qty: it.qty,
      custom_image_path: it.customImagePath ?? "",
      // omitted (not null) when absent: the server merges this object into the row notes
      ...(it.customImageMeta ? { custom_meta: it.customImageMeta } : {}),
      ...(it.bundle
        ? {
            bundle: {
              posters: it.bundle.posters.map((p) => ({
                poster_id: i.asUuid(p.posterId),
                title: p.title,
                image: p.image,
              })),
            },
          }
        : {}),
    })),
    p_payment: {
      method: i.paymentMethod,
      screenshot_path: i.screenshotPath ?? "",
      is_test: i.isTest,
      tape: i.tape,
      expected_total: i.expectedTotal,
    },
  };
}

export type PlaceOrderResult =
  | { status: "ok"; orderGroupId: string; total: number; rowIds: string[] }
  | { status: "price_changed"; serverTotal: number | null }
  | { status: "unavailable" }
  | { status: "error"; error: unknown };

type RpcError = { code?: string; message?: string; details?: string; hint?: string } | null;

/** PostgREST answers PGRST202 / 404 when the function is not in the schema cache. */
export function isFunctionMissing(e: RpcError): boolean {
  if (!e) return false;
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|function .*place_order.* does not exist/i.test(e.message ?? "")
  );
}

/** The server raises SQLSTATE PC001 with the total it computed in DETAIL. */
export function isPriceChanged(e: RpcError): boolean {
  return !!e && (e.code === "PC001" || /price_changed/.test(e.message ?? ""));
}

export function serverTotalFrom(e: RpcError): number | null {
  const m = `${e?.details ?? ""} ${e?.message ?? ""}`.match(/server_total=([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}

type RpcClient = {
  rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown; error: RpcError }>;
};

export async function placeOrderViaRpc(
  client: RpcClient,
  payload: ReturnType<typeof buildPlaceOrderPayload>,
): Promise<PlaceOrderResult> {
  const { data, error } = await client.rpc("place_order", payload);
  if (error) {
    if (isFunctionMissing(error)) return { status: "unavailable" };
    if (isPriceChanged(error))
      return { status: "price_changed", serverTotal: serverTotalFrom(error) };
    return { status: "error", error };
  }
  const d = data as { order_group_id?: string; total?: number | string; row_ids?: string[] } | null;
  if (!d?.order_group_id || !Array.isArray(d.row_ids)) {
    return { status: "error", error: new Error("place_order returned an unexpected response") };
  }
  return {
    status: "ok",
    orderGroupId: d.order_group_id,
    total: Number(d.total),
    rowIds: d.row_ids,
  };
}
