import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPhotoOrdersAdmin, updatePhotoOrderStatus } from "@/lib/db-admin.functions";
import { customerWhatsappLink } from "./shared";
import { ORDER_STATUSES } from "./OrdersTab";

type AdminPhotoOrder = {
  id: string;
  order_number: string | null;
  kind: "photo_4x6" | "photo_printing";
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  detail: string;
  quantity: number;
  total_price: number;
  status: string;
  photos: string[];
  created_at: string;
};

const PHOTO_ORDER_KIND_LABEL: Record<AdminPhotoOrder["kind"], string> = {
  photo_4x6: "4×6 Printing",
  photo_printing: "Photo Printing",
};

export function PhotoOrdersTab() {
  const [orders, setOrders] = useState<AdminPhotoOrder[] | null>(null);

  const load = async () => setOrders((await listPhotoOrdersAdmin()) as AdminPhotoOrder[]);
  useEffect(() => {
    load();
  }, []);

  const changeStatus = async (o: AdminPhotoOrder, status: string) => {
    try {
      await updatePhotoOrderStatus({ data: { id: o.id, kind: o.kind, status } });
      toast.success("Order updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (orders === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Photo orders</h2>
        <span className="text-xs text-muted-foreground">{orders.length} orders</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photo orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Photos</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={`${o.kind}-${o.id}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2 text-xs">{PHOTO_ORDER_KIND_LABEL[o.kind]}</td>
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
                  <td className="px-3 py-2 text-xs">
                    {o.detail} · qty {o.quantity}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {o.photos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        o.photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt=""
                              className="h-10 w-10 rounded-sm border border-border object-cover"
                            />
                          </a>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">{Number(o.total_price)} EGP</td>
                  <td className="px-3 py-2">
                    <select
                      value={o.status}
                      onChange={(e) => changeStatus(o, e.target.value)}
                      className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
