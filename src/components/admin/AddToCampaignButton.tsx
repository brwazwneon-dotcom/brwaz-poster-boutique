import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AUDIENCE_KEYS,
  AUDIENCE_LABEL,
  usePosterAudiences,
  type AudienceKey,
} from "@/lib/landing-pages";
import { Megaphone, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Small popover-button shown on poster cards inside the admin.
 * Adds/removes the poster to any of the 5 landing pages.
 */
export function AddToCampaignButton({ posterId }: { posterId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: audiences = [] } = usePosterAudiences(posterId);

  async function toggle(k: AudienceKey) {
    setBusy(true);
    try {
      const { data: page, error: pErr } = await supabase
        .from("landing_pages")
        .select("id")
        .eq("audience_key", k)
        .maybeSingle();
      if (pErr || !page) throw pErr ?? new Error("Landing page not found");
      if (audiences.includes(k)) {
        await supabase
          .from("landing_page_posters")
          .delete()
          .eq("landing_page_id", page.id)
          .eq("poster_id", posterId);
        toast.success(`Removed from ${AUDIENCE_LABEL[k].en}`);
      } else {
        const { error } = await supabase.from("landing_page_posters").insert({
          landing_page_id: page.id,
          poster_id: posterId,
          sort_order: 9999,
        });
        if (error) throw error;
        toast.success(`Added to ${AUDIENCE_LABEL[k].en}`);
      }
      qc.invalidateQueries({ queryKey: ["poster-audiences", posterId] });
      qc.invalidateQueries({ queryKey: ["admin-landing-linked"] });
      qc.invalidateQueries({ queryKey: ["landing-bundle"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Add to Campaign"
        title="Add to Campaign"
      >
        <Megaphone className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close"
          />
          <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-sm border border-border bg-popover p-1 shadow-lg">
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Add to Campaign
            </div>
            {AUDIENCE_KEYS.map((k) => {
              const has = audiences.includes(k);
              return (
                <button
                  key={k}
                  disabled={busy}
                  onClick={() => toggle(k)}
                  className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <span>{AUDIENCE_LABEL[k].en}</span>
                  {has && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Small badge strip showing which landing pages contain this poster. */
export function CampaignBadges({ posterId }: { posterId: string }) {
  const { data: audiences = [] } = usePosterAudiences(posterId);
  if (audiences.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {audiences.map((k) => (
        <span
          key={k}
          className="rounded-sm bg-primary/20 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary"
        >
          In {AUDIENCE_LABEL[k].en} Ad
        </span>
      ))}
    </div>
  );
}
