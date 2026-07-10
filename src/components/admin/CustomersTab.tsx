import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search, User as UserIcon, Phone as PhoneIcon, MapPin, MessageCircle, Copy,
  X, ShoppingBag, Pin, PinOff, Trash2, Plus, Loader2,
} from "lucide-react";

type Customer = {
  key: string;
  name: string | null;
  phone: string | null;
  governorate: string | null;
  last_address: string | null;
  orders_count: number;
  total_spent: number;
  first_order: string | null;
  last_order: string | null;
  cancelled_count: number;
  segment: "new" | "returning" | "vip" | "problem";
};
type ListResp = {
  total: number;
  rows: Customer[];
  segments: { new: number; returning: number; vip: number; problem: number };
};

const SEGMENT_TONE: Record<string, string> = {
  new: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  returning: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  vip: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  problem: "border-red-500/40 bg-red-500/10 text-red-300",
};
const SEGMENT_LABEL: Record<string, string> = {
  new: "New", returning: "Returning", vip: "VIP", problem: "Problem",
};

function waLink(phone: string | null, message = "") {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const intl = digits.startsWith("20") ? digits : digits.startsWith("0") ? `2${digits}` : digits;
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function CustomersTab() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [page, setPage] = useState(0);
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", search, segment, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_customers_list" as never, {
        p_search: search || null, p_segment: segment,
        p_limit: pageSize, p_offset: page * pageSize,
      } as never);
      if (error) throw error;
      return data as unknown as ListResp;
    },
  });

  const rows = data?.rows ?? [];
  const segs = data?.segments ?? { new: 0, returning: 0, vip: 0, problem: 0 };
  const total = data?.total ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["new", "returning", "vip", "problem"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setSegment(s === segment ? "all" : s); setPage(0); }}
            className={cn(
              "rounded-sm border p-3 text-left transition",
              segment === s ? SEGMENT_TONE[s] : "border-border bg-background hover:bg-accent",
            )}
          >
            <div className="text-[10px] uppercase tracking-widest opacity-80">{SEGMENT_LABEL[s]}</div>
            <div className="mt-1 text-2xl font-semibold">{segs[s]}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name or phone…"
            className="w-full rounded-sm border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={segment}
          onChange={(e) => { setSegment(e.target.value); setPage(0); }}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All segments</option>
          <option value="new">New</option>
          <option value="returning">Returning</option>
          <option value="vip">VIP</option>
          <option value="problem">Problem</option>
        </select>
      </div>

      <div className="rounded-sm border border-border bg-background">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading customers…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No customers match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Customer</th>
                  <th className="p-2 text-left">Phone</th>
                  <th className="p-2 text-left">Governorate</th>
                  <th className="p-2 text-right">Orders</th>
                  <th className="p-2 text-right">Spent</th>
                  <th className="p-2 text-left">Last Order</th>
                  <th className="p-2 text-left">Segment</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.key} className="border-t border-border">
                    <td className="p-2">{c.name ?? "—"}</td>
                    <td className="p-2" dir="ltr">{c.phone ?? "—"}</td>
                    <td className="p-2">{c.governorate ?? "—"}</td>
                    <td className="p-2 text-right">{c.orders_count}</td>
                    <td className="p-2 text-right">{Math.round(Number(c.total_spent))} EGP</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {c.last_order ? new Date(c.last_order).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-2">
                      <span className={cn("rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest", SEGMENT_TONE[c.segment])}>
                        {SEGMENT_LABEL[c.segment]}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => setOpenPhone(c.phone)}
                        disabled={!c.phone}
                        className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-50"
                      >Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>Showing {rows.length} of {total}</div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-sm border border-border px-2 py-1 disabled:opacity-50 hover:bg-accent"
          >Prev</button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * pageSize >= total}
            className="rounded-sm border border-border px-2 py-1 disabled:opacity-50 hover:bg-accent"
          >Next</button>
        </div>
      </div>

      {openPhone && <CustomerProfileModal phone={openPhone} onClose={() => setOpenPhone(null)} />}
    </div>
  );
}

