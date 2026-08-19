import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { POST_ORDER_MESSAGE_ENABLED_KEY, parsePostOrderMessageEnabled } from "@/lib/use-settings";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";

export function PostOrderSettingsTab() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-post-order-message"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", POST_ORDER_MESSAGE_ENABLED_KEY)
        .maybeSingle();
      if (error) throw error;
      return parsePostOrderMessageEnabled(data?.value);
    },
  });

  useEffect(() => {
    if (typeof data === "boolean") setEnabled(data);
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert(
        {
          key: POST_ORDER_MESSAGE_ENABLED_KEY,
          value: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast.success("Post-order message settings saved");
      qc.invalidateQueries({ queryKey: ["post-order-message-enabled"] });
      qc.invalidateQueries({ queryKey: ["admin-post-order-message"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-display text-2xl">إعدادات ما بعد إتمام الطلب</h2>
          <p className="text-sm text-muted-foreground">
            Post-order completion settings — controls the message the customer sees after a
            successful order.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="rounded-sm border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">إظهار رسالة ما بعد إتمام الطلب للعميل</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Show the post-order success message to the customer after order completion.
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-8 justify-center rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[10px] font-semibold text-emerald-600">
                  ON
                </span>
                الرسالة تظهر للعميل بعد إتمام الطلب · The message appears to the customer after the
                order
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex w-8 justify-center rounded-sm border border-muted-foreground/30 bg-muted/40 px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  OFF
                </span>
                الرسالة لا تظهر · The message is hidden — the customer still completes the order
                exactly as before
              </div>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Show post-order message"
          />
        </div>
      </div>
    </div>
  );
}
