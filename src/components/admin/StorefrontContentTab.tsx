import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { useAdminI18n } from "@/lib/admin-i18n";
import {
  DEFAULT_STOREFRONT_CONTENT,
  faqAnswer,
  normalizeStorefrontContent,
  STOREFRONT_CONTENT_KEY,
  trustDescription,
  type FAQItem,
  type StorefrontContent,
  type TrustPoint,
} from "@/lib/storefront-content";
import { supabase } from "@/integrations/supabase/client";

export function StorefrontContentTab() {
  const { lang } = useAdminI18n();
  const isArabic = lang === "ar";
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<StorefrontContent>(DEFAULT_STOREFRONT_CONTENT);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["admin-storefront-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", STOREFRONT_CONTENT_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeStorefrontContent(data?.value);
    },
  });

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: STOREFRONT_CONTENT_KEY,
        value: draft as unknown as never,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-storefront-content"] }),
        queryClient.invalidateQueries({ queryKey: ["storefront-content"] }),
      ]);
      toast.success(isArabic ? "تم نشر محتوى واجهة المتجر" : "Storefront content published");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic ? "تعذر الحفظ" : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Storefront</div>
          <h2 className="text-display text-4xl">
            {isArabic ? "محتوى الثقة والأسئلة الشائعة" : "Trust & FAQ Content"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isArabic
              ? "حرّر النصوص العربية والإنجليزية، وأعد الترتيب، وفعّل أو أخفِ العناصر من الواجهة."
              : "Edit Arabic and English copy, reorder items, and show or hide them on the storefront."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_STOREFRONT_CONTENT)}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" /> {isArabic ? "استعادة الافتراضي" : "Reset defaults"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || query.isLoading}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "..." : isArabic ? "نشر" : "Publish"}
          </button>
        </div>
      </div>

      <ContentHeader
        title={isArabic ? "قسم لماذا تختارنا" : "Why Choose Us"}
        labelEn={draft.trust.label.en}
        labelAr={draft.trust.label.ar}
        headingEn={draft.trust.heading.en}
        headingAr={draft.trust.heading.ar}
        descriptionEn={draft.trust.description.en}
        descriptionAr={draft.trust.description.ar}
        onChange={(key, language, value) =>
          setDraft((current) => ({
            ...current,
            trust: { ...current.trust, [key]: { ...current.trust[key], [language]: value } },
          }))
        }
        isArabic={isArabic}
      />
      <div className="space-y-3">
        {draft.trust.points.map((point, index) => (
          <TrustEditor
            key={point.id}
            point={point}
            index={index}
            total={draft.trust.points.length}
            isArabic={isArabic}
            onChange={(next) =>
              setDraft((current) => ({
                ...current,
                trust: { ...current.trust, points: replace(current.trust.points, index, next) },
              }))
            }
            onMove={(direction) =>
              setDraft((current) => ({
                ...current,
                trust: { ...current.trust, points: move(current.trust.points, index, direction) },
              }))
            }
          />
        ))}
      </div>

      <ContentHeader
        title={isArabic ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
        labelEn={draft.faq.label.en}
        labelAr={draft.faq.label.ar}
        headingEn={draft.faq.heading.en}
        headingAr={draft.faq.heading.ar}
        onChange={(key, language, value) => {
          if (key === "description") return;
          setDraft((current) => ({
            ...current,
            faq:
              key === "label"
                ? { ...current.faq, label: { ...current.faq.label, [language]: value } }
                : { ...current.faq, heading: { ...current.faq.heading, [language]: value } },
          }));
        }}
        isArabic={isArabic}
      />
      <div className="space-y-3">
        {draft.faq.items.map((item, index) => (
          <FAQEditor
            key={item.id}
            item={item}
            index={index}
            total={draft.faq.items.length}
            isArabic={isArabic}
            onChange={(next) =>
              setDraft((current) => ({
                ...current,
                faq: { ...current.faq, items: replace(current.faq.items, index, next) },
              }))
            }
            onMove={(direction) =>
              setDraft((current) => ({
                ...current,
                faq: { ...current.faq, items: move(current.faq.items, index, direction) },
              }))
            }
          />
        ))}
      </div>
    </div>
  );
}

