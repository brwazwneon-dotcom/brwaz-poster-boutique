import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Save, Eye, EyeOff, Upload, X } from "lucide-react";
import { SIZES } from "@/lib/poster-options";
import { cn } from "@/lib/utils";

export type CustomOffer = {
  id: string;
  title: string;
  title_ar: string | null;
  subtitle: string | null;
  subtitle_ar: string | null;
  size: string;
  count: number;
  price: number;
  image_url: string | null;
  badge: string | null;
  enabled: boolean;
  sort_order: number;
};

const empty = (): Omit<CustomOffer, "id"> => ({
  title: "",
  title_ar: "",
  subtitle: "",
  subtitle_ar: "",
  size: "20x30",
  count: 6,
  price: 790,
  image_url: null,
  badge: "",
  enabled: true,
  sort_order: 0,
});

export function OffersTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Omit<CustomOffer, "id"> | null>(null);
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["admin-custom-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_offers")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomOffer[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-custom-offers"] });
  const invalidatePublic = () => qc.invalidateQueries({ queryKey: ["custom-offers"] });

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `custom-offers/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("posters").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("posters").getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      toast.error("Image upload failed");
      return null;
    }
  };

  const createOffer = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return toast.error("Title is required");
    if (draft.count <= 0) return toast.error("Count must be > 0");
    if (draft.price < 0) return toast.error("Price must be >= 0");
    const { error } = await supabase.from("custom_offers").insert(draft);
    if (error) return toast.error(error.message);
    toast.success("Offer created");
    setDraft(null);
    refresh();
    invalidatePublic();
  };

  const updateOffer = async (id: string, patch: Partial<CustomOffer>) => {
    const { error } = await supabase.from("custom_offers").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
    invalidatePublic();
  };

  const removeOffer = async (id: string) => {
    if (!confirm("Delete this offer?")) return;
    const { error } = await supabase.from("custom_offers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Offer deleted");
    refresh();
    invalidatePublic();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Offers Manager</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create, edit, hide, or delete bundle offers shown on the /offers page. Each bundle
            adds a 20 EGP packaging fee at checkout automatically.
          </p>
        </div>
        <button
          onClick={() => setDraft(empty())}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New offer
        </button>
      </div>

      {draft && (
        <OfferForm
          value={draft}
          onChange={setDraft as any}
          onCancel={() => setDraft(null)}
          onSave={createOffer}
          uploadImage={uploadImage}
          submitLabel="Create offer"
        />
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading offers…</div>
      ) : offers.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No custom offers yet. Click <b>New offer</b> to create one.
        </div>
      ) : (
        <div className="grid gap-3">
          {offers.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              onUpdate={(patch) => updateOffer(o.id, patch)}
              onDelete={() => removeOffer(o.id)}
              uploadImage={uploadImage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  onUpdate,
  onDelete,
  uploadImage,
}: {
  offer: CustomOffer;
  onUpdate: (patch: Partial<CustomOffer>) => void;
  onDelete: () => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CustomOffer>(offer);

  if (editing) {
    return (
      <OfferForm
        value={draft}
        onChange={setDraft as any}
        onCancel={() => {
          setDraft(offer);
          setEditing(false);
        }}
        onSave={async () => {
          onUpdate({
            title: draft.title,
            title_ar: draft.title_ar,
            subtitle: draft.subtitle,
            subtitle_ar: draft.subtitle_ar,
            size: draft.size,
            count: draft.count,
            price: draft.price,
            image_url: draft.image_url,
            badge: draft.badge,
            enabled: draft.enabled,
            sort_order: draft.sort_order,
          });
          setEditing(false);
        }}
        uploadImage={uploadImage}
        submitLabel="Save changes"
      />
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-4 rounded-sm border border-border bg-card p-4",
      !offer.enabled && "opacity-60",
    )}>
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-muted">
        {offer.image_url ? (
          <img src={offer.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold truncate">{offer.title}</div>
          {offer.badge && (
            <span className="rounded-sm bg-primary px-2 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground">
              {offer.badge}
            </span>
          )}
          {!offer.enabled && (
            <span className="rounded-sm border border-border px-2 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
              Hidden
            </span>
          )}
        </div>
        {offer.title_ar && (
          <div className="text-xs text-muted-foreground truncate" dir="rtl">{offer.title_ar}</div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          {offer.count} × {offer.size} · <b className="text-foreground">{offer.price} EGP</b> · sort {offer.sort_order}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdate({ enabled: !offer.enabled })}
          className="rounded-sm border border-border px-2 py-2 text-xs hover:bg-accent"
          title={offer.enabled ? "Hide" : "Show"}
        >
          {offer.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setEditing(true)}
          className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded-sm border border-destructive/40 px-2 py-2 text-destructive hover:bg-destructive/10"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function OfferForm({
  value,
  onChange,
  onCancel,
  onSave,
  uploadImage,
  submitLabel,
}: {
  value: Omit<CustomOffer, "id"> & { id?: string };
  onChange: (v: Omit<CustomOffer, "id"> & { id?: string }) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  uploadImage: (file: File) => Promise<string | null>;
  submitLabel: string;
}) {
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    onChange({ ...value, [k]: v });

  const onFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const url = await uploadImage(file);
    setUploading(false);
    if (url) set("image_url", url);
  };

  return (
    <div className="rounded-sm border border-primary/50 bg-card p-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title (EN)">
          <input
            className="input"
            value={value.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="6 Frames Bundle"
          />
        </Field>
        <Field label="Title (AR)">
          <input
            className="input"
            dir="rtl"
            value={value.title_ar ?? ""}
            onChange={(e) => set("title_ar", e.target.value)}
            placeholder="عرض 6 براويز"
          />
        </Field>
        <Field label="Subtitle (EN)">
          <input
            className="input"
            value={value.subtitle ?? ""}
            onChange={(e) => set("subtitle", e.target.value)}
          />
        </Field>
        <Field label="Subtitle (AR)">
          <input
            className="input"
            dir="rtl"
            value={value.subtitle_ar ?? ""}
            onChange={(e) => set("subtitle_ar", e.target.value)}
          />
        </Field>
        <Field label="Size">
          <select
            className="input"
            value={value.size}
            onChange={(e) => set("size", e.target.value)}
          >
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Number of frames">
          <input
            type="number"
            min={1}
            className="input"
            value={value.count}
            onChange={(e) => set("count", Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Bundle price (EGP)">
          <input
            type="number"
            min={0}
            className="input"
            value={value.price}
            onChange={(e) => set("price", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Badge (optional)">
          <input
            className="input"
            value={value.badge ?? ""}
            onChange={(e) => set("badge", e.target.value)}
            placeholder="Best value"
          />
        </Field>
        <Field label="Sort order (lower first)">
          <input
            type="number"
            className="input"
            value={value.sort_order}
            onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Enabled">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Visible on site
          </label>
        </Field>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Cover image</div>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
            {value.image_url ? (
              <img src={value.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No image</div>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {value.image_url && (
            <button
              type="button"
              onClick={() => set("image_url", null)}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:bg-accent"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          <Save className="h-4 w-4" /> {submitLabel}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
      <style>{`.input { width: 100%; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); border-radius: 2px; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </label>
  );
}