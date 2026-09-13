import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listSetsAdmin, upsertSet, deleteSet } from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { fileToDataUrl, type AdminSet } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";

export function SetsTab() {
  const confirm = useConfirm();
  const [sets, setSets] = useState<AdminSet[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminSet> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setSets((await listSetsAdmin()) as AdminSet[]);
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
    if (!editing?.name) return toast.error("Name is required");
    if (!editing?.price) return toast.error("Price is required");
    try {
      await upsertSet({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this set?"))) return;
    await deleteSet({ data: id });
    load();
  };

  const toggleEnabled = async (s: AdminSet) => {
    await upsertSet({ data: { ...s, enabled: !s.enabled } });
    load();
  };

  if (sets === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sets</h2>
          <p className="text-xs text-muted-foreground">
            Curated frame-set bundles shown on /sets and the homepage teaser.
          </p>
        </div>
        <button
          onClick={() => setEditing({ frames_count: 1 })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New set
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
              placeholder="Name (e.g. Gallery Wall Set)"
              value={editing.name ?? ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Description (optional)"
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                min={1}
                placeholder="Frames count"
                value={editing.frames_count ?? 1}
                onChange={(e) => setEditing({ ...editing, frames_count: Number(e.target.value) })}
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
              <input
                type="number"
                min={0}
                placeholder="Old price (optional)"
                value={editing.old_price ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, old_price: e.target.value ? Number(e.target.value) : null })
                }
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.enabled !== false}
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                />
                Enabled
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
        </div>
      )}

      <div className="space-y-2">
        {sets.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              {s.image_url ? (
                <img src={s.image_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-sm border border-dashed border-border" />
              )}
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.frames_count} frames · {s.price} EGP{s.enabled ? "" : " · disabled"}
                  {s.featured ? " · featured" : ""}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleEnabled(s)} className="text-xs text-cyan-500 hover:underline">
                {s.enabled ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(s)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {sets.length === 0 && <p className="text-sm text-muted-foreground">No sets yet.</p>}
      </div>
    </div>
  );
}
