import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { getDualCategorySectionsPublic } from "@/lib/db-public.functions";
import { SafeImage } from "@/components/SafeImage";

export type DualCategorySide = {
  poster_id: string | null;
  image_url: string | null;
  title: string | null;
  button_text: string | null;
  category_slug: string | null;
  category_name: string | null;
};

export type DualCategorySectionRow = {
  id: string;
  name: string;
  sort_order: number;
  left: DualCategorySide;
  right: DualCategorySide;
};

// One "Category A + Category B" promotional card — skipped entirely if it
// has neither an image nor a working category link, so a half-configured
// row never renders a dead card. Exported so the admin Dual Category
// Sections editor can render an exact, real live preview of the same
// card fed by the in-progress form state, instead of a second
// hand-built approximation.
export function DualCategoryCard({ side }: { side: DualCategorySide }) {
  const { t } = useTranslation();
  if (!side.image_url && !side.category_slug) return null;
  const content = (
    <>
      {side.image_url ? (
        <SafeImage
          src={side.image_url}
          alt={side.title || side.category_name || ""}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="relative flex h-full flex-col items-center justify-end gap-3 p-6 text-center sm:p-10">
        {side.title ? (
          <h3 className="text-display text-3xl text-white sm:text-5xl">{side.title}</h3>
        ) : null}
        {side.category_slug ? (
          <span className="inline-flex items-center rounded-sm border border-white/40 bg-white/10 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-sm transition group-hover:bg-white group-hover:text-black">
            {side.button_text || t("common.shopNow", { defaultValue: "Shop Now" })}
          </span>
        ) : null}
      </div>
    </>
  );

  const cardClass =
    "group relative flex aspect-[4/5] w-full overflow-hidden rounded-sm bg-muted sm:aspect-[3/4]";

  if (!side.category_slug) {
    return <div className={cardClass}>{content}</div>;
  }
  return (
    <Link to="/category/$slug" params={{ slug: side.category_slug }} className={cardClass}>
      {content}
    </Link>
  );
}

export function DualCategorySectionBlock({ section }: { section: DualCategorySectionRow }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
      <DualCategoryCard side={section.left} />
      <DualCategoryCard side={section.right} />
    </div>
  );
}

// Renders every enabled row from dual_category_sections (migration 026),
// each its own dynamic "Category A + Category B" pair — see
// neon/migrations/026_poster_merchandising.sql and the "dual-category"
// entry in homepage-sections.ts. Renders nothing (not even the section
// wrapper) until at least one pair exists and is enabled.
export function DualCategorySections() {
  const { data = [] } = useQuery({
    queryKey: ["dual-category-sections"],
    staleTime: 60_000,
    queryFn: async () => (await getDualCategorySectionsPublic()) as DualCategorySectionRow[],
  });

  if (data.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page space-y-10 py-16">
        {data.map((section) => (
          <DualCategorySectionBlock key={section.id} section={section} />
        ))}
      </div>
    </section>
  );
}
