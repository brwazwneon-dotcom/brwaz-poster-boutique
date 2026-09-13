import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listPostersAdmin,
  listAllPosterImageUrlsAdmin,
  listHeroBannersAdmin,
  listCategoriesAdmin,
  listSliderImagesAdmin,
  listHighlightsAdmin,
  listSetsAdmin,
  listCustomOffersAdmin,
  listBeforeAfterAdmin,
  listLandingPagesAdmin,
  getAllSiteSettingsAdmin,
} from "@/lib/db-admin.functions";
import { listMediaLibraryAdmin, deleteMediaAssetAdmin } from "@/lib/image-upload.functions";
import { MOCKUP_DEFAULTS, MOCKUP_KEYS, parseMockup } from "@/lib/use-settings";
import {
  type AdminPoster,
  type AdminHeroBanner,
  type AdminCategory,
  type AdminSliderImage,
  type AdminHighlight,
  type AdminSet,
  type AdminCustomOffer,
  type AdminBeforeAfter,
  type AdminLandingPage,
} from "./shared";
import { MOCKUP_COLORS } from "./FrameMockupsTab";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";

type MediaBlob = { url: string; pathname: string; size: number; uploadedAt: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryTab() {
  const confirm = useConfirm();
  const [blobs, setBlobs] = useState<MediaBlob[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [usedUrls, setUsedUrls] = useState<Set<string>>(new Set());
  const [onlyOrphaned, setOnlyOrphaned] = useState(false);

  const loadPage = async (after?: string) => {
    const res = await listMediaLibraryAdmin({ data: after ? { cursor: after } : {} });
    setBlobs((prev) => (after ? [...(prev ?? []), ...res.blobs] : res.blobs));
    setCursor(res.cursor);
    setHasMore(res.hasMore);
  };

  useEffect(() => {
    (async () => {
      // Every upload in this admin (products, gallery images, categories,
      // hero banners, homepage slider, highlights, sets, custom offers,
      // before/after, landing pages, frame mockups) goes through
      // uploadPosterImage into the same "posters/" blob prefix that this
      // library lists — so ALL of these must be cross-referenced, or
      // legitimately-used images from every tab except Products/Hero
      // Banners would incorrectly show up as "Unused".
      const [
        products,
        posterImages,
        banners,
        categories,
        sliderImages,
        highlights,
        sets,
        customOffers,
        beforeAfter,
        landingPages,
        settings,
      ] = await Promise.all([
        listPostersAdmin({ data: {} }),
        listAllPosterImageUrlsAdmin(),
        listHeroBannersAdmin(),
        listCategoriesAdmin(),
        listSliderImagesAdmin(),
        listHighlightsAdmin(),
        listSetsAdmin(),
        listCustomOffersAdmin(),
        listBeforeAfterAdmin(),
        listLandingPagesAdmin(),
        getAllSiteSettingsAdmin(),
      ]);
      const used = new Set<string>();
      for (const p of products as AdminPoster[]) used.add(p.image_url);
      for (const pi of posterImages as Array<{ image_url: string }>) used.add(pi.image_url);
      for (const b of banners as AdminHeroBanner[]) used.add(b.image_url);
      for (const c of categories as AdminCategory[]) if (c.image) used.add(c.image);
      for (const s of sliderImages as AdminSliderImage[]) used.add(s.image_url);
      for (const h of highlights as AdminHighlight[]) if (h.image_url) used.add(h.image_url);
      for (const s of sets as AdminSet[]) if (s.image_url) used.add(s.image_url);
      for (const o of customOffers as AdminCustomOffer[]) if (o.image_url) used.add(o.image_url);
      for (const ba of beforeAfter as AdminBeforeAfter[]) {
        used.add(ba.before_url);
        used.add(ba.after_url);
      }
      for (const lp of landingPages as AdminLandingPage[]) if (lp.hero_image) used.add(lp.hero_image);
      const settingsMap = new Map(
        (settings as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]),
      );
      for (const color of MOCKUP_COLORS) {
        const mockup = parseMockup(settingsMap.get(MOCKUP_KEYS[color]), MOCKUP_DEFAULTS[color]);
        if (mockup.image) used.add(mockup.image);
      }
      setUsedUrls(used);
      await loadPage();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await loadPage(cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (url: string) => {
    if (usedUrls.has(url) && !(await confirm("This image is used by a product or banner. Delete anyway?"))) return;
    if (!usedUrls.has(url) && !(await confirm("Delete this image permanently?"))) return;
    try {
      await deleteMediaAssetAdmin({ data: { url } });
      setBlobs((prev) => prev?.filter((b) => b.url !== url) ?? null);
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied");
    } catch {
      toast.error("Couldn't copy URL");
    }
  };

  if (blobs === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const visible = onlyOrphaned ? blobs.filter((b) => !usedUrls.has(b.url)) : blobs;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Media library</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyOrphaned} onChange={(e) => setOnlyOrphaned(e.target.checked)} />
          Unused only
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images found.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((b) => (
            <div key={b.url} className="group relative overflow-hidden rounded-sm border border-border">
              <img src={b.url} alt="" className="aspect-square w-full object-cover" />
              {!usedUrls.has(b.url) && (
                <span className="absolute left-1 top-1 rounded-sm bg-amber-500/90 px-1 py-0.5 text-[9px] font-medium text-black">
                  Unused
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 p-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => copyUrl(b.url)} className="text-[10px] text-white hover:underline">
                  Copy
                </button>
                <button onClick={() => remove(b.url)} className="text-[10px] text-red-400 hover:underline">
                  Delete
                </button>
              </div>
              <div className="border-t border-border bg-card px-1.5 py-1 text-[9px] text-muted-foreground">
                {formatBytes(b.size)}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && !onlyOrphaned && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-sm border border-border py-2 text-xs disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
