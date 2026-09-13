import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, GripVertical, Loader2, RotateCcw, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getAllSiteSettingsAdmin, setSiteSetting } from "@/lib/db-admin.functions";
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

// Ported from the pre-Neon-migration src/components/admin/HomepageLayoutTab.tsx
// (Supabase-backed, unwired since the migration) — same drag/reorder UI and
// draft-vs-published workflow, just reading/writing through the Neon
// site_settings admin functions instead of supabase.from(). The storefront
// side (src/lib/homepage-sections.ts's useHomeSections()) already reads
// HOME_SECTIONS_KEY/HOME_SECTIONS_DRAFT_KEY via Neon — only the admin editor
// was still on the old backend.
function serialize(sections: HomeSectionConfig[]) {
  return JSON.stringify(withLayoutMetadata(sections));
}

export function HomepageLayoutSection() {
  const [draft, setDraft] = useState<HomeSectionConfig[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = (await getAllSiteSettingsAdmin()) as Array<{ key: string; value: unknown }>;
      const map = new Map(rows.map((r) => [r.key, r.value]));
      const draftValue = map.get(HOME_SECTIONS_DRAFT_KEY);
      const publishedValue = draftValue ? undefined : map.get(HOME_SECTIONS_KEY);
      const sections = normalizeHomeSections(draftValue ?? publishedValue ?? DEFAULT_HOME_SECTIONS);
      setDraft(sections);
      setSavedSnapshot(serialize(sections));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown database error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

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

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    setDraft((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return withLayoutMetadata(next);
    });
  };

  const existingKeys = useMemo(() => new Set(draft.map((s) => s.key)), [draft]);

  const missingRegistrySections = useMemo(
    () => HOME_SECTION_REGISTRY.filter((entry) => !existingKeys.has(entry.key)),
    [existingKeys],
  );

  const syncHomeSections = async () => {
    const existing = new Set(draft.map((s) => s.key));
    const toAdd = HOME_SECTION_REGISTRY.filter((entry) => !existing.has(entry.key));
    if (toAdd.length === 0) {
      toast.info("All registered homepage sections are already present.");
      return;
    }
    const added = toAdd.map(registryEntryToSection);
    const next = withLayoutMetadata([...draft, ...added]).map((section) => ({
      ...section,
      updatedAt: new Date().toISOString(),
    }));
    setDraft(next);
    try {
      await setSiteSetting({ data: { key: HOME_SECTIONS_DRAFT_KEY, value: next } });
      setSavedSnapshot(serialize(next));
      toast.success(`Sync complete — ${added.length} section(s) added: ${toAdd.map((e) => e.label).join(", ")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync homepage sections");
    }
  };

  const persistDraft = async (sections = draft, showToast = true) => {
    const now = new Date().toISOString();
    const next = withLayoutMetadata(sections).map((section) => ({ ...section, updatedAt: now }));
    await setSiteSetting({ data: { key: HOME_SECTIONS_DRAFT_KEY, value: next } });
    setDraft(next);
    setSavedSnapshot(serialize(next));
    if (showToast) toast.success("Homepage layout draft saved");
    return next;
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await persistDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save homepage layout");
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    setSaving(true);
    try {
      await persistDraft(draft, false);
      openPreviewWindow("/", "desktop");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare preview");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const next = await persistDraft(draft, false);
      await setSiteSetting({ data: { key: HOME_SECTIONS_KEY, value: next } });
      toast.success("Homepage layout published");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish homepage layout");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-sm border border-border bg-card">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading homepage layout...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-sm border border-destructive/50 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold">Homepage Layout could not load</h2>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        <button
          type="button"
          onClick={load}
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
          <h2 className="text-display text-2xl">Homepage Layout</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Reorder, enable, and hide sections in a draft. Visitors only see changes after Publish.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.length} section(s) &middot; {HOME_SECTION_REGISTRY.length} registered
          </p>
          {missingRegistrySections.length > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              {missingRegistrySections.length} registered section(s) not yet in this layout — use Sync to add
              them.
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
