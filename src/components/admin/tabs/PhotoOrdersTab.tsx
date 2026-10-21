import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deletePhotoOrdersAdmin,
  listPhotoOrdersAdmin,
  setPhotoOrderConfirmationAdmin,
  setPhotoOrdersArchivedAdmin,
  updatePhotoOrderStatus,
} from "@/lib/db-admin.functions";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { customerWhatsappLink } from "./shared";
import { ORDER_STATUSES } from "./OrdersTab";
import { LoadingRows } from "@/components/admin/layout/LoadingState";
import { Download, X } from "lucide-react";
import { CONFIRMATION_STATUS_LABEL, waLink, type ConfirmationStatus } from "@/lib/order-whatsapp";
import {
  buildPhotoConfirmationMessage,
  formatOrderDateTime,
  photoDetailLabel,
  photoKindLabel,
} from "@/lib/photo-order-sheet";
import { PhotoOrderSheetDialog } from "./PhotoOrderSheetDialog";

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
  subtotal?: number | null;
  shipping?: number | null;
  confirmation_status?: ConfirmationStatus;
  confirmed_at?: string | null;
  /** Moved to the archive by the admin. */
  admin_archived?: boolean;
};

const rowKey = (o: { kind: string; id: string }) => `${o.kind}:${o.id}`;