/* ---------- Profile modal ---------- */
function CustomerProfileModal({ phone, onClose }: { phone: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customer-profile", phone],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_customer_profile", { _phone: phone });
      if (error) throw error;
      return data as {
        profile: Record<string, unknown> | null;
        orders: Array<{
          id: string; order_number: string | null; customer_name: string;
          governorate: string; total_price: number; status: string;
          created_at: string; poster_title: string | null;
        }>;
        wishlist: Array<{ id: string; title: string; image_url: string | null; created_at: string }>;
        viewed: Array<{ id: string; title: string; image_url: string | null }>;
      };
    },
  });

  const orders = data?.orders ?? [];
  const stats = useMemo(() => {
    const total = orders.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
    const avg = orders.length ? total / orders.length : 0;
    const first = orders.at(-1)?.created_at;
    const last = orders[0]?.created_at;
    const segment: "new" | "returning" | "vip" =
      orders.length >= 5 || total >= 3000 ? "vip" : orders.length > 1 ? "returning" : "new";
    return { total, avg, first, last, segment, count: orders.length };
  }, [orders]);

  const profile = orders[0];
  const summary = profile
    ? `Customer: ${profile.customer_name}\nPhone: ${phone}\nGovernorate: ${profile.governorate}\nOrders: ${stats.count}\nTotal Spent: ${Math.round(stats.total)} EGP\nAvg Order: ${Math.round(stats.avg)} EGP\nSegment: ${stats.segment.toUpperCase()}\nLast Order: ${stats.last ? new Date(stats.last).toLocaleDateString() : "—"}`
    : `Phone: ${phone}`;

  const copySummary = async () => {
    await navigator.clipboard.writeText(summary);
    toast.success("Customer summary copied");
  };
  const wa = waLink(phone);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-4xl rounded-sm border border-border bg-card">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 p-5 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-display text-2xl">{profile?.customer_name ?? "Customer"}</h3>
              <span className={cn("rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest", SEGMENT_TONE[stats.segment])}>
                {SEGMENT_LABEL[stats.segment]}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><PhoneIcon className="h-3 w-3" /><span dir="ltr">{phone}</span></span>
              {profile?.governorate && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.governorate}</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Orders" value={stats.count} />
                <Metric label="Total Spent" value={`${Math.round(stats.total)} EGP`} />
                <Metric label="Avg Order" value={`${Math.round(stats.avg)} EGP`} />
                <Metric label="First Order" value={stats.first ? new Date(stats.first).toLocaleDateString() : "—"} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={copySummary} className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent">
                  <Copy className="h-3.5 w-3.5" /> Copy Customer Summary
                </button>
                {wa ? (
                  <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20">
                    <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Phone not WhatsApp-compatible</span>
                )}
              </div>

              <CustomerNotesBlock phone={phone} qc={qc} />

              <div>
                <div className="mb-2 text-display text-lg">Orders ({orders.length})</div>
                <div className="overflow-x-auto rounded-sm border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-t border-border">
                          <td className="p-2">{o.order_number ?? o.id.slice(0, 8)}</td>
                          <td className="p-2 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</td>
                          <td className="p-2 text-xs uppercase">{o.status}</td>
                          <td className="p-2 text-xs">{o.poster_title ?? "—"}</td>
                          <td className="p-2 text-right">{Math.round(Number(o.total_price ?? 0))} EGP</td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr><td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">No orders yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {data?.wishlist && data.wishlist.length > 0 && (
                <div>
                  <div className="mb-2 text-display text-lg">Wishlist</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {data.wishlist.slice(0, 12).map((w) => (
                      <div key={w.id} className="rounded-sm border border-border p-1">
                        {w.image_url && <img src={w.image_url} alt={w.title} className="aspect-square w-full object-cover" loading="lazy" />}
                        <div className="truncate p-1 text-[10px] text-muted-foreground">{w.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

/* ---------- Customer notes ---------- */
type CNote = { id: string; phone: string; text: string; pinned: boolean; author: string | null; created_at: string };

function CustomerNotesBlock({ phone, qc }: { phone: string; qc: ReturnType<typeof useQueryClient> }) {
  const [text, setText] = useState("");
  const { data: notes = [] } = useQuery({
    queryKey: ["customer-notes", phone],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_notes" as never).select("*").eq("phone", phone)
        .order("pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CNote[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["customer-notes", phone] });

  const add = useMutation({
    mutationFn: async (t: string) => {
      const { error } = await supabase.from("customer_notes" as never).insert({ phone, text: t, author: "admin" } as never);
      if (error) throw error;
    },
    onSuccess: () => { setText(""); invalidate(); toast.success("Note added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const togglePin = useMutation({
    mutationFn: async (n: CNote) => {
      const { error } = await supabase.from("customer_notes" as never).update({ pinned: !n.pinned } as never).eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_notes" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-2 text-display text-lg">Customer Notes</div>
      <div className="mb-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) add.mutate(text.trim()); }}
          placeholder="Add a note about this customer…"
          className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        <button onClick={() => text.trim() && add.mutate(text.trim())} disabled={!text.trim() || add.isPending}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">No notes yet.</div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={cn("rounded-sm border p-3", n.pinned ? "border-amber-500/40 bg-amber-500/5" : "border-border")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="whitespace-pre-wrap text-sm">{n.text}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {n.author ?? "admin"} · {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => togglePin.mutate(n)} className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => confirm("Delete note?") && del.mutate(n.id)} className="rounded-sm p-1 text-red-400 hover:bg-red-500/10">
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