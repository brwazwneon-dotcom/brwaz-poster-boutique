import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ImagePlus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  descendantIds,
  useCategories,
  isCategoryVisible,
  type Category,
} from "@/lib/use-categories";
import { SafeImage } from "@/components/SafeImage";

type DisplayMode = "sequential" | "random" | "shuffle_refresh";
type TransitionType = "fade" | "cross_fade" | "zoom" | "slide_left" | "slide_right" | "scale_fade";

type ShowcaseSettings = {
  id?: string;
  category_id: string;
  selection_mode: "auto" | "manual";
  rotation_enabled: boolean;
  display_mode: DisplayMode;
  rotation_speed_ms: number;
  transition_type: TransitionType;
  pause_on_hover: boolean;
  loop_enabled: boolean;
  mockup_style: "black" | "white" | "random" | "global";
  section_enabled?: boolean;
  view_all_enabled?: boolean;
};

type ShowcaseImage = {
  id: string;
  category_id: string;
  source_type: "upload" | "product";
  poster_id: string | null;
  image_url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  enabled: boolean;
};

type ProductImage = {
  id: string;
  title: string;
  category_id: string | null;
  image_url: string;
  width: number | null;
  height: number | null;
  featured: boolean;
  views_count: number;
  sales_count: number;
  cart_adds_count: number;
  is_best_seller: boolean;
  wishlist_count: number;
};

type DbError = { message: string };
type DbResult<T> = { data: T | null; error: DbError | null };
type DbQuery<T> = PromiseLike<DbResult<T>> & {
  select(columns?: string): DbQuery<T>;
  in(column: string, values: readonly string[]): DbQuery<T>;
  order(column: string, options?: { ascending?: boolean }): DbQuery<T>;
  eq(column: string, value: string | number | boolean | null): DbQuery<T>;
  upsert(value: unknown, options?: { onConflict?: string }): DbQuery<T>;
  insert(value: unknown): DbQuery<T>;
  delete(): DbQuery<T>;
  update(value: unknown): DbQuery<T>;
};
type ShowcaseDb = { from<T>(table: string): DbQuery<T> };

const defaultSettings = (categoryId: string): ShowcaseSettings => ({
  category_id: categoryId,
  selection_mode: "auto",
  rotation_enabled: true,
  display_mode: "sequential",
  rotation_speed_ms: 6000,
  transition_type: "fade",
  pause_on_hover: true,
  loop_enabled: true,
  mockup_style: "black",
  section_enabled: true,
  view_all_enabled: true,
});

const MAX_SHOWCASE_IMAGES = 10;
const speedOptions = [3000, 5000, 8000, 10000, 15000];

function db() {
  return supabase as unknown as ShowcaseDb;
}

function validImageUrl(url: string | null | undefined) {
  const value = String(url ?? "");
  if (!value || value.startsWith("data:")) return false;
  const lower = value.toLowerCase();
  return (
    !lower.includes("placeholder") &&
    !lower.includes("deleted") &&
    !lower.includes("null") &&
    !lower.includes("undefined")
  );
}

