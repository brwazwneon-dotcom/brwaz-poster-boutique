import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { SafeImage } from "@/components/SafeImage";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROOM_TRANSFORMATION,
  ROOM_CTA_DESTINATIONS,
  ROOM_FRAME_STYLES,
  ROOM_PRESETS,
  ROOM_TRANSFORMATION_KEY,
  normalizeRoomSettings,
  type RoomCtaDestination,
  type RoomFrameStyle,
  type RoomPreset,
  type RoomTransformationSettings,
} from "@/lib/room-transformation";
import { useAdminI18n } from "@/lib/admin-i18n";

type ProductCandidate = {
  id: string;
  title: string;
  imageUrl: string;
  avifSrcSet?: string;
  webpSrcSet?: string;
};

export function RoomTransformationTab() {
  const qc = useQueryClient();
  const { lang } = useAdminI18n();
  const isAr = lang === "ar";
  const [draft, setDraft] = useState<RoomTransformationSettings>(DEFAULT_ROOM_TRANSFORMATION);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [previewSize, setPreviewSize] = useState<"desktop" | "mobile">("desktop");

  const settingsQuery = useQuery({
    queryKey: ["admin-room-transformation-settings"],
    queryFn: async (): Promise<RoomTransformationSettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", ROOM_TRANSFORMATION_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeRoomSettings(data?.value);
    },
  });

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const productsQuery = useQuery({
    queryKey: ["admin-room-transformation-products", search],
    staleTime: 60_000,
    queryFn: () => loadProductCandidates(search),
  });

  const selectedProduct = useMemo(
    () =>
      productsQuery.data?.find((product) => product.id === draft.posterId) ??
      productsQuery.data?.[0] ??
      null,
    [draft.posterId, productsQuery.data],
  );

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: ROOM_TRANSFORMATION_KEY,
        value: draft as unknown as never,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-room-transformation-settings"] }),
        qc.invalidateQueries({ queryKey: ["room-transformation-settings"] }),
        qc.invalidateQueries({ queryKey: ["room-transformation-artwork"] }),
      ]);
      toast.success(isAr ? "تم حفظ إعدادات التحوّل" : "Room transformation settings saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isAr ? "تعذر الحفظ" : "Could not save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof RoomTransformationSettings>(
    key: K,
    value: RoomTransformationSettings[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {isAr ? "الصفحة الرئيسية" : "Homepage"}
          </div>
          <h2 className="text-display text-4xl">
            {isAr ? "تحوّل الغرفة" : "Homepage Room Transformation"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isAr
              ? "تحكم في قسم قبل/بعد الجديد، صورة البرواز، والثيم البصري للغرفة."
              : "Control the new before/after section, framed artwork, and room visual preset."}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || settingsQuery.isLoading}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isAr ? "حفظ" : "Save"}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <label className="flex items-center justify-between gap-4 rounded-sm border border-border bg-background p-4 text-sm">
            <span>
              <span className="block font-semibold">{isAr ? "تفعيل القسم" : "Enable section"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {isAr
                  ? "إظهار أو إخفاء القسم من الصفحة الرئيسية."
                  : "Show or hide the section on the homepage."}
              </span>
            </span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setField("enabled", e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isAr ? "العنوان بالعربية" : "Arabic heading"}>
              <input
                className="admin-room-input"
                value={draft.headingAr}
                onChange={(e) => setField("headingAr", e.target.value)}
              />
            </Field>
            <Field label={isAr ? "العنوان بالإنجليزية" : "English heading"}>
              <input
                className="admin-room-input"
                value={draft.headingEn}
                onChange={(e) => setField("headingEn", e.target.value)}
              />
            </Field>
            <Field label={isAr ? "الوصف بالعربية" : "Arabic subheading"}>
              <textarea
                className="admin-room-input min-h-24"
                value={draft.subheadingAr}
                onChange={(e) => setField("subheadingAr", e.target.value)}
              />
            </Field>
            <Field label={isAr ? "الوصف بالإنجليزية" : "English subheading"}>
              <textarea
                className="admin-room-input min-h-24"
                value={draft.subheadingEn}
                onChange={(e) => setField("subheadingEn", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isAr ? "خلفية الغرفة" : "Room background"}>
              <select
                className="admin-room-input"
                value={draft.roomPreset}
                onChange={(e) => setField("roomPreset", e.target.value as RoomPreset)}
              >
                {Object.entries(ROOM_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={isAr ? "ستايل البرواز" : "Frame style"}>
              <select
                className="admin-room-input"
                value={draft.frameStyle}
                onChange={(e) => setField("frameStyle", e.target.value as RoomFrameStyle)}
              >
                {Object.entries(ROOM_FRAME_STYLES).map(([key, frame]) => (
                  <option key={key} value={key}>
                    {frame.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={isAr ? "وجهة الزر" : "CTA destination"}>
              <select
                className="admin-room-input"
                value={draft.ctaDestination}
                onChange={(e) => setField("ctaDestination", e.target.value as RoomCtaDestination)}
              >
                {Object.entries(ROOM_CTA_DESTINATIONS).map(([key, cta]) => (
                  <option key={key} value={key}>
                    {cta.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-3 rounded-sm border border-border bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.secondaryCtaEnabled}
                onChange={(e) => setField("secondaryCtaEnabled", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              {isAr ? "إظهار زر اطبع صورتك" : "Show Print Your Photo CTA"}
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {isAr ? "الصورة" : "Artwork"}
              </div>
              <h3 className="mt-1 font-semibold">
                {isAr ? "اختر صورة المنتج" : "Choose featured product image"}
              </h3>
            </div>
            <div className="relative w-56 max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="admin-room-input pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "بحث" : "Search"}
              />
            </div>
          </div>

          <div className="grid max-h-[420px] gap-3 overflow-auto pr-1 sm:grid-cols-2">
            {productsQuery.isLoading && (
              <div className="text-sm text-muted-foreground">
                {isAr ? "جار التحميل..." : "Loading..."}
              </div>
            )}
            {(productsQuery.data ?? []).map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setField("posterId", product.id)}
                className={cn(
                  "flex gap-3 rounded-sm border bg-background p-2 text-left transition hover:border-primary/70",
                  draft.posterId === product.id ? "border-primary" : "border-border",
                )}
              >
                <SafeImage
                  src={product.imageUrl}
                  avifSrcSet={product.avifSrcSet}
                  webpSrcSet={product.webpSrcSet}
                  alt={product.title}
                  className="h-20 w-14 rounded-sm object-cover"
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  <span className="line-clamp-2">{product.title}</span>
                  <span className="mt-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Optimized image
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setPreviewSize("desktop")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs uppercase tracking-widest",
                previewSize === "desktop" ? "bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setPreviewSize("mobile")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs uppercase tracking-widest",
                previewSize === "mobile" ? "bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              Mobile
            </button>
          </div>
          <AdminRoomPreview settings={draft} product={selectedProduct} size={previewSize} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function AdminRoomPreview({
  settings,
  product,
  size,
}: {
  settings: RoomTransformationSettings;
  product: ProductCandidate | null;
  size: "desktop" | "mobile";
}) {
  const room = ROOM_PRESETS[settings.roomPreset];
  const frame = ROOM_FRAME_STYLES[settings.frameStyle];
  return (
    <div
      className={cn(
        "mx-auto overflow-hidden rounded-md border border-border",
        size === "mobile" ? "max-w-[280px]" : "max-w-2xl",
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <picture className="absolute inset-0 h-full w-full">
          <source
            type="image/avif"
            srcSet={size === "mobile" ? room.mobileAvif : room.desktopAvif}
          />
          <source
            type="image/webp"
            srcSet={size === "mobile" ? room.mobileWebp : room.desktopWebp}
          />
          <img
            src={size === "mobile" ? room.mobileWebp : room.desktopWebp}
            alt={room.label}
            className="h-full w-full object-cover"
            style={{
              objectPosition: size === "mobile" ? room.mobileObjectPosition : room.objectPosition,
            }}
            loading="lazy"
          />
        </picture>
        <div className="absolute inset-0 bg-black/10" />
        <div
          className="absolute aspect-[0.72] -translate-x-1/2 -translate-y-1/2 rounded-sm p-[0.7%] shadow-[9px_12px_24px_rgba(0,0,0,0.24)]"
          style={{
            left: size === "mobile" ? room.frame.mobileLeft : room.frame.left,
            top: size === "mobile" ? room.frame.mobileTop : room.frame.top,
            width: size === "mobile" ? room.frame.mobileWidth : room.frame.width,
            border: `6px solid ${frame.frame}`,
            background: frame.mat,
          }}
        >
          {product ? (
            <SafeImage
              src={product.imageUrl}
              avifSrcSet={product.avifSrcSet}
              webpSrcSet={product.webpSrcSet}
              alt={product.title}
              className="h-full w-full object-contain"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function loadProductCandidates(search: string): Promise<ProductCandidate[]> {
  const query = supabase
    .from("posters")
    .select("id,title")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(80);
  const { data: posters, error } = search.trim()
    ? await query.ilike("title", `%${search.trim()}%`)
    : await query;
  if (error) throw error;
  const ids = (posters ?? []).map((poster) => poster.id);
  if (ids.length === 0) return [];
  const { data: variants } = await supabase
    .from("image_variants")
    .select("source_id,url,variant")
    .eq("source_table", "posters")
    .eq("status", "done")
    .in("source_id", ids)
    .in("variant", [
      "thumb_avif",
      "thumb_webp",
      "small_avif",
      "small_webp",
      "medium_avif",
      "medium_webp",
    ]);
  const byId = new Map<string, Record<string, string>>();
  for (const row of variants ?? []) {
    const id = String(row.source_id ?? "");
    const url = String(row.url ?? "");
    const variant = String(row.variant ?? "");
    if (!id || !url || !variant) continue;
    byId.set(id, { ...(byId.get(id) ?? {}), [variant]: url });
  }
  return (posters ?? [])
    .map((poster) => {
      const found = byId.get(poster.id);
      if (!found) return null;
      const imageUrl = found.small_webp ?? found.thumb_webp ?? found.medium_webp;
      if (!imageUrl) return null;
      return {
        id: poster.id,
        title: poster.title,
        imageUrl,
        avifSrcSet:
          [
            found.thumb_avif ? `${found.thumb_avif} 240w` : "",
            found.small_avif ? `${found.small_avif} 480w` : "",
            found.medium_avif ? `${found.medium_avif} 800w` : "",
          ]
            .filter(Boolean)
            .join(", ") || undefined,
        webpSrcSet:
          [
            found.thumb_webp ? `${found.thumb_webp} 240w` : "",
            found.small_webp ? `${found.small_webp} 480w` : "",
            found.medium_webp ? `${found.medium_webp} 800w` : "",
          ]
            .filter(Boolean)
            .join(", ") || undefined,
      };
    })
    .filter(Boolean) as ProductCandidate[];
}
