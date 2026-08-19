import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FramePreview } from "@/components/FramePreview";
import { uploadAndSign } from "@/lib/storage-url";
import { ChevronLeft, ChevronRight, Trash2, Eye, Upload, Loader2, Flame } from "lucide-react";

type TrendingPoster = {
  id: string;
  title: string | null;
  image_url: string;
  price: number | null;
  hidden: boolean;
  category_id: string | null;
  trending_order: number | null;
};

type CategoryOption = {
  id: string;
  name: string;
  parent_id: string | null;
};

export function TrendingNowManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);

  const {
    data: posters = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-trending-posters"],
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,price,hidden,category_id,trending_order")
        .eq("trending", true)
        .order("trending_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrendingPoster[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-trending-posters"] });
    qc.invalidateQueries({ queryKey: ["trending-now-home"] });
  };

  const saveOrder = async (list: TrendingPoster[]) => {
    for (let i = 0; i < list.length; i++) {
      await supabase.from("posters").update({ trending_order: i }).eq("id", list[i].id);
    }
    invalidate();
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= posters.length) return;
    const next = [...posters];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this poster from Trending Now? The poster itself will not be deleted."))
      return;
    const { error } = await supabase
      .from("posters")
      .update({ trending: false, trending_order: null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed from Trending");
    invalidate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-6xl overflow-hidden p-0 flex flex-col">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Flame className="h-5 w-5 text-primary" /> Trending Now Manager
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Manage posters shown in the Trending Now section on the homepage.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              <Upload className="h-3 w-3" /> Upload New Poster to Trending
            </button>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-accent"
            >
              Refresh
            </button>
            <span className="ml-auto self-center text-xs text-muted-foreground">
              {posters.length} posters
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : posters.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No trending posters yet. Add posters using the 🔥 button in the Sub Category manager,
              or upload a new poster above.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {posters.map((p, i) => (
                <div key={p.id} className="rounded-sm border border-border bg-card p-2">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-muted">
                    <span className="absolute left-1.5 top-1.5 z-10 rounded-sm bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground">
                      #{i + 1}
                    </span>
                    <FramePreview
                      posterUrl={p.image_url}
                      title={p.title ?? ""}
                      frameType="pvc"
                      color="black"
                      aspectClassName="aspect-[2/3]"
                      bare
                    />
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="truncate text-xs font-medium" title={p.title ?? ""}>
                      {p.title || "Untitled"}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{p.price != null ? `${p.price} EGP` : "—"}</span>
                      <span>{p.hidden ? "Hidden" : "Visible"}</span>
                    </div>
                    <div className="mt-1 flex gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        title="Move left"
                        className="rounded-sm border border-border p-1 hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === posters.length - 1}
                        title="Move right"
                        className="rounded-sm border border-border p-1 hover:bg-accent disabled:opacity-30"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <a
                        href={p.image_url}
                        target="_blank"
                        rel="noreferrer"
                        title="View poster"
                        className="rounded-sm border border-border p-1 hover:bg-accent"
                      >
                        <Eye className="h-3 w-3" />
                      </a>
                      <button
                        onClick={() => remove(p.id)}
                        title="Remove from Trending"
                        className="ml-auto rounded-sm border border-border p-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {uploadOpen ? (
          <UploadTrendingModal
            onClose={() => setUploadOpen(false)}
            onDone={() => {
              setUploadOpen(false);
              invalidate();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UploadTrendingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSeo, setAiSeo] = useState<{
    description?: string;
    seo_title?: string;
    seo_description?: string;
    tags?: string[];
  } | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["all-categories-for-trending-upload"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,parent_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CategoryOption[];
    },
  });

  const runAutoSeo = async (picked: File) => {
    setAiBusy(true);
    try {
      const guess = picked.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const { data, error } = await supabase.functions.invoke("seo-generator", {
        body: { subject: guess, include_hashtags: false, include_alt_text: true },
      });
      if (error) throw error;
      const seo = data as {
        title?: string;
        description?: string;
        seo_title?: string;
        seo_description?: string;
        tags?: string[];
      };
      if (seo?.title) setTitle(seo.title);
      setAiSeo({
        description: seo?.description,
        seo_title: seo?.seo_title,
        seo_description: seo?.seo_description,
        tags: seo?.tags,
      });
      // Try to match a category from the AI tags / title.
      const hay = `${seo?.title ?? ""} ${(seo?.tags ?? []).join(" ")}`.toLowerCase();
      const match = categories.find((c) => hay.includes((c.name ?? "").toLowerCase()));
      if (match) {
        setCategoryId(match.id);
        toast.success(`AI matched category: ${match.name}`);
      } else {
        toast.success("AI generated title & description — kept in Trending Now");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI SEO failed");
    } finally {
      setAiBusy(false);
    }
  };

  const onPickFile = (f: File | null) => {
    setFile(f);
    if (f) void runAutoSeo(f);
  };

  const submit = async () => {
    if (!file) return toast.error("Choose an image");
    if (!title.trim()) return toast.error("Enter a poster name");
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `posters/trending/${Date.now()}-${safe}`;
      const url = await uploadAndSign("posters", path, file);
      const { error } = await supabase.from("posters").insert({
        title: title.trim(),
        image_url: url,
        original_url: url,
        category_id: categoryId || null,
        price: price ? Number(price) : null,
        hidden,
        trending: true,
        trending_order: 0,
        description: aiSeo?.description ?? null,
        seo_title: aiSeo?.seo_title ?? null,
        seo_description: aiSeo?.seo_description ?? null,
        tags: aiSeo?.tags ?? null,
      } as never);
      if (error) throw error;
      toast.success(
        categoryId
          ? "Poster added to Trending & placed in its category"
          : "Poster added to Trending Now",
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload New Poster to Trending</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
            {aiBusy ? (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> AI is generating SEO…
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Poster name
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Category (optional)
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Price (EGP)
            </span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Save as hidden
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Add to Trending
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Add or remove a single poster from trending. Used by 🔥 buttons across the admin. */
export async function toggleTrending(
  posterId: string,
  currentlyTrending: boolean,
): Promise<boolean> {
  if (currentlyTrending) {
    const { error } = await supabase
      .from("posters")
      .update({ trending: false, trending_order: null })
      .eq("id", posterId);
    if (error) {
      toast.error(error.message);
      return currentlyTrending;
    }
    toast.success("Removed from Trending");
    return false;
  }
  const { error } = await supabase
    .from("posters")
    .update({ trending: true, trending_order: 9999 })
    .eq("id", posterId);
  if (error) {
    toast.error(error.message);
    return currentlyTrending;
  }
  toast.success("Added to Trending Now");
  return true;
}
