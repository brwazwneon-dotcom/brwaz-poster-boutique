import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listCustomOffersAdmin, upsertCustomOffer, deleteCustomOffer } from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { fileToDataUrl, type AdminCustomOffer } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";

export function CustomOffersTab() {
  const confirm = useConfirm();
  const [offers, setOffers] = useState<AdminCustomOffer[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCustomOffer> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setOffers((await listCustomOffersAdmin()) as AdminCustomOffer[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({ ...(prev ?? {}), image_url: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.title) return toast.error("Title is required");
    if (!editing?.size) return toast.error("Size is required");
    if (!editing?.price) return toast.error("Price is required");
    try {
      await upsertCustomOffer({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this offer?"))) return;
    await deleteCustomOffer({ data: id });
    load();
  };

  const toggleEnabled = async (o: AdminCustomOffer) => {
    await upsertCustomOffer({ data: { ...o, enabled: !o.enabled } });
    load();
  };

  if (offers === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Offers</h2>
          <p className="text-xs text-muted-foreground">
            Bundle deals shown on /offers alongside the two default bundles.
          </p>
        </div>
        <button
          onClick={() => setEditing({ count: 1 })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New offer
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-square w-full rounded-sm object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-3">
            <input
              placeholder="Title (e.g. 6 Frames Bundle)"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (optional)"
              value={editing.subtitle ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                placeholder="Size (e.g. 20x30)"
                value={editing.size ?? ""}
                onChange={(e) => setEditing({ ...editing, size: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Count"
                value={editing.count ?? 1}
                onChange={(e) => setEditing({ ...editing, count: Number(e.target.value) })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Price (EGP)"
                value={editing.price ?? ""}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <input
              placeholder="Badge (optional, e.g. Best Value)"
              value={editing.badge ?? ""}
              onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="flex gap-2">
              <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Save
              </button>
              <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {offers.map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              {o.image_url ? (
                <img src={o.image_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-sm border border-dashed border-border" />
              )}
              <div>
                <div className="text-sm font-medium">{o.title}</div>
                <div className="text-xs text-muted-foreground">
                  {o.count}× {o.size} · {o.price} EGP{o.enabled ? "" : " · disabled"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleEnabled(o)} className="text-xs text-cyan-500 hover:underline">
                {o.enabled ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(o)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(o.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {offers.length === 0 && <p className="text-sm text-muted-foreground">No custom offers yet.</p>}
      </div>
    </div>
  );
}
