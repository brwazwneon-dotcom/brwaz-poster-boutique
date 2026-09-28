import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ImageOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { searchCategoryImagesAdmin } from "@/lib/db-admin.functions";
import { useAdminI18n } from "@/lib/admin-i18n";

const PAGE_SIZE = 24;

/**
 * Browses every image (poster) that belongs to a category "tree" — a
 * parent category + its subcategories, or a single subcategory — matching
 * posters.category_id (primary) OR poster_categories (Additional
 * Categories, migration 026). Opened from the Categories tab's "Manage
 * images" button, replacing the old behavior of jumping to the Products
 * tab filtered by an exact category_id match only, which showed an empty
 * list for any parent whose images all live on its subcategories (the
 * normal case) or were placed here only as an Additional Category.
 */
export function CategoryImagesPanel({
  categoryLabel,
  categoryTreeIds,
  onClose,
  onOpenInProducts,
}: {
  categoryLabel: string;
  categoryTreeIds: string[];
  onClose: () => void;
  // Optional escape hatch to the full Products tab (bulk edit, badges,
  // Website Placement panel, etc.) for admins who need more than browsing.
  onOpenInProducts?: () => void;
}) {
  const { lang } = useAdminI18n();
  const isArabic = lang === "ar";
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data = [], isFetching } = useQuery({
    queryKey: ["category-images", categoryTreeIds, debounced, offset],
    queryFn: async () =>
      (await searchCategoryImagesAdmin({
        data: { categoryTreeIds, query: debounced, offset, limit: PAGE_SIZE },
      })) as Array<{
        id: string;
        title: string;
        slug: string;
        image_url: string;
        hidden: boolean;
        category: { name: string; slug: string } | null;
      }>,
  });

  const isEmpty = !isFetching && data.length === 0;
  const isEmptySearch = isEmpty && debounced === "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4 pb-3">
          <DialogTitle>
            {isArabic ? `صور: ${categoryLabel}` : `Images: ${categoryLabel}`}
          </DialogTitle>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isArabic ? "ابحث بالاسم..." : "Search by title..."}
              className="w-full rounded-sm border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3">
          {isFetching && data.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isArabic ? "جارٍ التحميل..." : "Loading..."}
            </div>
          ) : isEmptySearch ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {isArabic
                ? "لا توجد صور في هذا التصنيف حتى الآن."
                : "No images in this category yet."}
              <br />
              {isArabic
                ? "أضف منتجات هنا من تبويب Products، أو من قسم Website Placement داخل كل منتج."
                : "Add products here from the Products tab, or via each product's Website Placement panel."}
            </div>
          ) : isEmpty ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {isArabic ? "لا توجد نتائج مطابقة" : "No matching results"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.map((p) => (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-sm border border-border bg-card"
                >
                  <div className="aspect-square w-full overflow-hidden bg-muted">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-xs font-medium">{p.title}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {p.category?.name ?? (isArabic ? "بدون قسم" : "No category")}
                      {p.hidden ? ` · ${isArabic ? "مخفي" : "Hidden"}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-40"
            >
              {isArabic ? "السابق" : "Previous"}
            </button>
            <button
              type="button"
              disabled={data.length < PAGE_SIZE}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-40"
            >
              {isArabic ? "التالي" : "Next"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {onOpenInProducts && (
              <button
                type="button"
                onClick={onOpenInProducts}
                className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
              >
                {isArabic ? "فتح في Products" : "Open in Products"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={isArabic ? "إغلاق" : "Close"}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
