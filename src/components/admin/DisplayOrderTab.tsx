import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  ArrowDownToLine,
  Pin,
  PinOff,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SmartImage } from "@/components/SmartImage";
import { cn } from "@/lib/utils";
import { useAdminI18n } from "@/lib/admin-i18n";
import { HelpTip } from "@/components/admin/help/HelpTip";

type Cat = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  image: string | null;
  sort_order: number;
  sort_mode: string;
};

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  sort_order: number;
  pinned: boolean;
  hidden: boolean;
  is_best_seller: boolean;
  trending: boolean;
  badge: string | null;
};

const SORT_MODES = [
  { id: "manual", label: "Manual Order", ar: "ترتيب يدوي" },
  { id: "newest", label: "Newest First", ar: "الأحدث" },
  { id: "bestselling", label: "Best Sellers", ar: "الأكثر مبيعاً" },
  { id: "trending", label: "Trending", ar: "الرائج" },
  { id: "popular", label: "Most Viewed", ar: "الأكثر مشاهدة" },
  { id: "random", label: "Random", ar: "عشوائي" },
  { id: "ai", label: "AI Recommended", ar: "اقتراح ذكي" },
];

export function DisplayOrderTab() {
  const { lang } = useAdminI18n();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["display-order-cats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,slug,parent_id,image,sort_order,sort_mode")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Cat[];
    },
  });

  const roots = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  );
  const openCat = openId ? categories.find((c) => c.id === openId) ?? null : null;

  if (openCat) {
    return (
      <CategoryOrderEditor
        cat={openCat}
        subcats={categories.filter((c) => c.parent_id === openCat.id)}
        onBack={() => setOpenId(null)}
        lang={lang}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-display text-2xl">
          {lang === "ar" ? "ترتيب عرض الأقسام" : "Category Display Order Manager"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {lang === "ar"
            ? "اختر قسمًا لتعديل ترتيب البوسترات داخله، تثبيت الأول، أو تغيير طريقة الفرز."
            : "Choose a category to reorder its posters, pin favorites to the top, or change its sort mode."}
        </p>
      </div>
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {roots.map((c) => {
            const kids = categories.filter((k) => k.parent_id === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="group relative overflow-hidden rounded-sm border border-border bg-card text-left hover:border-primary"
              >
                <div className="aspect-[3/2] w-full bg-muted">
                  {c.image && (
                    <SmartImage
                      src={c.image}
                      alt={c.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3">
                  <div className="font-semibold">{c.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{kids} sub</span>
                    <span className="rounded-sm bg-accent px-1.5 py-0.5">
                      {c.sort_mode || "newest"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

function CategoryOrderEditor({
  cat,
  subcats,
  onBack,
  lang,
}: {
  cat: Cat;
  subcats: Cat[];
  onBack: () => void;
  lang: "en" | "ar";
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"posters" | "subs" | "settings">("posters");
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<string>("");
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [flag, setFlag] = useState<"all" | "trending" | "bestseller" | "pinned">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const includedIds = useMemo(() => {
    if (subFilter) return [subFilter];
    return [cat.id, ...subcats.map((s) => s.id)];
  }, [cat.id, subcats, subFilter]);

  const postersQ = useQuery({
    queryKey: ["display-order-posters", cat.id, includedIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id,sort_order,pinned,hidden,is_best_seller,trending,badge")
        .in("category_id", includedIds)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Poster[];
    },
  });

  const [orderOverride, setOrderOverride] = useState<Poster[] | null>(null);
  const posters = orderOverride ?? postersQ.data ?? [];

  const filtered = useMemo(() => {
    return posters.filter((p) => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (visibility === "visible" && p.hidden) return false;
      if (visibility === "hidden" && !p.hidden) return false;
      if (flag === "trending" && !p.trending) return false;
      if (flag === "bestseller" && !p.is_best_seller) return false;
      if (flag === "pinned" && !p.pinned) return false;
      return true;
    });
  }, [posters, search, visibility, flag]);

  const visible = filtered.slice(0, limit);

  const move = (idx: number, delta: number) => {
    if (idx + delta < 0 || idx + delta >= posters.length) return;
    const next = [...posters];
    const [row] = next.splice(idx, 1);
    next.splice(idx + delta, 0, row);
    setOrderOverride(next);
  };

  const sendToTop = (idx: number) => {
    const next = [...posters];
    const [row] = next.splice(idx, 1);
    next.unshift(row);
    setOrderOverride(next);
  };

  const sendToBottom = (idx: number) => {
    const next = [...posters];
    const [row] = next.splice(idx, 1);
    next.push(row);
    setOrderOverride(next);
  };

  const setManualOrder = (id: string, orderNum: number) => {
    const next = [...posters];
    const from = next.findIndex((p) => p.id === id);
    if (from < 0) return;
    const to = Math.max(0, Math.min(next.length - 1, orderNum - 1));
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setOrderOverride(next);
  };

  const saveOrder = async () => {
    const list = orderOverride ?? posters;
    // group by actual category_id so we save independently per sub
    const groups = new Map<string, string[]>();
    list.forEach((p) => {
      if (!p.category_id) return;
      if (!groups.has(p.category_id)) groups.set(p.category_id, []);
      groups.get(p.category_id)!.push(p.id);
    });
    try {
      for (const [catId, ids] of groups) {
        const { error } = await supabase.rpc("admin_reorder_posters", {
          _category_id: catId,
          _ids: ids,
        });
        if (error) throw error;
      }
      // Ensure sort_mode is manual so the storefront honors it
      if (cat.sort_mode !== "manual") {
        await supabase.rpc("admin_set_category_sort_mode", { _id: cat.id, _mode: "manual" });
        qc.invalidateQueries({ queryKey: ["display-order-cats"] });
      }
      setOrderOverride(null);
      qc.invalidateQueries({ queryKey: ["display-order-posters", cat.id] });
      toast.success(lang === "ar" ? "تم حفظ ترتيب الكاتجوري بنجاح" : "Category order updated successfully");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  };

  const togglePin = async (p: Poster) => {
    const { error } = await supabase.rpc("admin_pin_poster", { _id: p.id, _pinned: !p.pinned });
    if (error) return toast.error(error.message);
    postersQ.refetch();
    setOrderOverride(null);
    toast.success(!p.pinned ? "Pinned first" : "Unpinned");
  };

  const toggleHide = async (p: Poster) => {
    const { error } = await supabase.from("posters").update({ hidden: !p.hidden }).eq("id", p.id);
    if (error) return toast.error(error.message);
    postersQ.refetch();
  };

  const dirty = !!orderOverride;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {lang === "ar" ? "رجوع" : "Back"}
          </button>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {lang === "ar" ? "ترتيب داخل" : "Ordering inside"}
            </div>
            <h2 className="text-display text-2xl">{cat.name}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/category/${cat.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" /> {lang === "ar" ? "معاينة" : "Preview"}
          </a>
          {dirty && (
            <button
              onClick={saveOrder}
              className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              {lang === "ar" ? "حفظ الترتيب" : "Save Order"}
            </button>
          )}
          {dirty && (
            <button
              onClick={() => setOrderOverride(null)}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" /> {lang === "ar" ? "إلغاء" : "Reset"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b border-border">
        {[
          { id: "posters", label: lang === "ar" ? "ترتيب البوسترات" : "Posters Order" },
          { id: "subs", label: lang === "ar" ? "ترتيب الأقسام الفرعية" : "Sub Categories" },
          { id: "settings", label: lang === "ar" ? "إعدادات الفرز" : "Sort Mode" },
        ].map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id as any)}
            className={cn(
              "border-b-2 px-4 py-2 text-xs font-semibold uppercase tracking-widest",
              tab === x.id ? "border-primary" : "border-transparent text-muted-foreground",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "posters" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "ar" ? "بحث بالاسم..." : "Search by name..."}
                className="w-full rounded-sm border border-border bg-background px-9 py-2 text-sm"
              />
            </div>
            <select
              value={subFilter}
              onChange={(e) => { setSubFilter(e.target.value); setOrderOverride(null); }}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">{lang === "ar" ? "كل الأقسام الفرعية" : "All sub categories"}</option>
              {subcats.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
            <select
              value={flag}
              onChange={(e) => setFlag(e.target.value as any)}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All flags</option>
              <option value="pinned">Pinned</option>
              <option value="trending">Trending</option>
              <option value="bestseller">Best Sellers</option>
            </select>
          </div>

          {postersQ.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visible.map((p) => {
                const idx = posters.findIndex((x) => x.id === p.id);
                return (
                  <div key={p.id} className="relative overflow-hidden rounded-sm border border-border bg-card">
                    <div className="relative aspect-[2/3] bg-muted">
                      <SmartImage
                        src={p.image_url}
                        sourceTable="posters"
                        sourceId={p.id}
                        alt={p.title}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-1 top-1 flex flex-col gap-1">
                        {p.pinned && (
                          <span className="rounded-sm bg-yellow-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                            📌 Pinned First
                          </span>
                        )}
                        {p.trending && (
                          <span className="rounded-sm bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            🔥 Trending
                          </span>
                        )}
                        {p.is_best_seller && (
                          <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
                            ⭐ Best
                          </span>
                        )}
                        {p.hidden && (
                          <span className="rounded-sm bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            Hidden
                          </span>
                        )}
                      </div>
                      <span className="absolute right-1 top-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-bold">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="p-2">
                      <div className="truncate text-xs font-semibold" title={p.title}>{p.title}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={posters.length}
                          defaultValue={idx + 1}
                          onBlur={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (!isNaN(n) && n !== idx + 1) setManualOrder(p.id, n);
                          }}
                          className="w-14 rounded-sm border border-border bg-background px-2 py-1 text-xs"
                        />
                        <div className="ml-auto flex items-center gap-0.5">
                          <IconBtn helpId="images.pin_top" title="Top" onClick={() => sendToTop(idx)}>
                            <ArrowUpToLine className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn helpId="images.move_up" title="Up" onClick={() => move(idx, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn helpId="images.move_down" title="Down" onClick={() => move(idx, 1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn helpId="images.send_bottom" title="Bottom" onClick={() => sendToBottom(idx)}>
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                          </IconBtn>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <IconBtn
                          helpId="images.pin_top"
                          title={p.pinned ? "Unpin" : "Pin to top"}
                          onClick={() => togglePin(p)}
                          className={p.pinned ? "bg-yellow-100 dark:bg-yellow-900/40" : ""}
                        >
                          {p.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </IconBtn>
                        <IconBtn
                          helpId={p.hidden ? "images.show" : "images.hide"}
                          title={p.hidden ? "Show" : "Hide"}
                          onClick={() => toggleHide(p)}
                        >
                          {p.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > visible.length && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="rounded-sm border border-border px-6 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                Load more ({filtered.length - visible.length} left)
              </button>
            </div>
          )}
        </>
      )}

      {tab === "subs" && (
        <SubcategoryOrderEditor
          parentId={cat.id}
          initial={subcats}
          lang={lang}
          onSaved={() => qc.invalidateQueries({ queryKey: ["display-order-cats"] })}
        />
      )}

      {tab === "settings" && (
        <div className="max-w-xl">
          <div className="mb-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {lang === "ar" ? "طريقة الفرز" : "Sort Mode"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SORT_MODES.map((m) => (
              <button
                key={m.id}
                onClick={async () => {
                  const { error } = await supabase.rpc("admin_set_category_sort_mode", { _id: cat.id, _mode: m.id });
                  if (error) return toast.error(error.message);
                  qc.invalidateQueries({ queryKey: ["display-order-cats"] });
                  toast.success(lang === "ar" ? "تم التحديث" : "Updated");
                }}
                className={cn(
                  "rounded-sm border px-4 py-3 text-left text-sm transition",
                  cat.sort_mode === m.id
                    ? "border-primary bg-accent"
                    : "border-border hover:border-muted-foreground",
                )}
              >
                {lang === "ar" ? m.ar : m.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {lang === "ar"
              ? "الترتيب اليدوي يستخدم الأرقام التي تحفظها في تبويب البوسترات + المثبتون في الأعلى."
              : "Manual uses the numbers you save in the Posters tab, with pinned items first."}
          </p>
        </div>
      )}
    </div>
  );
}

function SubcategoryOrderEditor({
  parentId,
  initial,
  lang,
  onSaved,
}: {
  parentId: string;
  initial: Cat[];
  lang: "en" | "ar";
  onSaved: () => void;
}) {
  const [list, setList] = useState<Cat[]>(initial);
  const dirty = list.map((x) => x.id).join(",") !== initial.map((x) => x.id).join(",");
  const move = (i: number, d: number) => {
    if (i + d < 0 || i + d >= list.length) return;
    const next = [...list];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row);
    setList(next);
  };
  const save = async () => {
    const { error } = await supabase.rpc("admin_reorder_subcategories", {
      _parent_id: parentId,
      _ids: list.map((x) => x.id),
    });
    if (error) return toast.error(error.message);
    onSaved();
    toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
  };
  if (initial.length === 0) {
    return <div className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد أقسام فرعية." : "No sub categories."}</div>;
  }
  return (
    <div className="max-w-xl">
      <div className="space-y-2">
        {list.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 rounded-sm border border-border bg-card p-3">
            <span className="w-6 text-center text-sm font-bold">{i + 1}</span>
            <div className="flex-1 text-sm">{s.name}</div>
            <IconBtn helpId="images.move_up" title="Up" onClick={() => move(i, -1)}>
              <ArrowUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn helpId="images.move_down" title="Down" onClick={() => move(i, 1)}>
              <ArrowDown className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        ))}
      </div>
      {dirty && (
        <button
          onClick={save}
          className="mt-4 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          {lang === "ar" ? "حفظ الترتيب" : "Save Order"}
        </button>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  className,
  helpId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
  helpId?: string;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn("inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border hover:bg-accent", className)}
    >
      {children}
    </button>
  );
  if (helpId) return <HelpTip id={helpId}>{btn}</HelpTip>;
  return btn;
}
