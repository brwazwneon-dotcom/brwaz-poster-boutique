import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getOrderGroupAdmin,
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
  // The clicked row is one frame — `group` is every `orders` row from the
  // same checkout (same customer_id + created_at; see getOrderGroupAdmin),
  // so a 4-frame order shows and confirms as one order, not four.
  const [group, setGroup] = useState<AdminOrder[] | null>(null);
  const [timeline, setTimeline] = useState<OrderTimelineEvent[] | null>(null);
  const [notes, setNotes] = useState<OrderNote[] | null>(null);
  const [templateKey, setTemplateKey] = useState<WhatsAppTemplateKey>("confirmation");
  const [message, setMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const clickedId = order?.id ?? null;
  const primary = group?.[0] ?? order;
  const primaryId = primary?.id ?? null;

  const refresh = async (id: string) => {
    const [t, n] = await Promise.all([
      getOrderTimelineAdmin({ data: { orderId: id } }),
      getOrderNotesAdmin({ data: { orderId: id } }),
    ]);
    setTimeline(t);
    setNotes(n);
  };

  useEffect(() => {
    if (!open || !clickedId) return;
    setGroup(null);
    setTimeline(null);
    setNotes(null);
    (async () => {
      const rows = (await getOrderGroupAdmin({ data: { orderId: clickedId } })) as AdminOrder[];
      setGroup(rows);
      setMessage(rows[0]?.whatsapp_message ?? "");
      await refresh(rows[0].id);
      logOrderEventAdmin({ data: { orderId: rows[0].id, stage: "admin_viewed" } });
    })();
  }, [open, clickedId]);

  if (!order || !primary) return null;
  const items = group ?? [order];
  const groupIds = items.map((i) => i.id);
  const groupTotal = items.reduce((sum, i) => sum + Number(i.total_price), 0);

  const prepareMessage = () => {
    const text = buildWhatsAppTemplate(templateKey, {
      customer_name: primary.customer_name,
      primaryNumber: primary.order_number ?? primary.id.slice(0, 8),
      governorate: primary.governorate,
      address: primary.address,
      total: groupTotal,
      items: items.map((i) => ({
        poster_title: i.poster_title,
        size: i.size,
        quantity: i.quantity,
      })),
    });
    setMessage(text);
    setConfirmation("prepared", text);
  };

  const setConfirmation = async (status: ConfirmationStatus, msg?: string) => {
    if (!primaryId) return;
    setSaving(true);
    try {
      await updateOrderConfirmationAdmin({
        data: { ids: groupIds, confirmation_status: status, whatsapp_message: msg ?? message },
      });
      onOrderUpdated();
      refresh(primaryId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update confirmation status");
    } finally {
      setSaving(false);
    }
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    toast.success("Copied");
    if (primaryId) logOrderEventAdmin({ data: { orderId: primaryId, stage: "whatsapp_copied" } });
  };

  const openWhatsApp = () => {
    const link = waLink(primary.phone, message);
    if (!link) return toast.error("Invalid phone number");
    window.open(link, "_blank", "noopener,noreferrer");
    if (primaryId) logOrderEventAdmin({ data: { orderId: primaryId, stage: "whatsapp_opened" } });
    if (primary.confirmation_status === "not_sent" || primary.confirmation_status === "prepared") {
      setConfirmation("sent");
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !primaryId) return;
    await addOrderNoteAdmin({ data: { orderId: primaryId, text: newNote.trim() } });
    setNewNote("");
    refresh(primaryId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            Order #{items.map((i) => i.order_number ?? i.id.slice(0, 8)).join(", #")} —{" "}
            {CONFIRMATION_STATUS_LABEL[primary.confirmation_status] ??
              CONFIRMATION_STATUS_LABEL.not_sent}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6 text-sm">
          {/* ---- Customer ---- */}
          <section className="space-y-1 rounded-sm border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Customer
            </h3>
            <div>{primary.customer_name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {primary.phone} · {primary.governorate}
              </span>
              <a
                href={customerWhatsappLink(primary.phone)}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-500 hover:underline"
              >
                WA
              </a>
            </div>
            <div className="text-xs text-muted-foreground">{primary.address}</div>
            {primary.notes && (
              <div className="text-xs italic text-muted-foreground">"{primary.notes}"</div>
            )}
          </section>

          {/* ---- Items / pricing ---- */}
          <section className="space-y-2 rounded-sm border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Order Items {items.length > 1 ? `(${items.length} frames)` : ""}
            </h3>
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-3">
                {i.poster_image && (
                  <img
                    src={i.poster_image}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-sm border border-border object-cover"
                  />
                )}
                <div className="flex-1">
                  <div>{i.poster_title}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.size} · {i.frame_type} · {i.frame_color} · × {i.quantity}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">{i.total_price} EGP</div>
              </div>
            ))}
            <div className="border-t border-border pt-2 text-sm font-semibold">
              TOTAL: {groupTotal} EGP
            </div>
            <div className="text-xs text-muted-foreground">
              {primary.payment_method} / {primary.payment_status}
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
            {primary.confirmed_at && (
              <p className="text-[11px] text-muted-foreground">
                Confirmed {new Date(primary.confirmed_at).toLocaleString()} by{" "}
                {primary.confirmed_by}
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
                          primaryId &&
                          updateOrderNoteAdmin({
                            data: { id: n.id, orderId: primaryId, pinned: !n.pinned },
                          }).then(() => refresh(primaryId))
                        }
                        className="text-[10px] text-cyan-500 hover:underline"
                      >
                        {n.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        onClick={() =>
                          primaryId &&
                          deleteOrderNoteAdmin({ data: { id: n.id, orderId: primaryId } }).then(
                            () => refresh(primaryId),
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
