import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Plus, Check, Search, X, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/use-categories";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `cat-${Date.now()}`;
}

type Props = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (id: string) => void;
  options: Category[];
  /** null = top-level (main category); string = parent id (sub category). */
  parentId: string | null;
  /** When set, disables Add New with this message. */
  addDisabledReason?: string;
  disabled?: boolean;
  emptyText?: string;
};

export function CategoryPicker({
  label,
  placeholder = "Select…",
  value,
  onChange,
  options,
  parentId,
  addDisabledReason,
  disabled,
  emptyText = "No categories yet",
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const selected = options.find((c) => c.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((c) => c.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => nameRef.current?.focus(), 30);
    } else {
      setNewName("");
    }
  }, [modalOpen]);

  const openAdd = () => {
    if (addDisabledReason) {
      toast.error(addDisabledReason);
      return;
    }
    setOpen(false);
    setModalOpen(true);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return toast.error("Enter a category name");
    setSaving(true);
    try {
      const base = slugify(name);
      // Ensure unique slug within siblings of same parent.
      const siblings = new Set(options.map((c) => c.slug));
      let slug = base;
      let n = 2;
      while (siblings.has(slug)) slug = `${base}-${n++}`;
      const nextOrder = options.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 1;
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name,
          slug,
          parent_id: parentId,
          sort_order: nextOrder,
          image: null,
        })
        .select("id")
        .single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["categories"] });
      if (data?.id) onChange(data.id);
      toast.success(`Added "${name}"`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "mt-1 flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none transition hover:border-primary/60 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span className={cn("truncate", !selected && "text-muted-foreground")}>
                {selected ? selected.name : placeholder}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-[var(--radix-popover-trigger-width)] min-w-[240px] border-border bg-popover p-0"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {options.length === 0 ? emptyText : "No matches"}
                </div>
              ) : (
                filtered.map((c) => {
                  const active = c.id === value;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent",
                        active && "bg-accent/60 text-primary",
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
            <div className="sticky bottom-0 border-t border-border bg-popover">
              <button
                type="button"
                onClick={openAdd}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-primary/10",
                  addDisabledReason && "opacity-60",
                )}
                title={addDisabledReason}
              >
                <Plus className="h-4 w-4" />
                Add New
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={submitNew}
            className="w-full max-w-sm rounded-sm border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-widest">
                Add {label}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Name
              </span>
              <input
                ref={nameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={parentId ? "e.g. Real Madrid" : "e.g. Football"}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            {newName.trim() && (
              <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Slug: <span className="text-foreground">{slugify(newName)}</span>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-sm border border-border px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}