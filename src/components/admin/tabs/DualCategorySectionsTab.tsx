import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  Eye,
  EyeOff,
  Columns2,
  Monitor,
  Smartphone,
} from "lucide-react";
import {
  listDualCategorySectionsAdmin,
  upsertDualCategorySectionAdmin,
  deleteDualCategorySectionAdmin,
  reorderDualCategorySectionsAdmin,
  listCategoriesAdmin,
  type DualCategorySectionInput,
} from "@/lib/db-admin.functions";
import { PosterPickerField, type PickablePoster } from "@/components/admin/PosterPicker";
import { DualCategoryCard, type DualCategorySide } from "@/components/DualCategorySections";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { useAdminI18n } from "@/lib/admin-i18n";
import type { AdminCategory } from "./shared";

type DualCategorySectionRow = {
  id: string;
  name: string;
  left_poster_id: string | null;
  left_category_id: string | null;
  left_title: string | null;
  left_button_text: string | null;
  right_poster_id: string | null;
  right_category_id: string | null;
  right_title: string | null;
  right_button_text: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const QUERY_KEY = ["admin-dual-category-sections"];

export function DualCategorySectionsTab() {
  const { lang } = useAdminI18n();
  const isArabic = lang === "ar";
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<DualCategorySectionRow | "new" | null>(null);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await listDualCategorySectionsAdmin()) as DualCategorySectionRow[],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories-for-dual"],
    queryFn: async () => (await listCategoriesAdmin()) as AdminCategory[],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[index], next[j]] = [next[j], next[index]];
    await reorderDualCategorySectionsAdmin({ data: { orderedIds: next.map((s) => s.id) } });
    invalidate();
  };

  const toggleEnabled = async (row: DualCategorySectionRow) => {
    await upsertDualCategorySectionAdmin({
      data: {
        id: row.id,
        name: row.name,
        left_poster_id: row.left_poster_id,
        left_category_id: row.left_category_id,
        left_title: row.left_title,
        left_button_text: row.left_button_text,
        right_poster_id: row.right_poster_id,
        right_category_id: row.right_category_id,
        right_title: row.right_title,
        right_button_text: row.right_button_text,
        enabled: !row.enabled,
        sort_order: row.sort_order,
      },
    });
    toast.success(row.enabled ? "Unpublished" : "Published");
    invalidate();
  };

  const remove = async (row: DualCategorySectionRow) => {
    if (
      !(await confirm({
        title: isArabic ? "حذف القسم؟" : "Delete this section?",
        description: isArabic
          ? `سيتم حذف "${row.name}" من الصفحة الرئيسية نهائيًا. المنتجات والأقسام نفسها لن تتأثر.`
          : `"${row.name}" will be permanently removed from the homepage. The products and categories themselves are not affected.`,
        confirmLabel: isArabic ? "حذف" : "Delete",
        destructive: true,
      }))
    )
      return;
    await deleteDualCategorySectionAdmin({ data: row.id });
    toast.success("Deleted");
    invalidate();
  };

  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? "—") : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            <Columns2 className="h-3.5 w-3.5" />
            {isArabic ? "المحتوى" : "Content"}
          </div>
          <h2 className="text-display text-3xl">
            {isArabic ? "أقسام مزدوجة (فئة + فئة)" : "Dual Category Sections"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isArabic
              ? "بطاقتان جنبًا إلى جنب في الصفحة الرئيسية، كل واحدة برابط لقسم مختلف (مثال: أفلام + كرة قدم). أنشئ أي عدد تريده — أي فئة مع أي فئة."
              : "Two side-by-side homepage cards, each linking to a different category (e.g. Movies + Football). Create as many as you like — any category with any category."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          {isArabic ? "إضافة قسم جديد" : "Add New Dual Category Section"}
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 text-sm text-muted-foreground">
          {isArabic ? "جارٍ التحميل..." : "Loading..."}
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {isArabic
            ? "لا توجد أقسام بعد. أنشئ أول قسم بالضغط أعلاه."
            : "No sections yet. Create your first one above."}
        </div>
      ) : (
        <ul className="space-y-3">
          {sections.map((row, i) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded-sm border border-border p-1 hover:bg-accent disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === sections.length - 1}
                  className="rounded-sm border border-border p-1 hover:bg-accent disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  <span
                    className={
                      row.enabled
                        ? "rounded-sm bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-success"
                        : "rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                    }
                  >
                    {row.enabled
                      ? isArabic
                        ? "منشور"
                        : "Published"
                      : isArabic
                        ? "مسودة"
                        : "Draft"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {categoryName(row.left_category_id)} + {categoryName(row.right_category_id)}
                </div>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleEnabled(row)}
                  title={row.enabled ? "Unpublish" : "Publish"}
                  className="rounded-sm border border-border p-2 hover:bg-accent"
                >
                  {row.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(row)}
                  title={isArabic ? "تعديل" : "Edit"}
                  className="rounded-sm border border-border p-2 hover:bg-accent"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(row)}
                  title={isArabic ? "حذف" : "Delete"}
                  className="rounded-sm border border-destructive/40 p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <DualCategorySectionEditor
          initial={editing === "new" ? null : editing}
          categories={categories}
          nextSortOrder={sections.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
  categories,
  isArabic,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  categories: AdminCategory[];
  isArabic: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
    >
      <option value="">{isArabic ? "— اختر فئة —" : "— Select category —"}</option>
      {categories
        .filter((c) => !c.parent_id)
        .map((main) => (
          <optgroup key={main.id} label={main.name}>
            <option value={main.id}>{main.name}</option>
            {categories
              .filter((c) => c.parent_id === main.id)
              .map((sub) => (
                <option key={sub.id} value={sub.id}>
                  — {sub.name}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}

function DualCategorySectionEditor({
  initial,
  categories,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  initial: DualCategorySectionRow | null;
  categories: AdminCategory[];
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useAdminI18n();
  const isArabic = lang === "ar";
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop");
  const [name, setName] = useState(initial?.name ?? "");
  const [leftPoster, setLeftPoster] = useState<PickablePoster | null>(
    initial?.left_poster_id
      ? {
          id: initial.left_poster_id,
          title: "",
          slug: "",
          image_url: "",
          hidden: false,
          category: null,
        }
      : null,
  );
  const [leftCategoryId, setLeftCategoryId] = useState<string | null>(
    initial?.left_category_id ?? null,
  );
  const [leftTitle, setLeftTitle] = useState(initial?.left_title ?? "");
  const [leftButton, setLeftButton] = useState(initial?.left_button_text ?? "");
  const [rightPoster, setRightPoster] = useState<PickablePoster | null>(
    initial?.right_poster_id
      ? {
          id: initial.right_poster_id,
          title: "",
          slug: "",
          image_url: "",
          hidden: false,
          category: null,
        }
      : null,
  );
  const [rightCategoryId, setRightCategoryId] = useState<string | null>(
    initial?.right_category_id ?? null,
  );
  const [rightTitle, setRightTitle] = useState(initial?.right_title ?? "");
  const [rightButton, setRightButton] = useState(initial?.right_button_text ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  // If editing an existing section, we only know the poster ids from the
  // list query (it doesn't join image/title) — fetch just those two
  // posters' display info once so the picker shows a real thumbnail
  // instead of a blank placeholder.
  useEffect(() => {
    const ids = [initial?.left_poster_id, initial?.right_poster_id].filter(Boolean) as string[];
    if (ids.length === 0) return;
    (async () => {
      const { getPostersByIdsForPickerAdmin } = await import("@/lib/db-admin.functions");
      const results = (await getPostersByIdsForPickerAdmin({
        data: { ids },
      })) as PickablePoster[];
      const byId = new Map(results.map((r) => [r.id, r]));
      if (initial?.left_poster_id) {
        const found = byId.get(initial.left_poster_id);
        if (found) setLeftPoster(found);
      }
      if (initial?.right_poster_id) {
        const found = byId.get(initial.right_poster_id);
        if (found) setRightPoster(found);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!name.trim()) return toast.error(isArabic ? "الاسم مطلوب" : "Section name is required");
    setSaving(true);
    try {
      const payload: DualCategorySectionInput = {
        id: initial?.id,
        name: name.trim(),
        left_poster_id: leftPoster?.id ?? null,
        left_category_id: leftCategoryId,
        left_title: leftTitle.trim() || null,
        left_button_text: leftButton.trim() || null,
        right_poster_id: rightPoster?.id ?? null,
        right_category_id: rightCategoryId,
        right_title: rightTitle.trim() || null,
        right_button_text: rightButton.trim() || null,
        enabled,
        sort_order: initial?.sort_order ?? nextSortOrder,
      };
      await upsertDualCategorySectionAdmin({ data: payload });
      toast.success(isArabic ? "تم الحفظ" : "Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    // z-40, deliberately LOWER than the shadcn Dialog primitive's z-50
    // (used by PosterPickerField's picker, and by useConfirm's dialogs) —
    // this editor is a plain custom overlay, not built on that primitive,
    // so it must stay under it for the Poster Picker to visibly stack on
    // top when opened from inside this form.
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-border bg-background p-6">
        <h3 className="text-display text-xl">
          {initial
            ? isArabic
              ? "تعديل القسم"
              : "Edit Section"
            : isArabic
              ? "قسم جديد"
              : "New Section"}
        </h3>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {isArabic ? "اسم القسم" : "Section Name"}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isArabic ? "مثال: أفلام + كرة قدم" : "e.g. Movies + Football"}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-3 rounded-sm border border-border p-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {isArabic ? "البطاقة اليسرى" : "Left Card"}
            </h4>
            <PosterPickerField
              label={isArabic ? "المنتج / الصورة" : "Image/Product"}
              value={leftPoster}
              onChange={setLeftPoster}
            />
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {isArabic ? "الفئة" : "Category"}
              </span>
              <div className="mt-1">
                <CategorySelect
                  value={leftCategoryId}
                  onChange={setLeftCategoryId}
                  categories={categories}
                  isArabic={isArabic}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {isArabic ? "العنوان" : "Title"}
              </span>
              <input
                value={leftTitle}
                onChange={(e) => setLeftTitle(e.target.value)}
                className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {isArabic ? "نص الزر" : "Button"}
              </span>
              <input
                value={leftButton}
                onChange={(e) => setLeftButton(e.target.value)}
                placeholder={isArabic ? "تسوق الآن" : "Shop Now"}
                className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-sm border border-border p-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {isArabic ? "البطاقة اليمنى" : "Right Card"}
            </h4>
            <PosterPickerField
              label={isArabic ? "المنتج / الصورة" : "Image/Product"}
              value={rightPoster}
              onChange={setRightPoster}
            />
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {isArabic ? "الفئة" : "Category"}
              </span>
              <div className="mt-1">
                <CategorySelect
                  value={rightCategoryId}
                  onChange={setRightCategoryId}
                  categories={categories}
                  isArabic={isArabic}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {isArabic ? "العنوان" : "Title"}
              </span>
              <input
                value={rightTitle}
                onChange={(e) => setRightTitle(e.target.value)}
                className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {isArabic ? "نص الزر" : "Button"}
              </span>
              <input
                value={rightButton}
                onChange={(e) => setRightButton(e.target.value)}
                placeholder={isArabic ? "تسوق الآن" : "Shop Now"}
                className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 rounded-sm border border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {isArabic ? "معاينة حية" : "Live Preview"}
            </h4>
            <div className="flex overflow-hidden rounded-sm border border-border text-[10px] uppercase tracking-widest">
              <button
                type="button"
                onClick={() => setPreviewViewport("desktop")}
                className={`inline-flex items-center gap-1 px-3 py-1 ${previewViewport === "desktop" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                <Monitor className="h-3 w-3" /> {isArabic ? "شاشة" : "Desktop"}
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewport("mobile")}
                className={`inline-flex items-center gap-1 px-3 py-1 ${previewViewport === "mobile" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                <Smartphone className="h-3 w-3" /> {isArabic ? "موبايل" : "Mobile"}
              </button>
            </div>
          </div>
          <div className={previewViewport === "mobile" ? "mx-auto max-w-[280px]" : ""}>
            <div
              className={`grid gap-3 ${previewViewport === "mobile" ? "grid-cols-1" : "grid-cols-2"}`}
            >
              <DualCategoryCard
                side={{
                  poster_id: leftPoster?.id ?? null,
                  image_url: leftPoster?.image_url ?? null,
                  title: leftTitle || null,
                  button_text: leftButton || null,
                  category_slug: categories.find((c) => c.id === leftCategoryId)?.slug ?? null,
                  category_name: categories.find((c) => c.id === leftCategoryId)?.name ?? null,
                }}
              />
              <DualCategoryCard
                side={{
                  poster_id: rightPoster?.id ?? null,
                  image_url: rightPoster?.image_url ?? null,
                  title: rightTitle || null,
                  button_text: rightButton || null,
                  category_slug: categories.find((c) => c.id === rightCategoryId)?.slug ?? null,
                  category_name: categories.find((c) => c.id === rightCategoryId)?.name ?? null,
                }}
              />
            </div>
          </div>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {isArabic ? "منشور (يظهر في الصفحة الرئيسية)" : "Published (visible on the homepage)"}
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            {isArabic ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {saving ? (isArabic ? "جارٍ الحفظ..." : "Saving...") : isArabic ? "حفظ" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
