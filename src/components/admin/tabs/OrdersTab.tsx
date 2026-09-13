import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listOrdersAdmin, updateOrderStatus } from "@/lib/db-admin.functions";
import { customerWhatsappLink } from "./shared";

type AdminOrder = {
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
  total_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_screenshot: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
};

export const ORDER_STATUSES = ["new", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];

export function OrdersTab() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<AdminOrder[] | null>(null);

  const load = async () => {
    const rows = await listOrdersAdmin({ data: filter ? { status: filter } : {} });
    setOrders(rows as AdminOrder[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
  const toggleSelectAll = () => {
    if (!orders) return;
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  };
  const printSelected = () => {
    if (!orders) return;
    const rows = orders.filter((o) => selected.has(o.id));
    if (rows.length === 0) return;
    setPrintTarget(rows);
  };

  const exportOrders = async () => {
    if (!orders || orders.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = orders.map((o) => ({
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
        Total: Number(o.total_price ?? 0),
        "Payment Method": o.payment_method,
        "Payment Status": o.payment_status,
        Status: o.status,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `brwazwneon-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      await updateOrderStatus({ data: { id, status } });
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
        <span className="text-xs text-muted-foreground">{orders.length} orders</span>
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
                    checked={orders.length > 0 && selected.size === orders.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelected(o.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {o.poster_image ? (
                        <a href={o.poster_image} target="_blank" rel="noreferrer">
                          <img
                            src={o.poster_image}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-sm border border-border object-cover"
                          />
                        </a>
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-sm border border-dashed border-border" />
                      )}
                      <span>
                        {o.poster_title} · {o.size} · {o.frame_type}
                      </span>
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
                  <td className="px-3 py-2 font-medium">{o.total_price} EGP</td>
                  <td className="px-3 py-2 text-xs">
                    <div>
                      {o.payment_method} / {o.payment_status}
                    </div>
                    {o.payment_screenshot && (
                      <a
                        href={o.payment_screenshot}
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
                      onChange={(e) => changeStatus(o.id, e.target.value)}
                      className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setPrintTarget([o])} className="text-xs text-cyan-500 hover:underline">
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printTarget && <OrderPackingSlips orders={printTarget} />}
    </div>
  );
}

// Packing-slip print layout. Kept out of normal flow (only rendered
// while actually printing) and isolated via @media print so the rest of
// the admin UI never shows up in the printout.
function OrderPackingSlips({ orders }: { orders: AdminOrder[] }) {
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
      {orders.map((o) => (
        <div key={o.id} style={{ pageBreakAfter: "always", padding: "24px", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>BRWAZWNEON</h1>
          <p style={{ fontSize: 12, color: "#666" }}>Packing slip</p>
          <hr style={{ margin: "12px 0" }} />
          <table style={{ width: "100%", fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Order</td>
                <td>{o.order_number}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Customer</td>
                <td>{o.customer_name}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Phone</td>
                <td>{o.phone}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Governorate</td>
                <td>{o.governorate}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12, verticalAlign: "top" }}>Address</td>
                <td>{o.address}</td>
              </tr>
            </tbody>
          </table>
          <hr style={{ margin: "12px 0" }} />
          {o.poster_image && (
            <img
              src={o.poster_image}
              alt=""
              style={{ maxWidth: 240, maxHeight: 240, objectFit: "contain", marginBottom: 12 }}
            />
          )}
          <table style={{ width: "100%", fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Item</td>
                <td>{o.poster_title}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Frame</td>
                <td>
                  {o.frame_type} · {o.frame_color} · {o.size}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Quantity</td>
                <td>{o.quantity}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Total</td>
                <td>{o.total_price} EGP</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Payment</td>
                <td>
                  {o.payment_method} ({o.payment_status})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