function ContentHeader({
  title,
  labelEn,
  labelAr,
  headingEn,
  headingAr,
  descriptionEn,
  descriptionAr,
  onChange,
  isArabic,
}: {
  title: string;
  labelEn: string;
  labelAr: string;
  headingEn: string;
  headingAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  onChange: (
    key: "label" | "heading" | "description",
    language: "en" | "ar",
    value: string,
  ) => void;
  isArabic: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <h3 className="text-xl font-semibold">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="English label" value={labelEn} onChange={(v) => onChange("label", "en", v)} />
        <Input
          label="العنوان الصغير"
          value={labelAr}
          onChange={(v) => onChange("label", "ar", v)}
          dir="rtl"
        />
        <Input
          label="English heading"
          value={headingEn}
          onChange={(v) => onChange("heading", "en", v)}
        />
        <Input
          label="العنوان العربي"
          value={headingAr}
          onChange={(v) => onChange("heading", "ar", v)}
          dir="rtl"
        />
        {descriptionEn !== undefined && (
          <Textarea
            label="English description"
            value={descriptionEn}
            onChange={(v) => onChange("description", "en", v)}
          />
        )}
        {descriptionAr !== undefined && (
          <Textarea
            label="الوصف العربي"
            value={descriptionAr}
            onChange={(v) => onChange("description", "ar", v)}
            dir="rtl"
          />
        )}
      </div>
    </div>
  );
}

function TrustEditor({
  point,
  index,
  total,
  isArabic,
  onChange,
  onMove,
}: {
  point: TrustPoint;
  index: number;
  total: number;
  isArabic: boolean;
  onChange: (point: TrustPoint) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const description = point.description ?? trustDescription(point.id);
  return (
    <EditorShell
      title={isArabic ? point.ar : point.en}
      enabled={point.enabled}
      index={index}
      total={total}
      onMove={onMove}
      onToggle={(enabled) => onChange({ ...point, enabled })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="English title"
          value={point.en}
          onChange={(en) => onChange({ ...point, en })}
        />
        <Input
          label="العنوان العربي"
          value={point.ar}
          onChange={(ar) => onChange({ ...point, ar })}
          dir="rtl"
        />
        <Textarea
          label="English description"
          value={description.en}
          onChange={(en) => onChange({ ...point, description: { ...description, en } })}
        />
        <Textarea
          label="الوصف العربي"
          value={description.ar}
          onChange={(ar) => onChange({ ...point, description: { ...description, ar } })}
          dir="rtl"
        />
      </div>
    </EditorShell>
  );
}

function FAQEditor({
  item,
  index,
  total,
  isArabic,
  onChange,
  onMove,
}: {
  item: FAQItem;
  index: number;
  total: number;
  isArabic: boolean;
  onChange: (item: FAQItem) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const answer = item.answer ?? faqAnswer(item.id);
  return (
    <EditorShell
      title={isArabic ? item.ar : item.en}
      enabled={item.enabled}
      index={index}
      total={total}
      onMove={onMove}
      onToggle={(enabled) => onChange({ ...item, enabled })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="English question"
          value={item.en}
          onChange={(en) => onChange({ ...item, en })}
        />
        <Input
          label="السؤال العربي"
          value={item.ar}
          onChange={(ar) => onChange({ ...item, ar })}
          dir="rtl"
        />
        <Textarea
          label="English answer"
          value={answer.en}
          onChange={(en) => onChange({ ...item, answer: { ...answer, en } })}
        />
        <Textarea
          label="الإجابة العربية"
          value={answer.ar}
          onChange={(ar) => onChange({ ...item, answer: { ...answer, ar } })}
          dir="rtl"
        />
      </div>
    </EditorShell>
  );
}

function EditorShell({
  title,
  enabled,
  index,
  total,
  onMove,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details className="rounded-md border border-border bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
        <span>{title}</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.preventDefault();
              onMove(-1);
            }}
            className="rounded p-1 hover:bg-accent disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={(e) => {
              e.preventDefault();
              onMove(1);
            }}
            className="rounded p-1 hover:bg-accent disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function Input({
  label,
  value,
  onChange,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  dir?: "rtl";
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="admin-room-input mt-1"
      />
    </label>
  );
}
function Textarea({
  label,
  value,
  onChange,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  dir?: "rtl";
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <textarea
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="admin-room-input mt-1 min-h-28"
      />
    </label>
  );
}
function replace<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}
function move<T>(items: T[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}
