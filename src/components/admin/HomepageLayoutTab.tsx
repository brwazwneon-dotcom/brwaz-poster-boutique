import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, GripVertical, Loader2, RotateCcw, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_HOME_SECTIONS,
  HOME_SECTION_LABELS,
  HOME_SECTION_REGISTRY,
  HOME_SECTIONS_DRAFT_KEY,
  HOME_SECTIONS_KEY,
  normalizeHomeSections,
  registryEntryToSection,
  withLayoutMetadata,
  type HomeSectionConfig,
} from "@/lib/homepage-sections";
import { openPreviewWindow } from "@/lib/preview-mode";
import { cn } from "@/lib/utils";

function serialize(sections: HomeSectionConfig[]) {
  return JSON.stringify(withLayoutMetadata(sections));
}

async function loadSetting(key: string) {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value;
}

export function HomepageLayoutTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HomeSectionConfig[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const layoutQuery = useQuery({
    queryKey: ["admin-homepage-layout"],
    queryFn: async () => {
      const draftValue = await loadSetting(HOME_SECTIONS_DRAFT_KEY);
      const publishedValue = draftValue ? undefined : await loadSetting(HOME_SECTIONS_KEY);
      return normalizeHomeSections(draftValue ?? publishedValue ?? DEFAULT_HOME_SECTIONS);
    },
  });

  useEffect(() => {
    if (!layoutQuery.data) return;
    setDraft(layoutQuery.data);
    setSavedSnapshot(serialize(layoutQuery.data));
  }, [layoutQuery.data]);

  const dirty = useMemo(
    () => draft.length > 0 && serialize(draft) !== savedSnapshot,
    [draft, savedSnapshot],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateAt = (index: number, patch: Partial<HomeSectionConfig>) => {
    setDraft((current) =>
      withLayoutMetadata(
        current.map((section, sectionIndex) =>
          sectionIndex === index ? { ...section, ...patch } : section,
        ),
      ),
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    setDraft((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return withLayoutMetadata(next);
    });
  };

  const existingKeys = useMemo(() => new Set(draft.map((s) => s.key)), [draft]);

  const missingRegistrySections = useMemo(
    () => HOME_SECTION_REGISTRY.filter((entry) => !existingKeys.has(entry.key)),
    [existingKeys],
  );

  const syncHomeSections = async () => {
    const current = draft;
    const existing = new Set(current.map((s) => s.key));
    const toAdd = HOME_SECTION_REGISTRY.filter((entry) => !existing.has(entry.key));
    if (toAdd.length === 0) {
      toast.info("All registered homepage sections are already present.");
      return;
    }
    const added = toAdd.map(registryEntryToSection);
    const next = withLayoutMetadata([...current, ...added]).map((section) => ({
      ...section,
      updatedAt: new Date().toISOString(),
    }));
    setDraft(next);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: HOME_SECTIONS_DRAFT_KEY, value: next as never });
    if (error) {
      toast.error("Failed to sync homepage sections: " + error.message);
      return;
    }
    setSavedSnapshot(serialize(next));
    await queryClient.invalidateQueries({ queryKey: ["admin-homepage-layout"] });
    toast.success(`Sync complete — ${added.length} section(s) added: ${toAdd.map((e) => e.label).join(", ")}`);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    setDraft((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return withLayoutMetadata(next);
    });
  };

  const persistDraft = async (sections = draft, showToast = true) => {
    const now = new Date().toISOString();
    const next = withLayoutMetadata(sections).map((section) => ({ ...section, updatedAt: now }));
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: HOME_SECTIONS_DRAFT_KEY, value: next as never });
    if (error) throw error;
    setDraft(next);
    setSavedSnapshot(serialize(next));
    await queryClient.invalidateQueries({ queryKey: ["admin-homepage-layout"] });
    if (showToast) toast.success("Homepage layout draft saved");
    return next;
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await persistDraft();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save homepage layout");
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    setSaving(true);
    try {
      await persistDraft(draft, false);
      openPreviewWindow("/", "desktop");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare preview");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const next = await persistDraft(draft, false);
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: HOME_SECTIONS_KEY, value: next as never });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["homepage-sections"] });
      toast.success("Homepage layout published");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish homepage layout");
    } finally {
      setPublishing(false);
    }
  };

  if (layoutQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-sm border border-border bg-card">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading homepage layout...
      </div>
    );
  }

  if (layoutQuery.isError) {
    return (
      <div className="rounded-sm border border-destructive/50 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold">Homepage Layout could not load</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {layoutQuery.error instanceof Error
            ? layoutQuery.error.message
            : "Unknown database error"}
        </p>
        <button
          type="button"
          onClick={() => layoutQuery.refetch()}
          className="mt-4 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-sm border border-border bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Storefront</p>
          <h2 className="text-display text-4xl">Homepage Layout</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Reorder, enable, and hide sections in a draft. Visitors only see changes after Publish.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.length} section(s) &middot;{" "}
            {HOME_SECTION_REGISTRY.length} registered
          </p>
          {missingRegistrySections.length > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              {missingRegistrySections.length} registered section(s) not yet in this layout — use Sync to add them.
            </p>
          )}
          <p className={cn("mt-2 text-xs", dirty ? "text-amber-600" : "text-muted-foreground")}>
            {dirty ? "You have unsaved changes." : "All draft changes are saved."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={syncHomeSections}
            disabled={saving || publishing || missingRegistrySections.length === 0}
            title="Sync Homepage Sections"
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" /> Sync Homepage Sections
          </button>
          <button
            type="button"
            onClick={() => setDraft(normalizeHomeSections(DEFAULT_HOME_SECTIONS))}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" /> Restore defaults
          </button>
          <button
            type="button"
            onClick={preview}
            disabled={saving || publishing}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            <Eye className="h-4 w-4" /> Preview
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || publishing || !dirty}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={saving || publishing}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publish
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {draft.map((section, index) => {
          const regEntry = !section.custom
            ? HOME_SECTION_REGISTRY.find((r) => r.key === section.key)
            : undefined;
          const label =
            (HOME_SECTION_LABELS as Record<string, string>)[section.key] ??
            section.label ??
            regEntry?.label ??
            section.title ??
            section.key;
          return (
            <article
              key={section.id ?? section.key}
              draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedIndex !== null) moveTo(draggedIndex, index);
                setDraggedIndex(null);
              }}
              className={cn(
                "rounded-sm border border-border bg-card p-4 transition",
                !section.enabled && "opacity-60",
                draggedIndex === index && "opacity-50",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <GripVertical className="h-5 w-5 cursor-grab text-muted-foreground" aria-hidden />
                <span className="w-7 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="min-w-48 flex-1">
                  <div className="font-semibold">{label}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {section.key}
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={(event) => updateAt(index, { enabled: event.target.checked })}
                  />
                  {section.enabled ? "Enabled" : "Disabled"}
                </label>
                <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                  <input
                    type="checkbox"
                    checked={section.visible !== false}
                    onChange={(event) => updateAt(index, { visible: event.target.checked })}
                  />
                  {section.visible !== false ? "Shown" : "Hidden"}
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    className="rounded-sm border border-border p-2 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.length - 1}
                    title="Move down"
                    className="rounded-sm border border-border p-2 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  value={section.title_en ?? section.title ?? ""}
                  onChange={(event) => updateAt(index, { title_en: event.target.value })}
                  placeholder="Section title (English)"
                  className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={section.title_ar ?? ""}
                  onChange={(event) => updateAt(index, { title_ar: event.target.value })}
                  placeholder="عنوان القسم"
                  dir="rtl"
                  className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={section.subtitle_en ?? section.subtitle ?? ""}
                  onChange={(event) => updateAt(index, { subtitle_en: event.target.value })}
                  placeholder="Section subtitle (English)"
                  className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={section.subtitle_ar ?? ""}
                  onChange={(event) => updateAt(index, { subtitle_ar: event.target.value })}
                  placeholder="وصف القسم"
                  dir="rtl"
                  className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
