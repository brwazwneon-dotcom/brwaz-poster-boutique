import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listBeforeAfterAdmin, upsertBeforeAfter, deleteBeforeAfter } from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { fileToDataUrl, type AdminBeforeAfter } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";

const BEFORE_AFTER_LOCATIONS = ["homepage", "product", "photo-printing", "custom-design"] as const;

export function BeforeAfterTab() {
  const confirm = useConfirm();
  const [items, setItems] = useState<AdminBeforeAfter[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminBeforeAfter> | null>(null);
  const [uploadingSide, setUploadingSide] = useState<"before" | "after" | null>(null);
  const beforeFileRef = useRef<HTMLInputElement | null>(null);
  const afterFileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setItems((await listBeforeAfterAdmin()) as AdminBeforeAfter[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File, side: "before" | "after") => {
    setUploadingSide(side);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({
        ...(prev ?? {}),
        [side === "before" ? "before_url" : "after_url"]: url,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSide(null);
    }
  };

  const save = async () => {
    if (!editing?.before_url || !editing?.after_url) return toast.error("Both images are required");
    try {
      await upsertBeforeAfter({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this pair?"))) return;
    await deleteBeforeAfter({ data: id });
    load();
  };

  const toggleActive = async (item: AdminBeforeAfter) => {
    await upsertBeforeAfter({ data: { ...item, active: !item.active } });
    load();
  };

  if (items === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Before / After</h2>
          <p className="text-xs text-muted-foreground">
            Shown on the homepage, product pages, photo printing, and custom design — filtered by
            location.
          </p>
        </div>
        <button
          onClick={() => setEditing({ location: "homepage" })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New pair
        </button>
      </div>

      {editing && (
        <div className="mb-6 space-y-4 rounded-sm border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["before", "after"] as const).map((side) => (
              <div key={side}>
                <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                  {side === "before" ? "Before image" : "After image"}
                </p>
                {editing[side === "before" ? "before_url" : "after_url"] ? (
                  <img
                    src={editing[side === "before" ? "before_url" : "after_url"] as string}
                    alt=""
                    className="aspect-[4/3] w-full rounded-sm object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <button
                  onClick={() => (side === "before" ? beforeFileRef : afterFileRef).current?.click()}
                  disabled={uploadingSide !== null}
                  className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  {uploadingSide === side ? "Uploading…" : "Upload"}
                </button>
                <input
                  ref={side === "before" ? beforeFileRef : afterFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFile(e.target.files[0], side);
                    e.target.value = "";
                  }}
                />
              </div>
            ))}
          </div>
          <input
            placeholder="Title (optional)"
            value={editing.title ?? ""}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Description (optional)"
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            rows={2}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={editing.location ?? "homepage"}
              onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              {BEFORE_AFTER_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active !== false}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Active
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
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <img src={it.before_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
                <img src={it.after_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
              </div>
              <div>
                <div className="text-sm font-medium">{it.title || "Untitled pair"}</div>
                <div className="text-xs text-muted-foreground">
                  {it.location}
                  {it.active ? "" : " · inactive"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleActive(it)} className="text-xs text-cyan-500 hover:underline">
                {it.active ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(it)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(it.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No before/after pairs yet.</p>}
      </div>
    </div>
  );
}