async function loadShowcaseData(
  categoryIds: string[],
): Promise<{ settings: ShowcaseSettings[]; images: ShowcaseImage[] }> {
  if (categoryIds.length === 0)
    return { settings: [] as ShowcaseSettings[], images: [] as ShowcaseImage[] };
  const [settingsRes, imagesRes] = await Promise.all([
    db()
      .from<ShowcaseSettings[]>("collection_showcase_settings")
      .select("*")
      .in("category_id", categoryIds),
    db()
      .from<ShowcaseImage[]>("collection_showcase_images")
      .select("*")
      .in("category_id", categoryIds)
      .order("sort_order", { ascending: true }),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (imagesRes.error) throw imagesRes.error;
  return { settings: settingsRes.data ?? [], images: imagesRes.data ?? [] };
}

async function loadProductsForCategory(
  categoryId: string,
  categories: Category[],
): Promise<ProductImage[]> {
  const categoryIds = descendantIds(categories, categoryId);
  const { data: posters, error } = await supabase
    .from("posters")
    .select(
      "id,title,category_id,image_url,featured,is_best_seller,views_count,sales_count,cart_adds_count",
    )
    .in("category_id", categoryIds)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  const posterIds = (posters ?? []).map((p) => p.id);
  if (posterIds.length === 0) return [];
  const [{ data: variants }, { data: wishlistRows }] = await Promise.all([
    supabase
      .from("image_variants")
      .select("source_id,url,width,height,variant")
      .eq("source_table", "posters")
      .eq("status", "done")
      .in("source_id", posterIds)
      .in("variant", ["thumb_avif", "thumb_webp", "thumb", "small_avif", "small_webp", "small"]),
    supabase.from("wishlists").select("poster_id").in("poster_id", posterIds),
  ]);
  const wishlists = new Map<string, number>();
  for (const row of wishlistRows ?? []) {
    wishlists.set(row.poster_id, (wishlists.get(row.poster_id) ?? 0) + 1);
  }
  const priority: Record<string, number> = {
    thumb_avif: 0,
    thumb_webp: 1,
    thumb: 2,
    small_avif: 3,
    small_webp: 4,
    small: 5,
  };
  const best = new Map<
    string,
    { url: string; width: number | null; height: number | null; rank: number }
  >();
  for (const row of variants ?? []) {
    const posterId = String(row.source_id ?? "");
    const url = String(row.url ?? "");
    if (!posterId || !validImageUrl(url)) continue;
    const rank = priority[String(row.variant)] ?? 99;
    const current = best.get(posterId);
    if (!current || rank < current.rank)
      best.set(posterId, { url, width: row.width ?? null, height: row.height ?? null, rank });
  }
  return (posters ?? [])
    .map((poster) => {
      const picked = best.get(poster.id);
      return {
        id: poster.id,
        title: poster.title,
        category_id: poster.category_id,
        image_url: picked?.url && validImageUrl(picked.url) ? picked.url : poster.image_url,
        width: picked?.width ?? null,
        height: picked?.height ?? null,
        featured: poster.featured,
        is_best_seller: poster.is_best_seller,
        views_count: poster.views_count,
        sales_count: poster.sales_count,
        cart_adds_count: poster.cart_adds_count,
        wishlist_count: wishlists.get(poster.id) ?? 0,
      };
    })
    .filter((p) => validImageUrl(p.image_url));
}

function PreviewFrame({
  images,
  size,
}: {
  images: ShowcaseImage[];
  size: "desktop" | "tablet" | "mobile";
}) {
  const cardWidth = size === "desktop" ? "w-32" : size === "tablet" ? "w-28" : "w-24";
  return (
    <div className="w-full overflow-hidden">
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.slice(0, MAX_SHOWCASE_IMAGES).map((image, index) => (
          <div key={image.id} className={`${cardWidth} shrink-0`}>
            <div className="aspect-[3/4] overflow-hidden rounded-sm border border-border bg-muted">
              <SafeImage
                src={image.image_url}
                alt={image.alt_text ?? `Preview image ${index + 1}`}
                className="h-full w-full object-cover object-center"
              />
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <div className="flex min-h-32 w-full items-center justify-center rounded-sm border border-dashed border-border bg-background text-center text-xs uppercase tracking-widest text-muted-foreground">
            Homepage row will auto-fill from valid products in this collection.
          </div>
        )}
      </div>
    </div>
  );
}

export function CollectionShowcaseTab() {
  const qc = useQueryClient();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "configured" | "empty" | "rotation-on" | "rotation-off"
  >("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pickedProducts, setPickedProducts] = useState<Set<string>>(new Set());
  const [previewSize, setPreviewSize] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [dragId, setDragId] = useState<string | null>(null);

  const visibleCategories = useMemo(() => categories.filter(isCategoryVisible), [categories]);
  const categoryIds = useMemo(() => visibleCategories.map((c) => c.id), [visibleCategories]);
  const selected =
    visibleCategories.find((c) => c.id === selectedId) ?? visibleCategories[0] ?? null;

  const showcase = useQuery({
    queryKey: ["admin-collection-showcase", categoryIds.join("|")],
    enabled: categoryIds.length > 0,
    queryFn: () => loadShowcaseData(categoryIds),
  });

  const productQuery = useQuery({
    queryKey: ["admin-collection-showcase-products", selected?.id, categories.length],
    enabled: !!selected && productPickerOpen,
    queryFn: () => loadProductsForCategory(selected!.id, categories),
  });

  const settingsByCategory = useMemo(() => {
    const map = new Map<string, ShowcaseSettings>();
    for (const settings of showcase.data?.settings ?? []) {
      map.set(settings.category_id, settings);
    }
    return map;
  }, [showcase.data]);
  const imagesByCategory = useMemo(() => {
    const map = new Map<string, ShowcaseImage[]>();
    for (const image of showcase.data?.images ?? []) {
      if (!map.has(image.category_id)) map.set(image.category_id, []);
      map.get(image.category_id)!.push(image);
    }
    return map;
  }, [showcase.data]);

  const selectedSettings = selected
    ? (settingsByCategory.get(selected.id) ?? defaultSettings(selected.id))
    : null;
  const selectedImages = selected
    ? (imagesByCategory.get(selected.id) ?? []).filter((image) => image.source_type === "product")
    : [];

  const filteredCategories = visibleCategories.filter((category) => {
    const q = query.trim().toLowerCase();
    const images = imagesByCategory.get(category.id) ?? [];
    const settings = settingsByCategory.get(category.id) ?? defaultSettings(category.id);
    if (
      q &&
      !`${category.name} ${category.slug} ${category.name_ar ?? ""}`.toLowerCase().includes(q)
    )
      return false;
    if (filter === "configured" && images.length === 0) return false;
    if (filter === "empty" && images.length > 0) return false;
    if (filter === "rotation-on" && !settings.rotation_enabled) return false;
    if (filter === "rotation-off" && settings.rotation_enabled) return false;
    return true;
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-collection-showcase"] });
    qc.invalidateQueries({ queryKey: ["home-collection-showcase"] });
  };

  const saveSettings = async (patch: Partial<ShowcaseSettings>) => {
    if (!selected || !selectedSettings) return;
    const payload = { ...selectedSettings, ...patch, category_id: selected.id };
    const { error } = await db()
      .from("collection_showcase_settings")
      .upsert(payload, { onConflict: "category_id" });
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    invalidate();
  };

  const addPickedProducts = async () => {
    if (!selected) return;
    const remaining = MAX_SHOWCASE_IMAGES - selectedImages.length;
    if (remaining <= 0) return toast.error("Maximum 10 showcase images per collection");
    const products = (productQuery.data ?? [])
      .filter((p) => pickedProducts.has(p.id))
      .slice(0, remaining);
    if (products.length === 0) return;
    const rows = products.map((product, index) => ({
      category_id: selected.id,
      source_type: "product",
      poster_id: product.id,
      image_url: product.image_url,
      alt_text: product.title,
      width: product.width,
      height: product.height,
      sort_order: selectedImages.length + index,
      enabled: true,
    }));
    const { error } = await db().from("collection_showcase_images").insert(rows);
    if (error) return toast.error(error.message);
    await saveSettings({ selection_mode: "manual" });
    setPickedProducts(new Set());
    setProductPickerOpen(false);
    toast.success("Product images added");
    invalidate();
  };

  const deleteImages = async (ids: string[]) => {
    if (
      ids.length === 0 ||
      !confirm(`Delete ${ids.length} showcase image${ids.length === 1 ? "" : "s"}?`)
    )
      return;
    const { error } = await db().from("collection_showcase_images").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    invalidate();
  };

  const moveImage = async (image: ShowcaseImage, dir: -1 | 1) => {
    const index = selectedImages.findIndex((img) => img.id === image.id);
    const other = selectedImages[index + dir];
    if (!other) return;
    const { error } = await db()
      .from("collection_showcase_images")
      .upsert([
        { ...image, sort_order: other.sort_order },
        { ...other, sort_order: image.sort_order },
      ]);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const dropImage = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = selectedImages.findIndex((img) => img.id === dragId);
    const to = selectedImages.findIndex((img) => img.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...selectedImages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    const rows = next.map((img, index) => ({ ...img, sort_order: index }));
    const { error } = await db().from("collection_showcase_images").upsert(rows);
    setDragId(null);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const resetCollection = async () => {
    if (!selected || !confirm(`Reset ${selected.name} showcase?`)) return;
    const [del, settings] = await Promise.all([
      db().from("collection_showcase_images").delete().eq("category_id", selected.id),
      db()
        .from("collection_showcase_settings")
        .upsert(defaultSettings(selected.id), { onConflict: "category_id" }),
    ]);
    if (del.error || settings.error)
      return toast.error(del.error?.message ?? settings.error?.message ?? "Reset failed");
    toast.success("Collection reset");
    invalidate();
  };

  const copyFromSelected = async (targetId: string, copyImages: boolean) => {
    if (!selected || !selectedSettings) return;
    const settings = { ...selectedSettings, id: undefined, category_id: targetId };
    const { error: settingsError } = await db()
      .from("collection_showcase_settings")
      .upsert(settings, { onConflict: "category_id" });
    if (settingsError) return toast.error(settingsError.message);
    if (copyImages) {
      const rows = selectedImages.map((img, index) => ({
        category_id: targetId,
        source_type: img.source_type,
        poster_id: img.poster_id,
        image_url: img.image_url,
        alt_text: img.alt_text,
        width: img.width,
        height: img.height,
        sort_order: index,
        enabled: img.enabled,
      }));
      if (rows.length > 0) {
        const { error } = await db().from("collection_showcase_images").insert(rows);
        if (error) return toast.error(error.message);
      }
    }
    toast.success(copyImages ? "Settings and images copied" : "Settings duplicated");
    invalidate();
  };

  if (categoriesLoading || showcase.isLoading)
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading collection showcase…
      </div>
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="rounded-sm border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-display text-3xl">Collection Showcase</h2>
            <p className="text-xs text-muted-foreground">
              All current and future collections are loaded from database categories.
            </p>
          </div>
          <button
            onClick={() => invalidate()}
            className="rounded-sm border border-border p-2 hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search collections"
              className="w-full rounded-sm border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="configured">Configured</option>
            <option value="empty">No images</option>
            <option value="rotation-on">Rotation on</option>
            <option value="rotation-off">Rotation off</option>
          </select>
        </div>
        <div className="mt-4 max-h-[70vh] space-y-2 overflow-auto pr-1">
          {filteredCategories.map((category) => {
            const settings = settingsByCategory.get(category.id) ?? defaultSettings(category.id);
            const images = imagesByCategory.get(category.id) ?? [];
            const first = images[0];
            return (
              <button
                key={category.id}
                onClick={() => setSelectedId(category.id)}
                className={`grid w-full grid-cols-[64px_1fr] gap-3 rounded-sm border p-2 text-left transition hover:bg-accent ${selected?.id === category.id ? "border-primary bg-accent" : "border-border bg-background"}`}
              >
                <div className="h-16 w-16 overflow-hidden rounded-sm border border-border bg-muted">
                  {first ? (
                    <SafeImage
                      src={first.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-muted-foreground">
                      Default
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{category.name}</div>
                  <div className="truncate text-xs text-muted-foreground">/{category.slug}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{images.length} images</span>
                    <span>{settings.section_enabled === false ? "Hidden" : "Visible"}</span>
                    <span>{settings.rotation_enabled ? "Rotation on" : "Rotation off"}</span>
                    <span>{Math.round(settings.rotation_speed_ms / 1000)} sec</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && selectedSettings && (
        <div className="space-y-6">
          <div className="rounded-sm border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-display text-4xl">{selected.name}</h3>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {selected.slug} · {selectedImages.length} / {MAX_SHOWCASE_IMAGES} showcase images
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setProductPickerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
                >
                  <ImagePlus className="h-4 w-4" /> Choose products
                </button>
                <button
                  onClick={() => deleteImages(selectedImages.map((img) => img.id))}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest text-destructive hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" /> Bulk delete
                </button>
                <button
                  onClick={resetCollection}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
                >
                  <RefreshCw className="h-4 w-4" /> Reset
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Selection mode
                <select
                  value={selectedSettings.selection_mode ?? "auto"}
                  onChange={(e) =>
                    saveSettings({ selection_mode: e.target.value as "auto" | "manual" })
                  }
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                >
                  <option value="auto">Auto Select From Collection</option>
                  <option value="manual">Manual Selection</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Choose mockup
                <select
                  value={selectedSettings.mockup_style ?? "black"}
                  onChange={(e) =>
                    saveSettings({
                      mockup_style: e.target.value as ShowcaseSettings["mockup_style"],
                    })
                  }
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                >
                  <option value="black">Black frame mockup</option>
                  <option value="white">White frame mockup</option>
                  <option value="random">Random black or white</option>
                  <option value="global">Follow global default (black)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSettings.section_enabled !== false}
                  onChange={(e) => saveSettings({ section_enabled: e.target.checked })}
                />{" "}
                Show collection section
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSettings.view_all_enabled !== false}
                  onChange={(e) => saveSettings({ view_all_enabled: e.target.checked })}
                />{" "}
                Show View All button
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSettings.rotation_enabled}
                  onChange={(e) => saveSettings({ rotation_enabled: e.target.checked })}
                />{" "}
                Rotation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSettings.pause_on_hover}
                  onChange={(e) => saveSettings({ pause_on_hover: e.target.checked })}
                />{" "}
                Pause on hover
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSettings.loop_enabled}
                  onChange={(e) => saveSettings({ loop_enabled: e.target.checked })}
                />{" "}
                Loop
              </label>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Display mode
                <select
                  value={selectedSettings.display_mode}
                  onChange={(e) => saveSettings({ display_mode: e.target.value as DisplayMode })}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                >
                  <option value="sequential">Sequential</option>
                  <option value="random">Random</option>
                  <option value="shuffle_refresh">Shuffle Every Refresh</option>
                </select>
              </label>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Rotation speed
                <select
                  value={
                    speedOptions.includes(selectedSettings.rotation_speed_ms)
                      ? selectedSettings.rotation_speed_ms
                      : "custom"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "custom")
                      saveSettings({ rotation_speed_ms: Number(e.target.value) });
                  }}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                >
                  {speedOptions.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed / 1000} sec
                    </option>
                  ))}
                  <option value="custom">Custom seconds</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={Math.round(selectedSettings.rotation_speed_ms / 1000)}
                  onChange={(e) =>
                    saveSettings({
                      rotation_speed_ms: Math.max(1, Number(e.target.value || 1)) * 1000,
                    })
                  }
                  className="mt-2 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                />
              </label>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Transition
                <select
                  value={selectedSettings.transition_type}
                  onChange={(e) =>
                    saveSettings({ transition_type: e.target.value as TransitionType })
                  }
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                >
                  <option value="fade">Fade</option>
                  <option value="cross_fade">Cross Fade</option>
                  <option value="zoom">Zoom</option>
                  <option value="slide_left">Slide Left</option>
                  <option value="slide_right">Slide Right</option>
                  <option value="scale_fade">Scale Fade</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-display text-3xl">Live Preview</h4>
              <div className="flex gap-2">
                {(["desktop", "tablet", "mobile"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setPreviewSize(size)}
                    className={`rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest ${previewSize === size ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center rounded-sm border border-border bg-background p-8">
              <PreviewFrame images={selectedImages} size={previewSize} />
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-display text-3xl">
                Showcase Images{" "}
                <span className="align-middle text-sm font-sans tracking-normal text-muted-foreground">
                  {selectedImages.length} / {MAX_SHOWCASE_IMAGES}
                </span>
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) copyFromSelected(e.target.value, false);
                    e.target.value = "";
                  }}
                  className="rounded-sm border border-border bg-background px-3 py-2 text-xs uppercase tracking-widest"
                >
                  <option value="">Duplicate settings to…</option>
                  {visibleCategories
                    .filter((c) => c.id !== selected.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <select
                  onChange={(e) => {
                    if (e.target.value) copyFromSelected(e.target.value, true);
                    e.target.value = "";
                  }}
                  className="rounded-sm border border-border bg-background px-3 py-2 text-xs uppercase tracking-widest"
                >
                  <option value="">Copy images to…</option>
                  {visibleCategories
                    .filter((c) => c.id !== selected.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {selectedImages.map((image, index) => (
                <div
                  key={image.id}
                  draggable
                  onDragStart={() => setDragId(image.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropImage(image.id)}
                  className="rounded-sm border border-border bg-background p-3"
                >
                  <div className="aspect-[4/5] overflow-hidden rounded-sm border-[8px] border-black bg-black">
                    <SafeImage
                      src={image.image_url}
                      alt={image.alt_text ?? ""}
                      className="h-full w-full"
                      style={{
                        objectFit:
                          image.width && image.height && image.width / image.height < 0.62
                            ? "contain"
                            : "cover",
                        objectPosition: "center",
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {index + 1}. {image.source_type}
                    </span>
                    <span>{image.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => moveImage(image, -1)}
                      disabled={index === 0}
                      className="rounded-sm border border-border p-1.5 hover:bg-accent disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveImage(image, 1)}
                      disabled={index === selectedImages.length - 1}
                      className="rounded-sm border border-border p-1.5 hover:bg-accent disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteImages([image.id])}
                      className="rounded-sm border border-border p-1.5 text-destructive hover:bg-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {selectedImages.length === 0 && (
                <div className="rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                  No showcase images. Homepage will use current default artwork.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {productPickerOpen && selected && (
        <div className="fixed inset-0 z-[80] bg-black/70 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-h-[92vh] max-w-5xl flex-col rounded-sm border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-display text-3xl">Choose From Existing Products</h3>
                <p className="text-xs text-muted-foreground">
                  Only products inside {selected.name} and its subcategories are shown.
                </p>
              </div>
              <button
                onClick={() => setProductPickerOpen(false)}
                className="rounded-sm border border-border p-2 hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-auto">
              {productQuery.isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Loading products…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {(productQuery.data ?? []).map((product) => (
                    <button
                      key={product.id}
                      onClick={() =>
                        setPickedProducts((prev) => {
                          const next = new Set(prev);
                          if (next.has(product.id)) next.delete(product.id);
                          else if (selectedImages.length + next.size < MAX_SHOWCASE_IMAGES)
                            next.add(product.id);
                          else toast.error("Maximum 10 showcase images per collection");
                          return next;
                        })
                      }
                      className={`rounded-sm border p-2 text-left ${pickedProducts.has(product.id) ? "border-primary bg-accent" : "border-border bg-background"}`}
                    >
                      <div className="aspect-[2/3] overflow-hidden rounded-sm bg-muted">
                        <SafeImage
                          src={product.image_url}
                          alt={product.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="mt-2 line-clamp-2 text-xs">{product.title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                        {product.featured && <span>Featured</span>}
                        {product.is_best_seller && <span>Best seller</span>}
                        <span>{product.views_count} views</span>
                        <span>{product.sales_count} orders</span>
                        <span>{product.cart_adds_count} carts</span>
                        <span>{product.wishlist_count} wishlists</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() =>
                  setPickedProducts(
                    new Set(
                      (productQuery.data ?? [])
                        .slice(0, Math.max(0, MAX_SHOWCASE_IMAGES - selectedImages.length))
                        .map((p) => p.id),
                    ),
                  )
                }
                className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                <Copy className="mr-2 inline h-3 w-3" /> Select up to 10
              </button>
              <button
                onClick={addPickedProducts}
                className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                <Save className="mr-2 inline h-3 w-3" /> Add selected ({pickedProducts.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
