import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listReviewsAdmin, upsertReview, deleteReview } from "@/lib/db-admin.functions";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";

type AdminReview = {
  id: string;
  customer_name: string;
  governorate: string | null;
  rating: number;
  review_text: string | null;
  photo_url: string | null;
  poster_id: string | null;
  approved: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
};

export function ReviewsTab() {
  const confirm = useConfirm();
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminReview> | null>(null);

  const load = async () => setReviews((await listReviewsAdmin()) as AdminReview[]);
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing?.customer_name) return toast.error("Customer name is required");
    try {
      await upsertReview({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this review?"))) return;
    await deleteReview({ data: id });
    load();
  };

  const toggleApproved = async (r: AdminReview) => {
    await upsertReview({ data: { ...r, approved: !r.approved } });
    load();
  };

  if (reviews === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">Reviews</h2>
        <button
          onClick={() => setEditing({ rating: 5, approved: true })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New review
        </button>
      </div>

      {editing && (
        <div className="mb-6 space-y-3 rounded-sm border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Customer name"
              value={editing.customer_name ?? ""}
              onChange={(e) => setEditing({ ...editing, customer_name: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Governorate (optional)"
              value={editing.governorate ?? ""}
              onChange={(e) => setEditing({ ...editing, governorate: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Review text"
            value={editing.review_text ?? ""}
            onChange={(e) => setEditing({ ...editing, review_text: e.target.value })}
            rows={3}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Photo URL (optional)"
            value={editing.photo_url ?? ""}
            onChange={(e) => setEditing({ ...editing, photo_url: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Rating
              <select
                value={editing.rating ?? 5}
                onChange={(e) => setEditing({ ...editing, rating: Number(e.target.value) })}
                className="rounded-sm border border-border bg-background px-2 py-1 text-sm"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.approved !== false}
                onChange={(e) => setEditing({ ...editing, approved: e.target.checked })}
              />
              Approved (visible on site)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(editing.featured)}
                onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
              />
              Featured
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {reviews.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 rounded-sm border border-border p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {r.customer_name}
                <span className="text-xs text-muted-foreground">{"★".repeat(r.rating)}</span>
                {!r.approved && (
                  <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-500">
                    Pending
                  </span>
                )}
                {r.featured && (
                  <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                    Featured
                  </span>
                )}
              </div>
              {r.review_text && <p className="mt-1 truncate text-xs text-muted-foreground">{r.review_text}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => toggleApproved(r)} className="text-xs text-cyan-500 hover:underline">
                {r.approved ? "Unapprove" : "Approve"}
              </button>
              <button onClick={() => setEditing(r)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(r.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
      </div>
    </div>
  );
}
