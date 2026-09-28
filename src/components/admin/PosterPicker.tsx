import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ImageOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { searchPostersForPickerAdmin } from "@/lib/db-admin.functions";
import { useAdminI18n } from "@/lib/admin-i18n";

export type PickablePoster = {
  id: string;
  title: string;
  slug: string;
  image_url: string;
  hidden: boolean;
  category: { name: string; slug: string } | null;
};

const PAGE_SIZE = 24;

/**
 * A search-driven poster picker (thumbnail + title + category + published
 * status), paginated server-side so it stays fast against a catalog of
 * thousands of posters — never loads the full list at once. Used anywhere
 * an admin needs to attach ONE poster to something (Dual Category Section
 * builder, etc.) without typing a URL.
 */
export function PosterPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PickablePoster | null;
  onChange: (poster: PickablePoster | null) => void;
}) {
  const { lang } = useAdminI18n();
  const isArabic = lang === "ar";
  const [open, setOpen] = useState(false);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-3 rounded-sm border border-border bg-card p-2">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {value ? (
            <img src={value.image_url} alt={value.title} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {value ? (
            <>
              <div className="truncate text-sm font-medium">{value.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {value.category?.name ?? (isArabic ? "بدون قسم" : "No category")}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              {isArabic ? "لم يتم اختيار منتج" : "No product selected"}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest hover:bg-accent"
          >
            {value ? (isArabic ? "تغيير" : "Change") : isArabic ? "اختيار" : "Select Product"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              title={isArabic ? "إزالة" : "Remove"}
              className="rounded-sm border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {open && (
        <PosterPickerDialog
          onClose={() => setOpen(false)}
          onSelect={(poster) => {
            onChange(poster);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PosterPickerDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (poster: PickablePoster) => void;
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
    queryKey: ["poster-picker-search", debounced, offset],
    queryFn: async () =>
      (await searchPostersForPickerAdmin({
        data: { query: debounced, offset, limit: PAGE_SIZE },
      })) as PickablePoster[],
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4 pb-3">
          <DialogTitle>{isArabic ? "اختر منتجًا" : "Select Product"}</DialogTitle>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isArabic ? "ابحث عن منتجات..." : "Search products..."}
              className="w-full rounded-sm border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-2">
          {isFetching && data.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isArabic ? "جارٍ البحث..." : "Searching..."}
            </div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {isArabic ? "لا توجد نتائج" : "No products found"}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center gap-3 rounded-sm p-2 text-left hover:bg-accent"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-muted">
                      <img src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {p.category?.name ?? (isArabic ? "بدون قسم" : "No category")}
                        {p.hidden ? ` · ${isArabic ? "مخفي" : "Hidden"}` : ""}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border p-3">
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
      </DialogContent>
    </Dialog>
  );
}
