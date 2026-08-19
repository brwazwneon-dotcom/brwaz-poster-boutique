import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AUDIENCE_KEYS,
  AUDIENCE_LABEL,
  landingUtmUrl,
  type AudienceKey,
  type LandingPage,
} from "@/lib/landing-pages";
import { useCategories } from "@/lib/use-categories";
import {
  Copy,
  ExternalLink,
  GripVertical,
  Pin,
  PinOff,
  Save,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LinkedPoster = {
  id: string;
  poster_id: string;
  sort_order: number;
  pinned: boolean;
  poster: {
    id: string;
    title: string;
    image_url: string | null;
    category_id: string | null;
  } | null;
};

export function LandingManagerTab() {
  const qc = useQueryClient();
  const [active, setActive] = useState<AudienceKey>("movies");

  const pagesQ = useQuery({
    queryKey: ["admin-landing-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("*")
        .order("audience_key");
      if (error) throw error;
      return (data ?? []) as unknown as LandingPage[];
    },
  });
  const page = pagesQ.data?.find((p) => p.audience_key === active) ?? null;

  const linkedQ = useQuery({
    queryKey: ["admin-landing-linked", page?.id],
    queryFn: async () => {
      if (!page?.id) return [] as LinkedPoster[];
      const { data, error } = await supabase
        .from("landing_page_posters")
        .select(
          "id, poster_id, sort_order, pinned, poster:posters(id, title, image_url, category_id)",
        )
        .eq("landing_page_id", page.id)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LinkedPoster[];
    },
    enabled: !!page?.id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-landing-pages"] });
    qc.invalidateQueries({ queryKey: ["admin-landing-linked"] });
    qc.invalidateQueries({ queryKey: ["landing-bundle"] });
    qc.invalidateQueries({ queryKey: ["poster-audiences"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-2xl">Ad Campaign Landing Manager</h2>
        <p className="text-sm text-muted-foreground">
          كل جمهور له صفحة هبوط منفصلة. تحكم في العناوين والصور والرسائل، وانسخ روابط UTM مباشرة
          للإعلانات على Meta.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIENCE_KEYS.map((k) => {
          const p = pagesQ.data?.find((x) => x.audience_key === k);
          return (
            <button
              key={k}
              onClick={() => setActive(k)}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest transition",
                active === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {AUDIENCE_LABEL[k].en}
              {p && !p.visible && <span className="ml-2 text-[9px] text-destructive">Hidden</span>}
            </button>
          );
        })}
      </div>

      {pagesQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {page && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <PageEditor page={page} onSaved={invalidateAll} />
          <PosterPicker
            landingPageId={page.id}
            linked={linkedQ.data ?? []}
            onChanged={invalidateAll}
          />
        </div>
      )}
    </div>
  );
}

function PageEditor({ page, onSaved }: { page: LandingPage; onSaved: () => void }) {
  const { data: categories = [] } = useCategories();
  const [form, setForm] = useState<LandingPage>(page);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm(page);
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof LandingPage>(k: K, v: LandingPage[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/landing/${form.audience_key}`
      : `/landing/${form.audience_key}`;
  const utmUrl =
    typeof window !== "undefined" ? landingUtmUrl(window.location.origin, form.audience_key) : "";

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("landing_pages")
        .update({
          visible: form.visible,
          title_ar: form.title_ar,
          title_en: form.title_en,
          subtitle_ar: form.subtitle_ar,
          subtitle_en: form.subtitle_en,
          hero_image: form.hero_image,
          whatsapp_message: form.whatsapp_message,
          cta_text: form.cta_text,
          source_category_id: form.source_category_id || null,
          display_mode: form.display_mode,
          poster_limit: Math.max(1, Math.min(60, Number(form.poster_limit) || 24)),
          seo_title: form.seo_title,
          meta_description: form.meta_description,
        })
        .eq("id", form.id);
      if (error) throw error;
      toast.success("Landing page saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const copy = (t: string) => {
    navigator.clipboard
      .writeText(t)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Copy failed"));
  };

  return (
    <div className="rounded-sm border border-border bg-background p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-display text-lg">{AUDIENCE_LABEL[form.audience_key].en} Landing</div>
        <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest cursor-pointer">
          <input
            type="checkbox"
            checked={form.visible}
            onChange={(e) => set("visible", e.target.checked)}
          />
          {form.visible ? (
            <>
              <Eye className="h-3.5 w-3.5" /> Visible
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Hidden
            </>
          )}
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title (Arabic)">
          <input
            dir="rtl"
            value={form.title_ar ?? ""}
            onChange={(e) => set("title_ar", e.target.value)}
            className={input}
          />
        </Field>
        <Field label="Title (English)">
          <input
            value={form.title_en ?? ""}
            onChange={(e) => set("title_en", e.target.value)}
            className={input}
          />
        </Field>
        <Field label="Subtitle (Arabic)">
          <input
            dir="rtl"
            value={form.subtitle_ar ?? ""}
            onChange={(e) => set("subtitle_ar", e.target.value)}
            className={input}
          />
        </Field>
        <Field label="Subtitle (English)">
          <input
            value={form.subtitle_en ?? ""}
            onChange={(e) => set("subtitle_en", e.target.value)}
            className={input}
          />
        </Field>
        <Field label="Hero image URL">
          <input
            value={form.hero_image ?? ""}
            onChange={(e) => set("hero_image", e.target.value)}
            className={input}
            placeholder="https://…"
          />
        </Field>
        <Field label="Main CTA text">
          <input
            value={form.cta_text ?? ""}
            onChange={(e) => set("cta_text", e.target.value)}
            className={input}
          />
        </Field>
        <Field label="WhatsApp message" className="sm:col-span-2">
          <textarea
            dir="rtl"
            rows={3}
            value={form.whatsapp_message ?? ""}
            onChange={(e) => set("whatsapp_message", e.target.value)}
            className={cn(input, "min-h-[76px]")}
          />
        </Field>
        <Field label="Source category (optional)">
          <select
            value={form.source_category_id ?? ""}
            onChange={(e) => set("source_category_id", e.target.value || null)}
            className={input}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Display mode">
          <select
            value={form.display_mode}
            onChange={(e) => set("display_mode", e.target.value as LandingPage["display_mode"])}
            className={input}
          >
            <option value="manual">Manual (only picked posters)</option>
            <option value="category">Category (from selected category)</option>
            <option value="smart_mix">Smart Mix (picked + top from category)</option>
          </select>
        </Field>
        <Field label="Number of posters shown">
          <input
            type="number"
            min={1}
            max={60}
            value={form.poster_limit}
            onChange={(e) => set("poster_limit", Number(e.target.value))}
            className={input}
          />
        </Field>
        <Field label="SEO title" className="sm:col-span-2">
          <input
            value={form.seo_title ?? ""}
            onChange={(e) => set("seo_title", e.target.value)}
            className={input}
          />
        </Field>
        <Field label="Meta description" className="sm:col-span-2">
          <textarea
            rows={2}
            value={form.meta_description ?? ""}
            onChange={(e) => set("meta_description", e.target.value)}
            className={cn(input, "min-h-[52px]")}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex gap-2">
          <button onClick={() => copy(url)} className={btn}>
            <Copy className="h-3.5 w-3.5" /> Copy Link
          </button>
          <button onClick={() => copy(utmUrl)} className={btn}>
            <Copy className="h-3.5 w-3.5" /> Copy UTM Link
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className={btn}>
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </a>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={cn(
            btn,
            "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="rounded-sm border border-border bg-muted/30 p-2 text-[11px] font-mono break-all">
        {utmUrl || url}
      </div>
    </div>
  );
}

function PosterPicker({
  landingPageId,
  linked,
  onChanged,
}: {
  landingPageId: string;
  linked: LinkedPoster[];
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const posters = useQuery({
    queryKey: ["admin-landing-poster-search", search],
    queryFn: async () => {
      let q = supabase
        .from("posters")
        .select("id, title, image_url, category_id")
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .limit(40);
      if (search.trim().length >= 2) q = q.ilike("title", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string;
        image_url: string | null;
        category_id: string | null;
      }>;
    },
  });

  const linkedIds = useMemo(() => new Set(linked.map((l) => l.poster_id)), [linked]);

  async function addPoster(posterId: string) {
    setBusy(posterId);
    try {
      const nextOrder = (linked.reduce((m, l) => Math.max(m, l.sort_order), 0) || 0) + 1;
      const { error } = await supabase.from("landing_page_posters").insert({
        landing_page_id: landingPageId,
        poster_id: posterId,
        sort_order: nextOrder,
      });
      if (error) throw error;
      toast.success("Added");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeLink(id: string) {
    setBusy(id);
    try {
      const { error } = await supabase.from("landing_page_posters").delete().eq("id", id);
      if (error) throw error;
      toast.success("Removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function togglePin(l: LinkedPoster) {
    setBusy(l.id);
    try {
      const { error } = await supabase
        .from("landing_page_posters")
        .update({ pinned: !l.pinned })
        .eq("id", l.id);
      if (error) throw error;
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function move(l: LinkedPoster, dir: -1 | 1) {
    const sorted = [...linked].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === l.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    setBusy(l.id);
    try {
      await supabase
        .from("landing_page_posters")
        .update({ sort_order: swap.sort_order })
        .eq("id", l.id);
      await supabase
        .from("landing_page_posters")
        .update({ sort_order: l.sort_order })
        .eq("id", swap.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-background p-4 space-y-4">
      <div>
        <div className="text-display text-lg">Selected posters ({linked.length})</div>
        <p className="text-xs text-muted-foreground">
          Pin يظهر أول الصفحة. الترتيب من الأعلى للأسفل.
        </p>
      </div>

      {linked.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No posters selected yet. Pick some below.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-sm border border-border divide-y divide-border">
          {linked.map((l) => (
            <div key={l.id} className="flex items-center gap-2 p-2">
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="h-12 w-9 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                {l.poster?.image_url && (
                  <img
                    src={l.poster.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="truncate">{l.poster?.title ?? "—"}</div>
                {l.pinned && (
                  <div className="text-[10px] text-primary uppercase tracking-widest">Pinned</div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <IconBtn onClick={() => move(l, -1)} disabled={busy === l.id} title="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={() => move(l, 1)} disabled={busy === l.id} title="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  onClick={() => togglePin(l)}
                  disabled={busy === l.id}
                  title={l.pinned ? "Unpin" : "Pin to top"}
                >
                  {l.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </IconBtn>
                <IconBtn onClick={() => removeLink(l.id)} disabled={busy === l.id} title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search posters to add…"
          className={input}
        />
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {posters.data?.map((p) => {
            const already = linkedIds.has(p.id);
            return (
              <button
                key={p.id}
                disabled={already || busy === p.id}
                onClick={() => addPoster(p.id)}
                className={cn(
                  "group relative overflow-hidden rounded-sm border text-left transition",
                  already ? "border-primary/40 opacity-50" : "border-border hover:border-primary",
                )}
                title={already ? "Already added" : "Add to campaign"}
              >
                <div className="aspect-[2/3] bg-muted">
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-1.5 text-[10px] truncate">{p.title}</div>
                {!already && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/70 opacity-0 transition group-hover:opacity-100">
                    <Plus className="h-6 w-6 text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const input = "w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm";
const btn =
  "inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent";
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}
function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
