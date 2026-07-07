import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { descendantIds, type Category } from "@/lib/use-categories";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  /** Full category list — used to detect sub-categories and to build move options. */
  allCategories: Category[];
  /** Called after successful delete/move. */
  onDeleted: (deletedId: string) => void;
};

export function CategoryDeleteDialog({
  open,
  onOpenChange,
  category,
  allCategories,
  onDeleted,
}: Props) {
  const qc = useQueryClient();
  const [postersCount, setPostersCount] = useState<number | null>(null);
  const [subCount, setSubCount] = useState<number>(0);
  const [moveTo, setMoveTo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSub = !!category?.parent_id;

  const moveOptions = useMemo(() => {
    if (!category) return [] as Category[];
    if (isSub) {
      return allCategories.filter(
        (c) => c.parent_id === category.parent_id && c.id !== category.id,
      );
    }
    return allCategories.filter((c) => !c.parent_id && c.id !== category.id);
  }, [allCategories, category, isSub]);

  useEffect(() => {
    if (!open || !category) return;
    setMoveTo("");
    setPostersCount(null);
    setSubCount(0);
    setLoading(true);
    (async () => {
      try {
        const targetIds = isSub ? [category.id] : descendantIds(allCategories, category.id);
        const { count, error } = await supabase
          .from("posters")
          .select("id", { count: "exact", head: true })
          .in("category_id", targetIds);
        if (error) throw error;
        setPostersCount(count ?? 0);
        setSubCount(isSub ? 0 : targetIds.length - 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to check category usage");
        setPostersCount(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, category, allCategories, isSub]);

  if (!category) return null;

  const hasProducts = (postersCount ?? 0) > 0;
  const hasSubs = subCount > 0;

  const doDelete = async () => {
    setBusy(true);
    try {
      if (hasProducts) {
        if (!moveTo) {
          toast.error("Choose a category to move products to");
          setBusy(false);
          return;
        }
        const targetIds = isSub ? [category.id] : descendantIds(allCategories, category.id);
        const { error: moveErr } = await supabase
          .from("posters")
          .update({ category_id: moveTo })
          .in("category_id", targetIds);
        if (moveErr) throw moveErr;
      }
      // Delete descendants first for main categories to satisfy FK.
      if (!isSub && hasSubs) {
        const subs = allCategories.filter((c) => c.parent_id === category.id).map((c) => c.id);
        if (subs.length) {
          const { error: subErr } = await supabase.from("categories").delete().in("id", subs);
          if (subErr) throw subErr;
        }
      }
      const { error } = await supabase.from("categories").delete().eq("id", category.id);
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["categories"] });
      await qc.invalidateQueries({ queryKey: ["admin-posters"] });
      toast.success("Category deleted");
      onDeleted(category.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Delete “{category.name}”?
          </DialogTitle>
          <DialogDescription>
            {loading ? "Checking category usage…" : hasProducts
              ? `${postersCount} product${postersCount === 1 ? "" : "s"} ${hasSubs ? `and ${subCount} sub-categor${subCount === 1 ? "y" : "ies"} ` : ""}use this category. Move them somewhere first.`
              : hasSubs
                ? `This will also delete ${subCount} empty sub-categor${subCount === 1 ? "y" : "ies"}. This cannot be undone.`
                : "This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {!loading && hasProducts && (
          <div className="space-y-1.5 py-2">
            <Label htmlFor="move-target">Move products to</Label>
            <select
              id="move-target"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="">— Select category —</option>
              {moveOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {moveOptions.length === 0 && (
              <p className="text-[11px] text-destructive">
                No sibling category available. Create one first or reassign products manually.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={doDelete}
            disabled={busy || loading || (hasProducts && (!moveTo || moveOptions.length === 0))}
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}