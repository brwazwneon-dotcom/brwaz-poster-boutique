import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getOrderTimelineAdmin,
  logOrderEventAdmin,
  getOrderNotesAdmin,
  addOrderNoteAdmin,
  updateOrderNoteAdmin,
  deleteOrderNoteAdmin,
  updateOrderConfirmationAdmin,
  type OrderTimelineEvent,
  type OrderNote,
} from "@/lib/order-ops.functions";
import {
  WHATSAPP_TEMPLATES,
  CONFIRMATION_STATUS_LABEL,
  QUICK_NOTES,
  humanStage,
  buildWhatsAppTemplate,
  waLink,
  type WhatsAppTemplateKey,
  type ConfirmationStatus,
} from "@/lib/order-whatsapp";
import { customerWhatsappLink } from "./shared";
import type { AdminOrder } from "./OrdersTab";

export function OrderDetailsDrawer({
  order,
  open,
  onOpenChange,
  onOrderUpdated,
}: {
  order: AdminOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated: () => void;
}) {
  const [timeline, setTimeline] = useState<OrderTimelineEvent[] | null>(null);
  const [notes, setNotes] = useState<OrderNote[] | null>(null);
  const [templateKey, setTemplateKey] = useState<WhatsAppTemplateKey>("confirmation");
  const [message, setMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const orderId = order?.id ?? null;

  const refresh = async (id: string) => {
    const [t, n] = await Promise.all([
      getOrderTimelineAdmin({ data: { orderId: id } }),
      getOrderNotesAdmin({ data: { orderId: id } }),
    ]);
    setTimeline(t);
    setNotes(n);
  };

  useEffect(() => {
    if (!open || !orderId) return;
    setMessage(order?.whatsapp_message ?? "");
    setTimeline(null);
    setNotes(null);
    refresh(orderId);
    logOrderEventAdmin({ data: { orderId, stage: "admin_viewed" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  if (!order) return null;

  const prepareMessage = () => {
    const text = buildWhatsAppTemplate(templateKey, {
      customer_name: order.customer_name,
      primaryNumber: order.order_number ?? order.id.slice(0, 8),
      governorate: order.governorate,
      address: order.address,
      total: order.total_price,
      items: [{ poster_title: order.poster_title, size: order.size, quantity: order.quantity }],
    });
    setMessage(text);
    setConfirmation("prepared", text);
  };

  const setConfirmation = async (status: ConfirmationStatus, msg?: string) => {
    setSaving(true);
    try {
      await updateOrderConfirmationAdmin({
        data: { id: order.id, confirmation_status: status, whatsapp_message: msg ?? message },
      });
      onOrderUpdated();
      refresh(order.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update confirmation status");
    } finally {
      setSaving(false);
    }
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    toast.success("Copied");
    logOrderEventAdmin({ data: { orderId: order.id, stage: "whatsapp_copied" } });
  };

  const openWhatsApp = () => {
    const link = waLink(order.phone, message);
    if (!link) return toast.error("Invalid phone number");
    window.open(link, "_blank", "noopener,noreferrer");
    logOrderEventAdmin({ data: { orderId: order.id, stage: "whatsapp_opened" } });
    if (order.confirmation_status === "not_sent" || order.confirmation_status === "prepared") {
      setConfirmation("sent");
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await addOrderNoteAdmin({ data: { orderId: order.id, text: newNote.trim() } });
    setNewNote("");
    refresh(order.id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            Order #{order.order_number ?? order.id.slice(0, 8)} —{" "}
            {CONFIRMATION_STATUS_LABEL[order.confirmation_status] ??
              CONFIRMATION_STATUS_LABEL.not_sent}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6 text-sm">
          {/* ---- Customer ---- */}
          <section className="space-y-1 rounded-sm border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Customer
            </h3>
            <div>{order.customer_name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {order.phone} · {order.governorate}
              </span>
              <a
                href={customerWhatsappLink(order.phone)}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-500 hover:underline"
              >
                WA
              </a>
            </div>
            <div className="text-xs text-muted-foreground">{order.address}</div>
            {order.notes && (
              <div className="text-xs italic text-muted-foreground">"{order.notes}"</div>
            )}
          </section>

          {/* ---- Item / pricing ---- */}
          <section className="space-y-1 rounded-sm border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Order Item
            </h3>
            <div className="flex items-center gap-3">
              {order.poster_image && (
                <img
                  src={order.poster_image}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-sm border border-border object-cover"
                />
              )}
              <div>
                <div>{order.poster_title}</div>
                <div className="text-xs text-muted-foreground">
                  {order.size} · {order.frame_type} · {order.frame_color} · × {order.quantity}
                </div>
              </div>
            </div>
            <div className="pt-1 text-sm font-semibold">TOTAL: {order.total_price} EGP</div>
            <div className="text-xs text-muted-foreground">
              {order.payment_method} / {order.payment_status}
            </div>
          </section>

          {/* ---- WhatsApp confirmation ---- */}
          <section className="space-y-2 rounded-sm border border-primary/30 bg-primary/5 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              WhatsApp Confirmation
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value as WhatsAppTemplateKey)}
                className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
              >
                {WHATSAPP_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.icon} {t.title}
                  </option>
                ))}
              </select>
              <button
                onClick={prepareMessage}
                disabled={saving}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                💬 Prepare / Regenerate
              </button>
            </div>
            <textarea
              dir="rtl"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              placeholder="Prepare a message above, or write one manually…"
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyMessage}
                disabled={!message}
                className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                📋 Copy Message
              </button>
              <button
                onClick={openWhatsApp}
                disabled={!message}
                className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                💬 Open WhatsApp
              </button>
              <button
                onClick={() => setConfirmation("customer_confirmed")}
                disabled={saving}
                className="rounded-sm border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-500 disabled:opacity-50"
              >
                ✅ Customer Confirmed
              </button>
              <button
                onClick={() => setConfirmation("waiting_for_response")}
                disabled={saving}
                className="rounded-sm border border-amber-500/40 px-3 py-1.5 text-xs text-amber-500 disabled:opacity-50"
              >
                ⚠️ Waiting
              </button>
              <button
                onClick={() => setConfirmation("customer_rejected")}
                disabled={saving}
                className="rounded-sm border border-red-500/40 px-3 py-1.5 text-xs text-red-500 disabled:opacity-50"
              >
                ❌ Rejected
              </button>
            </div>
            {order.confirmed_at && (
              <p className="text-[11px] text-muted-foreground">
                Confirmed {new Date(order.confirmed_at).toLocaleString()} by {order.confirmed_by}
              </p>
            )}
          </section>

          {/* ---- Internal notes ---- */}
          <section className="space-y-2 rounded-sm border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Internal Notes
            </h3>
            <div className="flex flex-wrap gap-1">
              {QUICK_NOTES.map((qn) => (
                <button
                  key={qn}
                  onClick={() => setNewNote(qn)}
                  className="rounded-sm border border-border px-2 py-1 text-[10px] hover:bg-accent"
                >
                  {qn}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addNote();
                }}
                placeholder="Add an internal note…"
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={addNote}
                disabled={!newNote.trim()}
                className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {notes === null ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No notes yet.</p>
            ) : (
              <div className="space-y-1">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start justify-between gap-2 rounded-sm border border-border p-2"
                  >
                    <div>
                      <div className="text-xs">{n.text}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {n.author} · {new Date(n.created_at).toLocaleString()}
                        {n.pinned ? " · 📌 pinned" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() =>
                          updateOrderNoteAdmin({
                            data: { id: n.id, orderId: order.id, pinned: !n.pinned },
                          }).then(() => refresh(order.id))
                        }
                        className="text-[10px] text-cyan-500 hover:underline"
                      >
                        {n.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        onClick={() =>
                          deleteOrderNoteAdmin({ data: { id: n.id, orderId: order.id } }).then(() =>
                            refresh(order.id),
                          )
                        }
                        className="text-[10px] text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---- Timeline ---- */}
          <section className="space-y-2 rounded-sm border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Order Timeline
            </h3>
            {timeline === null ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events yet.</p>
            ) : (
              <ol className="space-y-1.5 border-l border-border pl-3">
                {timeline.map((ev) => (
                  <li key={ev.id} className="text-xs">
                    <span className="font-medium">{humanStage(ev.stage)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {new Date(ev.created_at).toLocaleString()}
                      {ev.actor ? ` · ${ev.actor}` : ""}
                    </span>
                    {ev.note && <div className="text-muted-foreground">{ev.note}</div>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
