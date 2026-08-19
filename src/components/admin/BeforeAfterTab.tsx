import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadAndSign } from "@/lib/storage-url";
import { SafeImage } from "@/components/SafeImage";
import { Slider } from "@/components/BeforeAfter";
import { Plus, Trash2, Save, X, Upload } from "lucide-react";

type Item = {
  id: string;
  title: string | null;
  description: string | null;
  before_url: string;
  after_url: string;
  location: string;
  sort_order: number;
  active: boolean;
};

const LOCATIONS = [
  { id: "homepage", label: "Homepage" },
  { id: "product", label: "Product page" },
  { id: "photo-printing", label: "Photo Printing" },
  { id: "custom-design", label: "Custom Design" },
];

export function BeforeAfterTab() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["admin_before_after"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("before_after")
        .select("*")
        .order("location", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["admin_before_after"] });
  const [editing, setEditing] = useState<Item | "new" | null>(null);

  const remove = async (id: string) => {
    if (!confirm("Delete this Before/After?")) return;
    const { error } = await supabase.from("before_after").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  };

  const toggle = async (it: Item) => {
    await supabase.from("before_after").update({ active: !it.active }).eq("id", it.id);
    reload();
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New Before / After
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No Before / After yet. Add your first comparison.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((it) => (
            <div key={it.id} className="rounded-sm border border-border bg-card p-3">
              <Slider before={it.before_url} after={it.after_url} title={it.title ?? ""} />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{it.title || "Untitled"}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {LOCATIONS.find((l) => l.id === it.location)?.label ?? it.location}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggle(it)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                  >
                    {it.active ? "Active" : "Hidden"}
                  </button>
                  <button
                    onClick={() => setEditing(it)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(it.id)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-destructive hover:bg-accent"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [location, setLocation] = useState(item?.location ?? "homepage");
  const [active, setActive] = useState(item?.active ?? true);
  const [sortOrder, setSortOrder] = useState(item?.sort_order ?? 0);
  const [beforeUrl, setBeforeUrl] = useState(item?.before_url ?? "");
  const [afterUrl, setAfterUrl] = useState(item?.after_url ?? "");
  const [saving, setSaving] = useState(false);

  const uploadOne = async (file: File, slot: "before" | "after") => {
    const path = `before-after/${slot}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const url = await uploadAndSign("posters", path, file);
    if (slot === "before") setBeforeUrl(url);
    else setAfterUrl(url);
  };

  const save = async () => {
    if (!beforeUrl || !afterUrl) return toast.error("Upload both images");
    setSaving(true);
    const payload = {
      title: title || null,
      description: description || null,
      location,
      active,
      sort_order: Number(sortOrder) || 0,
      before_url: beforeUrl,
      after_url: afterUrl,
    };
    const { error } = item
      ? await supabase.from("before_after").update(payload).eq("id", item.id)
      : await supabase.from("before_after").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-sm border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-display text-2xl">{item ? "Edit" : "New"} Before / After</h3>
          <button onClick={onClose} className="rounded-sm p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ImageSlot label="Before" url={beforeUrl} onUpload={(f) => uploadOne(f, "before")} />
          <ImageSlot label="After" url={afterUrl} onUpload={(f) => uploadOne(f, "after")} />
        </div>
        {beforeUrl && afterUrl && (
          <div className="mt-4">
            <Slider before={beforeUrl} after={afterUrl} title={title} />
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Location
            </span>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Sort order
            </span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Status
            </span>
            <div className="mt-2 inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />{" "}
              Active
            </div>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageSlot({
  label,
  url,
  onUpload,
}: {
  label: string;
  url: string;
  onUpload: (f: File) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 aspect-[4/3] overflow-hidden rounded-sm bg-card">
        {url ? (
          <SafeImage src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent">
        <Upload className="h-3 w-3" /> {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              await onUpload(file);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}
