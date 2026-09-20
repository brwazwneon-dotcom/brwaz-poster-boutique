import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listCheckoutPhotoOrdersAdmin,
  listOrdersAdmin,
  updateOrderStatus,
} from "@/lib/db-admin.functions";
import { customerWhatsappLink } from "./shared";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import { CONFIRMATION_STATUS_LABEL, type ConfirmationStatus } from "@/lib/order-whatsapp";

export type AdminOrder = {
  id: string;
  order_number: string | null;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  poster_title: string | null;
  poster_image: string | null;
  subtotal?: number | string | null;
  packaging_fee?: number | string | null;
  shipping_cost?: number | string | null;
  total_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_screenshot: string | null;
  payment_reference: string | null;
  notes: string | null;
  confirmation_status: ConfirmationStatus;
  whatsapp_message: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  /** customer + created_at, built inside Postgres: same value for every row of one checkout. */
  checkout_key?: string;
};

/** A photo-printing order (its own table). Placed together with a frames order it belongs to the same checkout. */
export type PhotoOrderLite = {
  id: string;
  order_number: string | null;
  phone: string;
  package_key: string;
  photo_count: number;
  total_price: number | string;
  status: string;
  created_at: string;
};

export function photoOrderLabel(p: PhotoOrderLite): string {
  const size = p.package_key.startsWith("size_") ? p.package_key.slice(5) : p.package_key;
  return `${p.photo_count} photos · ${size}`;
}

// The cart saves the frames first and the photo print a moment later, with
// the same phone number.
export function photoOrdersForGroup(group: OrderGroup, photos: PhotoOrderLite[]): PhotoOrderLite[] {
  const start = new Date(group.primary.created_at).getTime();
  return photos.filter((p) => {
    const at = new Date(p.created_at).getTime();
    return p.phone === group.primary.phone && at >= start - 2_000 && at <= start + 3 * 60_000;
  });
}

// The cart's "double face tape" add-on is saved as its own row with this title.
export const TAPE_TITLE = "Double Face Tape";

// One checkout (one customer submitting one cart) is stored as one row per
// cart item. The admin works with the checkout as a single order.
export type OrderGroup = {
  key: string;
  rows: AdminOrder[];
  primary: AdminOrder;
  total: number;
  frames: AdminOrder[];
  tapeQty: number;
};

export function groupOrders(rows: AdminOrder[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const row of rows) {
    const key = row.checkout_key ?? row.id;
    let group = map.get(key);
    if (!group) {
      group = { key, rows: [], primary: row, total: 0, frames: [], tapeQty: 0 };
      map.set(key, group);
    }
    group.rows.push(row);
    group.total += Number(row.total_price) || 0;
    if (row.poster_title === TAPE_TITLE) group.tapeQty += Number(row.quantity) || 0;
    else group.frames.push(row);
  }
  return [...map.values()];
}

/** "BRW-1012" for one row, "BRW-1012 → BRW-1016" for a checkout of several. */
export function checkoutNumberLabel(rows: AdminOrder[]): string {
  const numbers = rows.map((r) => r.order_number ?? r.id.slice(0, 8));
  if (numbers.length <= 1) return numbers[0] ?? "";
  return `${numbers[0]} → ${numbers[numbers.length - 1]}`;
}

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