const CONFIRMATION_TONE: Record<ConfirmationStatus, string> = {
  not_sent: "border-border bg-muted/40 text-muted-foreground",
  prepared: "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
  sent: "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
  customer_confirmed:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  customer_rejected: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300",
  waiting_for_response: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
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
  const [sheetFor, setSheetFor] = useState<AdminPhotoOrder | null>(null);
  const [view, setView] = useState<"all" | "archive">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const confirm = useConfirm();

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

  // Sets the confirmation state: the row updates at once and is reloaded if the save fails.
  const setConfirmation = async (o: AdminPhotoOrder, status: ConfirmationStatus) => {
    if ((o.confirmation_status ?? "not_sent") === status) return;
    setOrders((prev) =>
      prev
        ? prev.map((r) =>
            r.id === o.id && r.kind === o.kind ? { ...r, confirmation_status: status } : r,
          )
        : prev,
    );
    try {
      await setPhotoOrderConfirmationAdmin({
        data: { id: o.id, kind: o.kind, confirmation_status: status },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      load();
    }
  };

  // Moves photo orders into the archive (or back). They leave this list at once; reloaded if the save fails.
  const setArchived = async (chosen: AdminPhotoOrder[], archived: boolean) => {
    if (chosen.length === 0) return;
    if (chosen.length > 100) {
      toast.error("Select fewer orders (up to 100 at a time)");
      return;
    }
    const keys = new Set(chosen.map(rowKey));
    setOrders((prev) =>
      prev ? prev.map((r) => (keys.has(rowKey(r)) ? { ...r, admin_archived: archived } : r)) : prev,
    );
    setSelected(new Set());
    try {
      await setPhotoOrdersArchivedAdmin({
        data: { items: chosen.map((o) => ({ id: o.id, kind: o.kind })), archived },
      });
      toast.success(archived ? "Moved to the archive" : "Restored from the archive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      load();
    }
  };

  // Permanent delete after an explicit confirmation; the server keeps a backup copy of each deleted row in the system log.
  const deleteOrders = async (chosen: AdminPhotoOrder[]) => {
    if (chosen.length === 0) return;
    if (chosen.length > 100) {
      toast.error("Select fewer orders (up to 100 at a time)");
      return;
    }
    const label = chosen.map((o) => o.order_number ?? o.id.slice(0, 8)).join(", ");
    const ok = await confirm({
      title:
        chosen.length === 1 ? "Delete this photo order?" : `Delete ${chosen.length} photo orders?`,
      description: `${label} will be deleted permanently. A backup copy of the data is kept in the system log. To keep the order but hide it, use Archive instead.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deletePhotoOrdersAdmin({
        data: { items: chosen.map((o) => ({ id: o.id, kind: o.kind })) },
      });
      toast.success(chosen.length === 1 ? "Order deleted" : `${chosen.length} orders deleted`);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  };

  const copyConfirmation = async (o: AdminPhotoOrder) => {
    try {
      await navigator.clipboard.writeText(buildPhotoConfirmationMessage(o));
      toast.success("Confirmation message copied");
      if ((o.confirmation_status ?? "not_sent") === "not_sent") void setConfirmation(o, "prepared");
    } catch {
      toast.error("Could not copy — open WhatsApp instead");
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

  const archivedCount = orders.filter((o) => o.admin_archived).length;
  const shown = orders.filter((o) => (view === "archive" ? o.admin_archived : !o.admin_archived));
  const chosen = () => shown.filter((o) => selected.has(rowKey(o)));
  const toggleSelected = (o: AdminPhotoOrder) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = rowKey(o);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Photo orders</h2>
        <span className="text-xs text-muted-foreground">{shown.length} orders</span>
        <button
          type="button"
          onClick={() => void setArchived(chosen(), view !== "archive")}
          disabled={selected.size === 0}
          className="ml-auto rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {view === "archive" ? "Restore" : "Archive"} selected ({selected.size})
        </button>
        <button
          type="button"
          onClick={() => void deleteOrders(chosen())}
          disabled={selected.size === 0}
          className="rounded-sm border border-red-500/60 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50"
        >
          Delete selected ({selected.size})
        </button>
      </div>
      <div
        className="mb-4 inline-flex max-w-full overflow-x-auto rounded-sm border border-border text-xs"
        role="tablist"
      >
        {(
          [
            ["all", `All (${orders.length - archivedCount})`],
            ["archive", `Archive (${archivedCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => {
              setView(key);
              setSelected(new Set());
            }}
            className={`px-3 py-1.5 font-medium ${
              view === key
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photo orders yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === "archive" ? "The archive is empty." : "No photo orders in this view."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={shown.length > 0 && selected.size === shown.length}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.size === shown.length ? new Set() : new Set(shown.map(rowKey)),
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Photos</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={`${o.kind}-${o.id}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${o.order_number ?? o.id.slice(0, 8)}`}
                      checked={selected.has(rowKey(o))}
                      onChange={() => toggleSelected(o)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {o.order_number}
                    <div className="mt-0.5 font-sans text-[10px] text-muted-foreground">
                      {formatOrderDateTime(o.created_at)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{photoKindLabel(o.detail).en}</td>
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
                    {photoDetailLabel(o.detail)} · qty {o.quantity}
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
                    <div
                      className={`mt-2 inline-flex rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        CONFIRMATION_TONE[o.confirmation_status ?? "not_sent"] ??
                        CONFIRMATION_TONE.not_sent
                      }`}
                    >
                      {CONFIRMATION_STATUS_LABEL[o.confirmation_status ?? "not_sent"] ??
                        CONFIRMATION_STATUS_LABEL.not_sent}
                    </div>
                    <div
                      className="mt-1.5 flex flex-wrap gap-1"
                      role="group"
                      aria-label="Customer reply"
                    >
                      {(
                        [
                          ["customer_confirmed", "✅ Confirmed"],
                          ["waiting_for_response", "⚠️ Waiting"],
                          ["customer_rejected", "❌ Rejected"],
                        ] as const
                      ).map(([status, label]) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void setConfirmation(o, status)}
                          aria-pressed={o.confirmation_status === status}
                          className={`rounded-sm border px-2 py-1 text-[10px] font-semibold ${
                            o.confirmation_status === status
                              ? CONFIRMATION_TONE[status]
                              : "border-border text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      <a
                        href={waLink(o.phone, buildPhotoConfirmationMessage(o)) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          const cur = o.confirmation_status ?? "not_sent";
                          if (cur === "not_sent" || cur === "prepared")
                            void setConfirmation(o, "sent");
                        }}
                        className="inline-flex min-h-[30px] items-center rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-300"
                        title="Open WhatsApp with the confirmation message"
                      >
                        💬 Confirm on WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyConfirmation(o)}
                        className="text-[11px] text-cyan-500 hover:underline"
                      >
                        Copy message
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetFor(o)}
                        className="inline-flex min-h-[30px] items-center rounded-sm border border-primary/50 bg-primary/15 px-2 text-[11px] font-semibold hover:bg-primary/25"
                      >
                        🧾 Photos + details image
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start gap-2">
                      <button
                        type="button"
                        onClick={() => void setArchived([o], !o.admin_archived)}
                        className="text-xs text-amber-500 hover:underline"
                        title={
                          o.admin_archived ? "Move back to the working list" : "Move to the archive"
                        }
                      >
                        {o.admin_archived ? "Restore" : "Archive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteOrders([o])}
                        className="text-xs text-red-500 hover:underline"
                        title="Delete this order permanently"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sheetFor && <PhotoOrderSheetDialog order={sheetFor} onClose={() => setSheetFor(null)} />}

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
