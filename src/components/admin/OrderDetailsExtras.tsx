import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  MessageCircle,
  Send,
  Pin,
  PinOff,
  Trash2,
  Clock,
  Loader2,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  fetchTimeline,
  fetchNotes,
  logTimeline,
  addNote,
  updateNote,
  deleteNote,
  validateOrder,
  WHATSAPP_TEMPLATES,
  buildWhatsAppTemplate,
  waLink,
  QUICK_NOTES,
  humanStage,
  type CheckResult,
  type WhatsAppTemplateKey,
} from "@/lib/order-management";
import { cn } from "@/lib/utils";

type LiteItem = {
  id: string;
  poster_image?: string | null;
  poster_title?: string | null;
  size?: string | null;
  quantity?: number | null;
  total_price?: number | null;
};
type LiteGroup = {
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  primaryNumber: string;
  items: LiteItem[];
  total: number;
  subtotal: number;
  shipping: number;
};

export function OrderDetailsExtras({ g }: { g: LiteGroup }) {
  const orderIds = useMemo(() => g.items.map((i) => i.id), [g.items]);
  const primaryId = orderIds[0];

  return (
    <div className="space-y-6">
      <OrderCheckBox g={g} primaryId={primaryId} />
      <WhatsAppMessages g={g} primaryId={primaryId} />
      <InternalNotes orderIds={orderIds} primaryId={primaryId} />
      <OrderTimeline orderIds={orderIds} />
    </div>
  );
}

