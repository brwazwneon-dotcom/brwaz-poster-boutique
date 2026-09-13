import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listCustomersAdmin,
  getCustomerDetailAdmin,
  upsertCustomerAdmin,
  SEGMENT_LABELS,
} from "@/lib/db-admin.functions";
import { LoadingRows, LoadingTiles } from "@/components/admin/layout/LoadingState";

type AdminCustomer = {
  id: string;
  phone: string;
  customer_name: string;
  governorate: string;
  tags: string[];
  order_count: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
  cancelled_count: number;
  segments: string[];
};

type CustomerRecord = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  governorate: string | null;
  tags: string[];
  notes: string | null;
  source: string | null;
  created_at: string;
};

type CustomerOrder = {
  id: string;
  order_number: string | null;
  poster_title: string | null;
  poster_image: string | null;
  total_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

const SEGMENT_BADGE_CLASS: Record<string, string> = {
  new: "bg-cyan-500/15 text-cyan-500",
  returning: "bg-accent text-muted-foreground",
  frequent: "bg-primary/15 text-primary",
  vip: "bg-amber-500/15 text-amber-500",
  has_cancellations: "bg-red-500/15 text-red-500",
  inactive: "bg-accent text-muted-foreground",
  at_risk: "bg-red-500/15 text-red-500",
};

export function CustomersTab() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [q, setQ] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => setCustomers((await listCustomersAdmin()) as AdminCustomer[]);
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (segmentFilter && !c.segments.includes(segmentFilter)) return false;
      if (!needle) return true;
      return c.phone.includes(needle) || c.customer_name.toLowerCase().includes(needle);
    });
  }, [customers, q, segmentFilter]);

  if (customers === null) return <LoadingRows />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Customers</h2>
        <div className="flex items-center gap-2">
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">All segments</option>
            {Object.entries(SEGMENT_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <input
            placeholder="Search name or phone…"
            dir="ltr"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56 rounded-sm border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers match.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Governorate</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Total spent</th>
                <th className="px-3 py-2">Last order</th>
                <th className="px-3 py-2">Segments</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2">{c.customer_name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                  <td className="px-3 py-2 text-xs">{c.governorate || "—"}</td>
                  <td className="px-3 py-2">{c.order_count}</td>
                  <td className="px-3 py-2 font-medium">{Number(c.total_spent)} EGP</td>
                  <td className="px-3 py-2 text-xs">
                    {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.segments.map((s) => (
                        <span
                          key={s}
                          className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                            SEGMENT_BADGE_CLASS[s] ?? "bg-accent text-muted-foreground"
                          }`}
                        >
                          {SEGMENT_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <CustomerDetailPanel
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomerDetailPanel({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [favoriteCategory, setFavoriteCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getCustomerDetailAdmin({ data: { id } });
      if (cancelled) return;
      setCustomer(res.customer as CustomerRecord);
      setEditing(res.customer as CustomerRecord);
      setOrders(res.orders as CustomerOrder[]);
      setFavoriteCategory(res.favoriteCategory);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await upsertCustomerAdmin({
        data: {
          id: editing.id,
          name: editing.name,
          email: editing.email,
          address: editing.address,
          governorate: editing.governorate,
          tags: editing.tags,
          notes: editing.notes,
        },
      });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || !editing) return;
    if (editing.tags.includes(tag)) return setTagInput("");
    setEditing({ ...editing, tags: [...editing.tags, tag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    if (!editing) return;
    setEditing({ ...editing, tags: editing.tags.filter((t) => t !== tag) });
  };

  const totalSpent = orders?.reduce((sum, o) => sum + Number(o.total_price), 0) ?? 0;
  const cancelledCount = orders?.filter((o) => o.status === "cancelled").length ?? 0;
  const returnedCount = orders?.filter((o) => o.status === "returned").length ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-sm border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Customer 360</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>

        {!customer || !editing ? (
          <LoadingTiles />
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-sm border border-border p-3">
                <div className="text-lg font-semibold">{orders?.length ?? 0}</div>
                <div className="text-xs text-muted-foreground">Orders</div>
              </div>
              <div className="rounded-sm border border-border p-3">
                <div className="text-lg font-semibold">{totalSpent} EGP</div>
                <div className="text-xs text-muted-foreground">Total spent</div>
              </div>
              <div className="rounded-sm border border-border p-3">
                <div className="text-lg font-semibold">
                  {cancelledCount} / {returnedCount}
                </div>
                <div className="text-xs text-muted-foreground">Cancelled / Returned</div>
              </div>
              <div className="rounded-sm border border-border p-3">
                <div className="text-lg font-semibold">{favoriteCategory ?? "—"}</div>
                <div className="text-xs text-muted-foreground">Favorite category</div>
              </div>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Name"
                dir="ltr"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Email (optional)"
                dir="ltr"
                value={editing.email ?? ""}
                onChange={(e) => setEditing({ ...editing, email: e.target.value || null })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Phone"
                dir="ltr"
                value={editing.phone}
                disabled
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm opacity-60"
              />
              <input
                placeholder="Governorate"
                value={editing.governorate ?? ""}
                onChange={(e) => setEditing({ ...editing, governorate: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Address"
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                value={editing.address ?? ""}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Tags</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {editing.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-sm bg-accent px-2 py-0.5 text-xs"
                  >
                    {t}
                    <button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="+ Add tag"
                  dir="ltr"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTag();
                  }}
                  className="w-48 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
                />
                <button onClick={addTag} className="rounded-sm border border-border px-3 py-1.5 text-xs">
                  Add
                </button>
              </div>
            </div>

            <textarea
              placeholder="Internal notes (not visible to the customer)"
              dir="ltr"
              value={editing.notes ?? ""}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              rows={2}
              className="mb-4 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />

            <button
              onClick={save}
              disabled={saving}
              className="mb-6 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Order history
            </h4>
            {orders === null ? (
              <LoadingRows count={3} />
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-sm border border-border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      {o.poster_image && (
                        <img src={o.poster_image} alt="" className="h-10 w-8 rounded-sm object-cover" />
                      )}
                      <div>
                        <div className="text-xs font-medium">{o.poster_title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {o.order_number} · {new Date(o.created_at).toLocaleDateString()}
                          {o.utm_source ? ` · via ${o.utm_source}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium">{o.total_price} EGP</div>
                      <div className="text-[11px] text-muted-foreground">{o.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
