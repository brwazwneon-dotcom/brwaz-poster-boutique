import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPhotoOrdersAdmin, updatePhotoOrderStatus } from "@/lib/db-admin.functions";
import { customerWhatsappLink } from "./shared";
import { ORDER_STATUSES } from "./OrdersTab";
import { LoadingRows } from "@/components/admin/layout/LoadingState";
import { Download, X } from "lucide-react";

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
  selected_albums: Array<{ id: string; name: string; price: number; qty: number }>;
  albums_total: number;
  payment_method: "cod" | "instapay" | "vodafone_cash";
};

const PHOTO_ORDER_KIND_LABEL: Record<AdminPhotoOrder["kind"], string> = {
  photo_4x6: "4×6 Printing",
  photo_printing: "Photo Printing",
};

const PAYMENT_METHOD_LABEL: Record<AdminPhotoOrder["payment_method"], string> = {
  cod: "Cash on delivery",
  instapay: "InstaPay",
  vodafone_cash: "Vodafone Cash",
};

export function PhotoOrdersTab() {
  const [orders, setOrders] = useState<AdminPhotoOrder[] | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  const downloadZip = async (o: AdminPhotoOrder) => {
    setDownloadingId(o.id);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      await Promise.all(
        o.photos.map(async (url, i) => {
          const res = await fetch(url);
          if (!res.ok) return;
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          zip.file(`photo-${i + 1}.${ext}`, blob);
        }),
      );
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${o.order_number ?? o.id.slice(0, 8)}-photos.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  if (orders === null) return <LoadingRows />;

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
                <th className="px-3 py-2">Payment</th>
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
                    {o.photos.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {o.photos.map((url, i) => (
                            <button key={i} onClick={() => setLightbox(url)} type="button">
                              <img
                                src={url}
                                alt=""
                                className="h-14 w-14 rounded-sm border border-border object-cover transition hover:opacity-80"
                              />
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => downloadZip(o)}
                          disabled={downloadingId === o.id}
                          className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] hover:bg-accent disabled:opacity-50"
                        >
                          <Download className="h-3 w-3" />
                          {downloadingId === o.id
                            ? "Zipping…"
                            : `Download ZIP (${o.photos.length})`}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        o.payment_method === "cod"
                          ? "text-muted-foreground"
                          : "font-medium text-amber-500"
                      }
                    >
                      {PAYMENT_METHOD_LABEL[o.payment_method]}
                    </span>
                    {o.payment_method !== "cod" && (
                      <div className="text-[10px] text-muted-foreground">
                        Verify transfer received
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {Number(o.total_price)} EGP
                    {o.albums_total > 0 && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        incl. {o.selected_albums.map((a) => `${a.name} ×${a.qty}`).join(", ")}
                      </div>
                    )}
                  </td>
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

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-sm border border-border bg-background p-1.5 text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-sm object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