/* ---------------- Order Check ---------------- */
function toneOf(r: CheckResult) {
  if (r === "passed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (r === "warning") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}
function iconOf(r: CheckResult) {
  if (r === "passed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (r === "warning") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <XCircle className="h-3.5 w-3.5" />;
}

function OrderCheckBox({ g, primaryId }: { g: LiteGroup; primaryId: string }) {
  const [check, setCheck] = useState(() => validateOrder(g));
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    await new Promise((r) => setTimeout(r, 300));
    const result = validateOrder(g);
    setCheck(result);
    setRunning(false);
    await logTimeline(primaryId, "order_check_run", {
      status: result.overall === "ready" ? "completed" : "pending",
      note: `${result.overall === "ready" ? "Ready to Confirm" : "Needs Review"} — ${result.issues.length} issues`,
    });
    toast.success("Order check refreshed");
  };

  const items: { key: keyof typeof check.groups; label: string }[] = [
    { key: "customer", label: "Customer Info" },
    { key: "phone", label: "Phone Number" },
    { key: "address", label: "Address" },
    { key: "images", label: "Images" },
    { key: "products", label: "Products" },
    { key: "pricing", label: "Pricing" },
    { key: "whatsapp", label: "WhatsApp Message" },
  ];

  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-display text-lg">Order Check</div>
          <div className="text-[11px] text-muted-foreground">
            Smart validation before confirming the order.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest",
              check.overall === "ready"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            {check.overall === "ready" ? "Ready to Confirm" : "Needs Review"}
          </span>
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Run Order Check
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(({ key, label }) => (
          <div key={key} className={cn("flex items-center gap-2 rounded-sm border px-2 py-1.5 text-xs", toneOf(check.groups[key]))}>
            {iconOf(check.groups[key])}
            <span className="truncate">{label}</span>
            <span className="ms-auto text-[9px] uppercase tracking-widest opacity-80">{check.groups[key]}</span>
          </div>
        ))}
      </div>

      {check.issues.length > 0 && (
        <div className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
            Issues to fix ({check.issues.length})
          </div>
          <ul className="space-y-1 text-xs text-amber-200/90">
            {check.issues.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {it}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------------- WhatsApp Messages ---------------- */
function WhatsAppMessages({ g, primaryId }: { g: LiteGroup; primaryId: string }) {
  const [active, setActive] = useState<WhatsAppTemplateKey>("confirmation");
  const message = useMemo(() => buildWhatsAppTemplate(active, g), [active, g]);
  const link = waLink(g.phone, message);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
      await logTimeline(primaryId, "whatsapp_copied", { note: `Template: ${active}` });
    } catch {
      toast.error("Could not copy");
    }
  };
  const onOpen = async () => {
    if (!link) {
      toast.error("Phone number is not valid for WhatsApp");
      return;
    }
    window.open(link, "_blank", "noreferrer");
    await logTimeline(primaryId, "whatsapp_opened", { note: `Template: ${active}` });
  };
  const onSent = async () => {
    await logTimeline(primaryId, "whatsapp_marked_sent", {
      note: `Template: ${active}`,
      status: "completed",
    });
    if (active === "confirmation") {
      await logTimeline(primaryId, "whatsapp_confirmation_sent");
    }
    try {
      await addNote(primaryId, `تم إرسال رسالة واتساب: ${active}`);
    } catch {/* ignore */}
    toast.success("Marked as sent");
  };

  return (
    <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-display text-lg">WhatsApp Messages</div>
        <MessageCircle className="h-5 w-5 text-emerald-400" />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {WHATSAPP_TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition",
              active === t.key
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <span className="me-1">{t.icon}</span> {t.title}
          </button>
        ))}
      </div>
      <textarea
        readOnly
        value={message}
        dir="rtl"
        rows={10}
        className="w-full rounded-sm border border-border bg-background p-3 text-sm outline-none focus:border-primary"
      />
      {!link && (
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Phone number is missing or invalid — WhatsApp link disabled.
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent"
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        <button
          onClick={onOpen}
          disabled={!link}
          className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
        </button>
        <button
          onClick={onSent}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent"
        >
          <Send className="h-3.5 w-3.5" /> Mark as Sent
        </button>
      </div>
    </div>
  );
}

/* ---------------- Internal Notes ---------------- */
function InternalNotes({ orderIds, primaryId }: { orderIds: string[]; primaryId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["order-notes", ...orderIds],
    queryFn: () => fetchNotes(orderIds),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["order-notes"] });
    qc.invalidateQueries({ queryKey: ["order-timeline"] });
  };

  const add = useMutation({
    mutationFn: (t: string) => addNote(primaryId, t),
    onSuccess: () => { setText(""); invalidate(); toast.success("Note added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePin = useMutation({
    mutationFn: (n: { id: string; pinned: boolean }) =>
      updateNote(n.id, { pinned: !n.pinned }, primaryId),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteNote(id, primaryId),
    onSuccess: () => { invalidate(); toast.success("Note deleted"); },
  });

  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-display text-lg">Internal Notes</div>
          <div className="text-[11px] text-muted-foreground">Not visible to the customer.</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_NOTES.map((q) => (
          <button
            key={q}
            onClick={() => add.mutate(q)}
            disabled={add.isPending}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> {q}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) add.mutate(text.trim()); }}
          placeholder="Add an internal note…"
          className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => text.trim() && add.mutate(text.trim())}
          disabled={!text.trim() || add.isPending}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">
          No internal notes yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-sm border p-3",
                n.pinned ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="whitespace-pre-wrap text-sm">{n.text}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {n.author ?? "admin"} · {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => togglePin.mutate({ id: n.id, pinned: n.pinned })}
                    className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={n.pinned ? "Unpin" : "Pin"}
                  >
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => confirm("Delete note?") && del.mutate(n.id)}
                    className="rounded-sm p-1 text-red-400 hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Order Timeline ---------------- */
function OrderTimeline({ orderIds }: { orderIds: string[] }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["order-timeline", ...orderIds],
    queryFn: () => fetchTimeline(orderIds),
    refetchInterval: 30_000,
  });

  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <div className="text-display text-lg">Order Timeline</div>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading timeline…</div>
      ) : events.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">
          No timeline events yet.
        </div>
      ) : (
        <ol className="relative ms-3 space-y-3 border-s border-border ps-4">
          {events.map((e) => {
            const tone =
              e.status === "failed"
                ? "bg-red-500"
                : e.status === "pending"
                ? "bg-amber-500"
                : "bg-emerald-500";
            return (
              <li key={e.id} className="relative">
                <span className={cn("absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full", tone)} />
                <div className="text-sm font-medium">{humanStage(e.stage)}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()} · {e.actor ?? "system"} ·{" "}
                  <span
                    className={cn(
                      e.status === "failed" && "text-red-400",
                      e.status === "pending" && "text-amber-400",
                      e.status === "completed" && "text-emerald-400",
                    )}
                  >
                    {e.status}
                  </span>
                </div>
                {e.note && <div className="mt-1 text-xs text-muted-foreground">{e.note}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}