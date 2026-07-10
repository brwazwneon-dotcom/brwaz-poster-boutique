import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Copy, MessageCircle, Check, X as XIcon, Loader2, ShoppingCart, Phone as PhoneIcon } from "lucide-react";

type Row = {
  visitor_id: string;
  phone: string | null;
  city: string | null;
  governorate: string | null;
  last_activity: string;
  last_add: string | null;
  last_checkout_start: string | null;
  add_count: number;
  last_step: "browsing" | "cart_added" | "checkout_started";
  has_phone: boolean;
  items: Array<{ id: string; title: string; image_url: string | null }>;
};
type Resp = { total: number; today: number; with_phone: number; rows: Row[] };

const STEP_LABEL: Record<string, string> = {
  browsing: "Browsing",
  cart_added: "Added to Cart",
  checkout_started: "Checkout Started",
};

const MESSAGES: { key: string; title: string; text: (name: string) => string }[] = [
  {
    key: "with_images",
    title: "Uploaded images / no order",
    text: (n) => `أهلًا يا ${n || "حضرتك"} 👋\nلاحظنا إن حضرتك بدأت تعمل أوردر على Brwaz W Neon ورفعت الصور، لكن الأوردر مكملش.\n\nتحب نساعدك نكمل الطلب؟ ❤️`,
  },
  {
    key: "selected_product",
    title: "Selected product / no order",
    text: () => `أهلًا 👋\nحضرتك كنت بتجهز أوردر على Brwaz W Neon، ولو محتاج أي مساعدة في اختيار المقاس أو الصور إحنا معاك ❤️`,
  },
  {
    key: "upload_issue",
    title: "Upload issue",
    text: (n) => `أهلًا يا ${n || "حضرتك"} 👋\nواضح إن حصلت مشكلة أثناء رفع الصور.\nممكن تبعتلنا الصور هنا على واتساب وإحنا نكمل الأوردر لحضرتك ❤️`,
  },
];

function waLink(phone: string | null, message: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const intl = digits.startsWith("20") ? digits : digits.startsWith("0") ? `2${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export function AbandonedOrdersTab() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [recovered, setRecovered] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [filter, setFilter] = useState<"all" | "with_phone" | "cart_added" | "checkout_started">("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-abandoned"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_abandoned_orders" as never, { p_limit: 200 } as never);
      if (error) throw error;
      return data as unknown as Resp;
    },
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => !hidden.has(r.visitor_id));
    if (filter === "with_phone") return list.filter((r) => r.has_phone);
    if (filter === "cart_added") return list.filter((r) => r.last_step === "cart_added");
    if (filter === "checkout_started") return list.filter((r) => r.last_step === "checkout_started");
    return list;
  }, [data, hidden, filter]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Abandoned Total" value={data?.total ?? 0} />
        <Card label="Today" value={data?.today ?? 0} />
        <Card label="With Phone" value={data?.with_phone ?? 0} />
        <Card label="Recovered" value={recovered.size} tone="emerald" />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["all", "with_phone", "cart_added", "checkout_started"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-sm border px-3 py-1.5 uppercase tracking-widest",
              filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
            )}>{f.replace("_", " ")}</button>
        ))}
        <button onClick={() => refetch()} className="ml-auto rounded-sm border border-border px-3 py-1.5 uppercase tracking-widest hover:bg-accent">Refresh</button>
      </div>

      <div className="rounded-sm border border-border bg-background">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading abandoned carts…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">🎉 No abandoned carts.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const isRec = recovered.has(r.visitor_id);
              return (
                <li key={r.visitor_id} className={cn("flex flex-wrap items-center gap-3 p-3", isRec && "opacity-60")}>
                  <div className="flex -space-x-2">
                    {r.items.slice(0, 3).map((it) => (
                      it.image_url
                        ? <img key={it.id} src={it.image_url} alt={it.title} className="h-10 w-10 rounded-sm border border-border object-cover" loading="lazy" />
                        : <div key={it.id} className="h-10 w-10 rounded-sm border border-border bg-muted" />
                    ))}
                    {r.items.length > 3 && <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-muted text-[10px]">+{r.items.length - 3}</div>}
                    {r.items.length === 0 && <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-muted"><ShoppingCart className="h-4 w-4 text-muted-foreground" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{r.items[0]?.title ?? "Cart"}</span>
                      {r.items.length > 1 && <span className="text-xs text-muted-foreground">+{r.items.length - 1} more</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className={cn(
                        "rounded-sm border px-1.5 py-0.5 uppercase tracking-widest",
                        r.last_step === "checkout_started" ? "border-amber-500/40 text-amber-300" : "border-border",
                      )}>{STEP_LABEL[r.last_step]}</span>
                      {r.has_phone && <span className="flex items-center gap-1"><PhoneIcon className="h-3 w-3" /><span dir="ltr">{r.phone}</span></span>}
                      {r.governorate && <span>{r.governorate}</span>}
                      <span>Last: {new Date(r.last_activity).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setOpenRow(r)}
                      disabled={!r.has_phone}
                      className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                      <MessageCircle className="mr-1 inline h-3 w-3" /> Follow-up
                    </button>
                    <button onClick={() => setRecovered((s) => new Set(s).add(r.visitor_id))}
                      className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent">
                      <Check className="mr-1 inline h-3 w-3" /> Recovered
                    </button>
                    <button onClick={() => setHidden((s) => new Set(s).add(r.visitor_id))}
                      className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-accent">
                      <XIcon className="mr-1 inline h-3 w-3" /> Ignore
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openRow && <FollowUpModal row={openRow} onClose={() => setOpenRow(null)} onContacted={() => {
        setRecovered((s) => new Set(s).add(openRow.visitor_id));
        setOpenRow(null);
      }} />}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number | string; tone?: "emerald" }) {
  return (
    <div className={cn("rounded-sm border border-border bg-background p-3", tone === "emerald" && "border-emerald-500/40 bg-emerald-500/5")}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function FollowUpModal({ row, onClose, onContacted }: { row: Row; onClose: () => void; onContacted: () => void }) {
  const [tab, setTab] = useState(MESSAGES[0].key);
  const active = MESSAGES.find((m) => m.key === tab)!;
  const name = ""; // visitor name not tracked
  const msg = active.text(name);
  const wa = waLink(row.phone, msg);

  const copy = async () => {
    await navigator.clipboard.writeText(msg);
    toast.success("Message copied");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl rounded-sm border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-display text-xl">Follow-up Message</div>
          <button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:text-foreground"><XIcon className="h-5 w-5" /></button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MESSAGES.map((m) => (
            <button key={m.key} onClick={() => setTab(m.key)}
              className={cn("rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest",
                tab === m.key ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" : "border-border text-muted-foreground hover:bg-accent")}>
              {m.title}
            </button>
          ))}
        </div>
        <textarea readOnly value={msg} dir="rtl" rows={8}
          className="w-full rounded-sm border border-border bg-background p-3 text-sm outline-none focus:border-primary" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent">
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20">
              <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
            </a>
          ) : <span className="text-xs text-muted-foreground">No valid phone.</span>}
          <button onClick={onContacted} className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20">
            <Check className="h-3.5 w-3.5" /> Mark as Contacted
          </button>
        </div>
      </div>
    </div>
  );
}