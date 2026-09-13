import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listCouponsAdmin, upsertCouponAdmin, deleteCouponAdmin } from "@/lib/db-admin.functions";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { LoadingRows } from "@/components/admin/layout/LoadingState";

type Coupon = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  usage_limit: number | null;
  used_count: number;
  per_customer_limit: number | null;
  min_order_amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  enabled: boolean;
};

export function PromotionsTab() {
  const confirm = useConfirm();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);

  const load = async () => setCoupons((await listCouponsAdmin()) as Coupon[]);
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing?.code?.trim()) return toast.error("Code is required");
    if (!editing?.discount_value || editing.discount_value <= 0) return toast.error("Discount value is required");
    try {
      await upsertCouponAdmin({
        data: {
          id: editing.id,
          code: editing.code,
          discount_type: editing.discount_type ?? "percent",
          discount_value: editing.discount_value,
          usage_limit: editing.usage_limit ?? null,
          per_customer_limit: editing.per_customer_limit ?? null,
          min_order_amount: editing.min_order_amount ?? null,
          starts_at: editing.starts_at ?? null,
          ends_at: editing.ends_at ?? null,
          enabled: editing.enabled ?? true,
        },
      });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this coupon?"))) return;
    await deleteCouponAdmin({ data: id });
    load();
  };

  const toggleEnabled = async (c: Coupon) => {
    await upsertCouponAdmin({
      data: {
        id: c.id,
        code: c.code,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
        usage_limit: c.usage_limit,
        per_customer_limit: c.per_customer_limit,
        min_order_amount: c.min_order_amount,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        enabled: !c.enabled,
      },
    });
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Promotions</h2>
          <p className="text-xs text-muted-foreground">
            Coupon codes are managed here. Checkout redemption isn't wired up yet — this is admin
            setup only for now.
          </p>
        </div>
        <button
          onClick={() => setEditing({ discount_type: "percent", enabled: true })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New coupon
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-3 rounded-sm border border-border bg-card p-4 sm:grid-cols-2">
          <input
            placeholder="Code (e.g. WELCOME10)"
            dir="ltr"
            value={editing.code ?? ""}
            onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={editing.discount_type ?? "percent"}
              onChange={(e) => setEditing({ ...editing, discount_type: e.target.value as "percent" | "fixed" })}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed EGP off</option>
            </select>
            <input
              type="number"
              min={0}
              placeholder={editing.discount_type === "fixed" ? "EGP" : "%"}
              value={editing.discount_value ?? ""}
              onChange={(e) => setEditing({ ...editing, discount_value: Number(e.target.value) })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <input
            type="number"
            min={0}
            placeholder="Usage limit (blank = unlimited)"
            value={editing.usage_limit ?? ""}
            onChange={(e) => setEditing({ ...editing, usage_limit: e.target.value ? Number(e.target.value) : null })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="Per-customer limit (blank = unlimited)"
            value={editing.per_customer_limit ?? ""}
            onChange={(e) =>
              setEditing({ ...editing, per_customer_limit: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="Minimum order amount (optional)"
            value={editing.min_order_amount ?? ""}
            onChange={(e) =>
              setEditing({ ...editing, min_order_amount: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.enabled ?? true}
              onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <input
            type="date"
            value={editing.starts_at?.slice(0, 10) ?? ""}
            onChange={(e) => setEditing({ ...editing, starts_at: e.target.value || null })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={editing.ends_at?.slice(0, 10) ?? ""}
            onChange={(e) => setEditing({ ...editing, ends_at: e.target.value || null })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {coupons === null ? (
        <LoadingRows />
      ) : coupons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coupons yet.</p>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-sm border border-border p-3">
              <div>
                <div className="font-mono text-sm font-medium">{c.code}</div>
                <div className="text-xs text-muted-foreground">
                  {c.discount_type === "percent" ? `${c.discount_value}% off` : `${c.discount_value} EGP off`}
                  {" · used "}
                  {c.used_count}
                  {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                  {c.min_order_amount ? ` · min ${c.min_order_amount} EGP` : ""}
                  {c.enabled ? "" : " · disabled"}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleEnabled(c)} className="text-xs text-cyan-500 hover:underline">
                  {c.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => setEditing(c)} className="text-xs text-cyan-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
