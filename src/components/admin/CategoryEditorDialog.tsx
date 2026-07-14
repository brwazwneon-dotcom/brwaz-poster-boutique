import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { uploadAndSign } from "@/lib/storage-url";
import { useQueryClient } from "@tanstack/react-query";
import type { Category } from "@/lib/use-categories";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing category — omit for create. */
  category?: Category | null;
  /** Parent id for a sub-category. Null means top-level (main). */
  parentId: string | null;
  /** Parent name for the read-only chip when creating a sub. */
  parentName?: string | null;
  /** All sibling categories (same parent) — used for slug uniqueness + default sort. */
  siblings: Category[];
  /** Called with the saved row so caller can select it. */
  onSaved: (row: Category) => void;
};

export function CategoryEditorDialog({
  open,
  onOpenChange,
  category,
  parentId,
  parentName,
  siblings,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!category;
  const isSub = !!parentId;

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [active, setActive] = useState(true);
  const [showInHeader, setShowInHeader] = useState(true);
  const [showInHomepage, setShowInHomepage] = useState(true);
  const [showInCollections, setShowInCollections] = useState(true);
  const [showInSearch, setShowInSearch] = useState(true);
  const [defaultMockupStyle, setDefaultMockupStyle] = useState<"auto" | "black" | "white" | "wood" | "none">("auto");
  const [posterDisplayMode, setPosterDisplayMode] = useState<"manual" | "random" | "newest" | "trending" | "bestsellers">("manual");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultSort = useMemo(() => {
    const max = siblings.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    return max + 1;
  }, [siblings]);

  useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setNameAr(category.name_ar ?? "");
      setSlug(category.slug);
      setSlugTouched(true);
      setImage(category.image ?? null);
      setIcon(category.icon ?? "");
      setSortOrder(category.sort_order ?? 0);
      setActive(!(category.hidden || category.status === "draft"));
      setShowInHeader(category.show_in_header ?? true);
      setShowInHomepage(category.show_in_homepage ?? true);
      setShowInCollections(category.show_in_collections ?? true);
      setShowInSearch(category.show_in_search ?? true);
      setDefaultMockupStyle((category.default_mockup_style as typeof defaultMockupStyle) ?? "auto");
      setPosterDisplayMode((category.poster_display_mode as typeof posterDisplayMode) ?? "manual");
    } else {
      setName("");
      setNameAr("");
      setSlug("");
      setSlugTouched(false);
      setImage(null);
      setIcon("");
      setSortOrder(defaultSort);
      setActive(true);
      setShowInHeader(true);
      setShowInHomepage(true);
      setShowInCollections(true);
      setShowInSearch(true);
      setDefaultMockupStyle("auto");
      setPosterDisplayMode("manual");
    }
  }, [open, category, defaultSort]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const uniqueSlug = (base: string) => {
    const taken = new Set(
      siblings.filter((s) => s.id !== category?.id).map((s) => s.slug.toLowerCase()),
    );
    if (!taken.has(base.toLowerCase())) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`.toLowerCase())) i += 1;
    return `${base}-${i}`;
  };

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${crypto.randomUUID()}.${ext}`;
      const url = await uploadAndSign("categories", path, file);
      setImage(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    const baseSlug = slugify(slug || trimmed);
    if (!baseSlug) {
      toast.error("Slug cannot be empty");
      return;
    }
    const finalSlug = uniqueSlug(baseSlug);

    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        name_ar: nameAr.trim() || null,
        slug: finalSlug,
        image: image ?? null,
        icon: icon.trim() || null,
        sort_order: Math.max(0, Math.floor(sortOrder) || 0),
        parent_id: parentId,
        hidden: !active,
        status: active ? "published" : "draft",
        show_in_header: showInHeader,
        show_in_homepage: showInHomepage,
        show_in_collections: showInCollections,
        show_in_search: showInSearch,
        default_mockup_style: defaultMockupStyle,
        poster_display_mode: posterDisplayMode,
      };

      const q = isEdit
        ? supabase.from("categories").update(payload).eq("id", category!.id).select("*").single()
        : supabase.from("categories").insert(payload).select("*").single();

      const { data, error } = await q;
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success(isEdit ? "Category updated" : "Category created");
      onSaved(data as Category);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : "New"} {isSub ? "Sub-Category" : "Main Category"}
          </DialogTitle>
          <DialogDescription>
            {isSub ? "Create a sub-category under the selected parent." : "Add a top-level category customers can browse."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isSub && parentName && (
            <div className="flex items-center gap-2 rounded-sm border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="uppercase tracking-widest text-muted-foreground">Parent</span>
              <span className="font-medium">{parentName}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name *</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Movies" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-name-ar">Name (AR)</Label>
            <Input id="cat-name-ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="أفلام" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="movies"
            />
            <p className="text-[10px] text-muted-foreground">URL-friendly; auto-generated from name.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-icon">Icon / Emoji</Label>
            <Input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🎬" maxLength={4} />
          </div>

          <div className="space-y-1.5">
            <Label>Image (optional)</Label>
            <div className="flex items-center gap-3">
              {image ? (
                <div className="relative">
                  <img src={image} alt="" className="h-16 w-16 rounded-sm border border-border object-cover" />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-sm border border-dashed border-border text-[10px] text-muted-foreground">
                  No image
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                {image ? "Replace" : "Upload"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-order">Display order</Label>
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-active">Status</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border px-3">
                <Switch id="cat-active" checked={active} onCheckedChange={setActive} />
                <span className="text-xs text-muted-foreground">{active ? "Active" : "Hidden"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-sm border border-border p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Visibility</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2"><Switch checked={showInHeader} onCheckedChange={setShowInHeader} /> Show in Header</label>
              <label className="flex items-center gap-2"><Switch checked={showInHomepage} onCheckedChange={setShowInHomepage} /> Show in Homepage</label>
              <label className="flex items-center gap-2"><Switch checked={showInCollections} onCheckedChange={setShowInCollections} /> Show in Collections</label>
              <label className="flex items-center gap-2"><Switch checked={showInSearch} onCheckedChange={setShowInSearch} /> Show in Search</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-mockup">Default Mockup</Label>
              <select
                id="cat-mockup"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={defaultMockupStyle}
                onChange={(e) => setDefaultMockupStyle(e.target.value as typeof defaultMockupStyle)}
              >
                <option value="auto">Auto</option>
                <option value="black">Black Frame</option>
                <option value="white">White Frame</option>
                <option value="wood">Wood Frame</option>
                <option value="none">No Frame</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-display">Poster Display Mode</Label>
              <select
                id="cat-display"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={posterDisplayMode}
                onChange={(e) => setPosterDisplayMode(e.target.value as typeof posterDisplayMode)}
              >
                <option value="manual">Manual Order</option>
                <option value="random">Random</option>
                <option value="newest">Newest First</option>
                <option value="trending">Trending First</option>
                <option value="bestsellers">Best Sellers First</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}