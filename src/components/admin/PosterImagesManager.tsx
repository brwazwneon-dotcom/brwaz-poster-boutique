import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadAndSign } from "@/lib/storage-url";
import { SafeImage } from "@/components/SafeImage";
import { Trash2, Upload, ArrowUp, ArrowDown, Star, Pencil } from "lucide-react";

type PosterImage = {
  id: string;
  poster_id: string;
  image_url: string;
  label: string | null;
  kind: string | null;
  sort_order: number;
  is_default: boolean;
};

const KINDS = [
  "Original Artwork",
  "Black Frame Preview",
  "White Frame Preview",
  "Wooden Portrait Preview",
  "Room Mockup",
  "Customer Photos",
  "Close-up Detail",
];

export function PosterImagesManager({ posterId }: { posterId: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: images = [] } = useQuery({
    queryKey: ["poster_images", posterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poster_images")
        .select("id,poster_id,image_url,label,kind,sort_order,is_default")
        .eq("poster_id", posterId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PosterImage[];
    },
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["poster_images", posterId] });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const base = images.length;
      await Promise.all(
        Array.from(files).map(async (file, i) => {
          const path = `gallery/${posterId}/${Date.now()}-${i}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
          const url = await uploadAndSign("posters", path, file);
          await supabase.from("poster_images").insert({
            poster_id: posterId,
            image_url: url,
            kind: "Image",
            label: file.name,
            sort_order: base + i,
          });
        }),
      );
      toast.success(`Uploaded ${files.length} image${files.length > 1 ? "s" : ""}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const updateImage = async (id: string, patch: Partial<PosterImage>) => {
    const { error } = await supabase.from("poster_images").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  };

  const setDefault = async (id: string) => {
    await supabase.from("poster_images").update({ is_default: false }).eq("poster_id", posterId);
    await supabase.from("poster_images").update({ is_default: true }).eq("id", id);
    toast.success("Default image set");
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this image?")) return;
    const { error } = await supabase.from("poster_images").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= images.length) return;
    const a = images[idx];
    const b = images[next];
    await supabase.from("poster_images").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("poster_images").update({ sort_order: a.sort_order }).eq("id", b.id);
    reload();
  };

  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Gallery images ({images.length})
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent">
          <Upload className="h-3 w-3" />
          {uploading ? "Uploading…" : "Add images"}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files)}
          />
        </label>
      </div>

      {images.length === 0 ? (
        <div className="mt-3 rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No extra images yet. Upload room mockups, customer photos, etc.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.id} className="rounded-sm border border-border bg-card p-2">
              <div className="relative aspect-square overflow-hidden rounded-sm">
                <SafeImage
                  src={img.image_url}
                  alt={img.label ?? ""}
                  className="h-full w-full object-cover"
                />
                {img.is_default && (
                  <span className="absolute left-1 top-1 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground">
                    Default
                  </span>
                )}
              </div>
              <select
                value={KINDS.includes(img.kind ?? "") ? (img.kind as string) : ""}
                onChange={(e) => updateImage(img.id, { kind: e.target.value || null })}
                className="mt-2 w-full rounded-sm border border-border bg-background px-1 py-1 text-[10px]"
              >
                <option value="">— Type —</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                value={img.label ?? ""}
                onChange={(e) => updateImage(img.id, { label: e.target.value })}
                placeholder="Label"
                className="mt-1 w-full rounded-sm border border-border bg-background px-1 py-1 text-[10px]"
              />
              <div className="mt-2 flex items-center justify-between gap-1">
                <button
                  onClick={() => move(i, -1)}
                  title="Move up"
                  className="rounded-sm p-1 hover:bg-accent"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  title="Move down"
                  className="rounded-sm p-1 hover:bg-accent"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setDefault(img.id)}
                  title="Set as default"
                  className="rounded-sm p-1 hover:bg-accent"
                >
                  <Star className={"h-3 w-3 " + (img.is_default ? "fill-current" : "")} />
                </button>
                <button
                  onClick={() => remove(img.id)}
                  title="Delete"
                  className="rounded-sm p-1 text-destructive hover:bg-accent"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        Tip: default image shows first in product gallery. Black Frame preview is shown
        automatically from the framed mockup.
      </p>
    </div>
  );
}