export function OrdersTab({
  focusOrderId,
  onFocusOrderHandled,
}: {
  // Set by the notification bell (AdminTopbar, via Dashboard) — opens that
  // order's details drawer directly instead of making the admin search.
  focusOrderId?: string | null;
  onFocusOrderHandled?: () => void;
} = {}) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<OrderGroup[] | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [photoOrders, setPhotoOrders] = useState<PhotoOrderLite[]>([]);

  const load = async () => {
    const [rows, photos] = await Promise.all([
      listOrdersAdmin({ data: filter ? { status: filter } : {} }),
      listCheckoutPhotoOrdersAdmin().catch(() => []),
    ]);
    setOrders(rows as AdminOrder[]);
    setPhotoOrders(photos as PhotoOrderLite[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (!focusOrderId) return;
    setDetailsOrderId(focusOrderId);
    onFocusOrderHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOrderId]);

  // Print only fires once the packing-slip markup for printTarget has
  // actually rendered — doing it in the click handler would print the
  // previous (empty) print area since setState is async.
  useEffect(() => {
    if (!printTarget) return;
    const id = window.setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 50);
    return () => window.clearTimeout(id);
  }, [printTarget]);

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const groups = orders ? groupOrders(orders) : [];
  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.size === groups.length ? new Set() : new Set(groups.map((g) => g.key)),
    );
  };
  const printSelected = () => {
    const chosen = groups.filter((g) => selected.has(g.key));
    if (chosen.length === 0) return;
    setPrintTarget(chosen);
  };

  const exportOrders = async () => {
    if (!orders || orders.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      // One line per item, with the checkout it belongs to and its total.
      const rows = groups.flatMap((g) =>
        g.rows.map((o, index) => ({
          Checkout: checkoutNumberLabel(g.rows),
          "Checkout Total": index === 0 ? g.total : "",
          "Order Number": o.order_number ?? o.id.slice(0, 8),
          Date: new Date(o.created_at).toLocaleString(),
          Customer: o.customer_name,
          Phone: o.phone,
          Governorate: o.governorate,
          Address: o.address,
          Poster: o.poster_title ?? "",
          "Frame Type": o.frame_type,
          "Frame Color": o.frame_color,
          Size: o.size,
          Quantity: o.quantity,
          "Item Total": Number(o.total_price ?? 0),
          "Payment Method": o.payment_method,
          "Payment Status": o.payment_status,
          Status: o.status,
        })),
      );
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `brwazwneon-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const changeStatus = async (group: OrderGroup, status: string) => {
    try {
      await updateOrderStatus({ data: { ids: group.rows.map((r) => r.id), status } });
      toast.success("Order updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (orders === null) return <p className="text-sm text-muted-foreground">Loading orders…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {groups.length} orders
          {groups.length !== orders.length ? ` · ${orders.length} items` : ""}
        </span>
        <button
          onClick={printSelected}
          disabled={selected.size === 0}
          className="ml-auto rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Print selected ({selected.size})
        </button>
        <button
          onClick={exportOrders}
          disabled={exporting || orders.length === 0}
          className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export .xlsx"}
        </button>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={groups.length > 0 && selected.size === groups.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Confirmation</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const o = g.primary;
                const proof = g.rows.find((r) => r.payment_screenshot)?.payment_screenshot ?? null;
                const photosOf = photoOrdersForGroup(g, photoOrders);
                const photoTotal = photosOf.reduce((n, ph) => n + (Number(ph.total_price) || 0), 0);
                const shown = g.frames.slice(0, 4);
                const frameCount = g.frames.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
                const extraTitles = g.frames.length > 1 ? ` +${g.frames.length - 1} more` : "";
                return (
                  <tr key={g.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(g.key)}
                        onChange={() => toggleSelected(g.key)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {checkoutNumberLabel(g.rows)}
                      {g.rows.length > 1 && (
                        <div className="font-sans text-[10px] text-muted-foreground">
                          {g.rows.length} items
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 -space-x-2">
                          {shown.map((r) =>
                            r.poster_image ? (
                              <a key={r.id} href={r.poster_image} target="_blank" rel="noreferrer">
                                <img
                                  src={r.poster_image}
                                  alt=""
                                  className="h-10 w-10 rounded-sm border border-border object-cover"
                                />
                              </a>
                            ) : (
                              <div
                                key={r.id}
                                className="h-10 w-10 rounded-sm border border-dashed border-border bg-background"
                              />
                            ),
                          )}
                        </div>
                        <div>
                          <div>
                            {g.frames[0]?.poster_title ?? ""}
                            {extraTitles}
                          </div>
                          <div className="text-muted-foreground">
                            {frameCount} {frameCount === 1 ? "frame" : "frames"}
                            {g.frames[0]
                              ? ` · ${[...new Set(g.frames.map((r) => r.size))].join(" / ")} · ${g.frames[0].frame_type}`
                              : ""}
                            {g.tapeQty > 0 ? ` · + ${g.tapeQty} double-face tape` : ""}
                          </div>
                          {photosOf.map((ph) => (
                            <div key={ph.id} className="text-primary">
                              📷 Photo print: {photoOrderLabel(ph)} · {ph.total_price} EGP
                              {ph.order_number ? ` (${ph.order_number})` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{o.customer_name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>
                          {o.phone} · {o.governorate}
                        </span>
                        <a
                          href={customerWhatsappLink(o.phone)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-500 hover:underline"
                          title="Message on WhatsApp"
                        >
                          WA
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {g.total + photoTotal} EGP
                      {photoTotal > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          incl. {photoTotal} photo print
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>
                        {o.payment_method} / {o.payment_status}
                      </div>
                      {proof?.startsWith("https://") && (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-500 hover:underline"
                        >
                          View payment proof
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={o.status}
                        onChange={(e) => changeStatus(g, e.target.value)}
                        className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[10px] whitespace-nowrap">
                      {CONFIRMATION_STATUS_LABEL[o.confirmation_status] ??
                        CONFIRMATION_STATUS_LABEL.not_sent}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDetailsOrderId(o.id)}
                          className="text-xs text-cyan-500 hover:underline"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => setPrintTarget([g])}
                          className="text-xs text-cyan-500 hover:underline"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {printTarget && <OrderPackingSlips groups={printTarget} photoOrders={photoOrders} />}

      <OrderDetailsDrawer
        order={orders.find((o) => o.id === detailsOrderId) ?? null}
        open={detailsOrderId !== null}
        onOpenChange={(open) => setDetailsOrderId(open ? detailsOrderId : null)}
        photoOrders={(() => {
          const g = groups.find((gr) => gr.rows.some((r) => r.id === detailsOrderId));
          return g ? photoOrdersForGroup(g, photoOrders) : [];
        })()}
        onOrderUpdated={load}
      />
    </div>
  );
}

// Packing-slip print layout — one slip per checkout, listing every item.
// Kept out of normal flow (only rendered while actually printing) and
// isolated via @media print so the rest of the admin UI never shows up in
// the printout.
function OrderPackingSlips({
  groups,
  photoOrders,
}: {
  groups: OrderGroup[];
  photoOrders: PhotoOrderLite[];
}) {
  const cell = { fontWeight: 700, paddingRight: 12 } as const;
  const sum = (rows: AdminOrder[], pick: (r: AdminOrder) => unknown) =>
    rows.reduce((n, r) => n + (Number(pick(r)) || 0), 0);
  return (
    <div className="print-area">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; }
        }
        @media screen {
          .print-area { display: none; }
        }
      `}</style>
      {groups.map((g) => {
        const o = g.primary;
        const packaging = sum(g.rows, (r) => r.packaging_fee);
        const shipping = sum(g.rows, (r) => r.shipping_cost);
        const photos = photoOrdersForGroup(g, photoOrders);
        const photoTotal = photos.reduce((n, ph) => n + (Number(ph.total_price) || 0), 0);
        return (
          <div
            key={g.key}
            style={{ pageBreakAfter: "always", padding: "24px", fontFamily: "sans-serif" }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>BRWAZWNEON</h1>
            <p style={{ fontSize: 12, color: "#666" }}>Packing slip</p>
            <hr style={{ margin: "12px 0" }} />
            <table style={{ width: "100%", fontSize: 14 }}>
              <tbody>
                <tr>
                  <td style={cell}>Order</td>
                  <td>{checkoutNumberLabel(g.rows)}</td>
                </tr>
                <tr>
                  <td style={cell}>Customer</td>
                  <td>{o.customer_name}</td>
                </tr>
                <tr>
                  <td style={cell}>Phone</td>
                  <td>{o.phone}</td>
                </tr>
                <tr>
                  <td style={cell}>Governorate</td>
                  <td>{o.governorate}</td>
                </tr>
                <tr>
                  <td style={{ ...cell, verticalAlign: "top" }}>Address</td>
                  <td>{o.address}</td>
                </tr>
              </tbody>
            </table>
            <hr style={{ margin: "12px 0" }} />
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #999" }}>
                  <th style={{ padding: "4px 6px" }}></th>
                  <th style={{ padding: "4px 6px" }}>Item</th>
                  <th style={{ padding: "4px 6px" }}>Frame</th>
                  <th style={{ padding: "4px 6px" }}>Qty</th>
                  <th style={{ padding: "4px 6px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "4px 6px" }}>
                      {r.poster_image && (
                        <img
                          src={r.poster_image}
                          alt=""
                          style={{ width: 56, height: 56, objectFit: "cover" }}
                        />
                      )}
                    </td>
                    <td style={{ padding: "4px 6px" }}>{r.poster_title}</td>
                    <td style={{ padding: "4px 6px" }}>
                      {r.frame_type} · {r.frame_color} · {r.size}
                    </td>
                    <td style={{ padding: "4px 6px" }}>{r.quantity}</td>
                    <td style={{ padding: "4px 6px" }}>{r.total_price} EGP</td>
                  </tr>
                ))}
                {photos.map((ph) => (
                  <tr key={ph.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "4px 6px" }}>📷</td>
                    <td style={{ padding: "4px 6px" }} colSpan={2}>
                      Photo printing — {photoOrderLabel(ph)}
                      {ph.order_number ? ` (${ph.order_number})` : ""}
                    </td>
                    <td style={{ padding: "4px 6px" }}>1</td>
                    <td style={{ padding: "4px 6px" }}>{ph.total_price} EGP</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table style={{ width: "100%", fontSize: 14, marginTop: 12 }}>
              <tbody>
                {packaging > 0 && (
                  <tr>
                    <td style={cell}>Packaging</td>
                    <td>{packaging} EGP</td>
                  </tr>
                )}
                {shipping > 0 && (
                  <tr>
                    <td style={cell}>Shipping</td>
                    <td>{shipping} EGP</td>
                  </tr>
                )}
                <tr>
                  <td style={cell}>Total</td>
                  <td>{g.total + photoTotal} EGP</td>
                </tr>
                <tr>
                  <td style={cell}>Payment</td>
                  <td>
                    {o.payment_method} ({o.payment_status})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
