import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listCategoriesAdmin, upsertCategory, deleteCategory } from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { fileToDataUrl, type AdminCategory } from "./shared";

export function CategoriesTab() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCategory> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setCategories((await listCategoriesAdmin()) as AdminCategory[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({ ...(prev ?? {}), image: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.name) return toast.error("Name is required");
    try {
      await upsertCategory({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  // Quick-add: type a name under a main category and press Enter — for
  // fast one-at-a-time entry (e.g. "Messi", "Ronaldo" under Football)
  // without opening the full edit form each time.
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const addSubcategory = async (parentId: string) => {
    const name = (newSubName[parentId] ?? "").trim();
    if (!name) return;
    try {
      await upsertCategory({ data: { name, parent_id: parentId } });
      setNewSubName((prev) => ({ ...prev, [parentId]: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    await deleteCategory({ data: id });
    load();
  };

  if (categories === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">Categories</h2>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New category
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[140px_1fr]">
          <div>
            {editing.image ? (
              <img src={editing.image} alt="" className="aspect-square w-full rounded-sm object-cover" />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Name (English)"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="الاسم بالعربي"
                dir="rtl"
                value={editing.name_ar ?? ""}
                onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <textarea
              placeholder="Description (optional)"
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Parent category (leave empty for a main category)
              </label>
              <select
                value={editing.parent_id ?? ""}
                onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">— None (main category) —</option>
                {categories
                  .filter((c) => !c.parent_id && c.id !== editing.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Subcategories show as filter chips on their parent's category page (e.g. "Messi"
                under "Football") — they don't appear in the header nav or homepage grid.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.hidden)}
                  onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
                />
                Hidden
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.featured)}
                  onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.show_in_header !== false}
                  onChange={(e) => setEditing({ ...editing, show_in_header: e.target.checked })}
                />
                Show in header nav
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.show_in_collections !== false}
                  onChange={(e) => setEditing({ ...editing, show_in_collections: e.target.checked })}
                />
                Show in collections grid
              </label>
              <label className="flex items-center gap-2 text-sm">
                Sort order
                <input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  className="w-20 rounded-sm border border-border bg-background px-2 py-1 text-sm"
                />
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
        {categories
          .filter((c) => !c.parent_id)
          .map((main) => {
            const subs = categories.filter((c) => c.parent_id === main.id);
            return (
              <div key={main.id}>
                <div className="flex items-center justify-between rounded-sm border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">{main.name}</div>
                    <div className="text-xs text-muted-foreground">
                      /{main.slug}
                      {main.hidden ? " · hidden" : ""}
                      {subs.length > 0 ? ` · ${subs.length} subcategories` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(main)} className="text-xs text-cyan-500 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(main.id)} className="text-xs text-red-500 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                <div className="ml-6 mt-1 space-y-1 border-l border-border pl-4">
                  {subs.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-sm border border-border p-2">
                      <div className="text-xs">
                        {s.name}
                        {s.hidden ? " · hidden" : ""}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(s)} className="text-xs text-cyan-500 hover:underline">
                          Edit
                        </button>
                        <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input
                      value={newSubName[main.id] ?? ""}
                      onChange={(e) => setNewSubName((prev) => ({ ...prev, [main.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addSubcategory(main.id);
                      }}
                      placeholder={`+ Add subcategory under ${main.name} (e.g. Messi)`}
                      className="w-full rounded-sm border border-dashed border-border bg-background px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => addSubcategory(main.id)}
                      disabled={!newSubName[main.id]?.trim()}
                      className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      </div>
    </div>
  );
}
