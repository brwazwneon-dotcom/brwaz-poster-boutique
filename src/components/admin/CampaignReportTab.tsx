import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AUDIENCE_KEYS, AUDIENCE_LABEL } from "@/lib/landing-pages";

type Row = { visits: number; unique_visitors: number };

export function CampaignReportTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-campaign-report"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_campaign_report" as never);
      if (error) throw error;
      return (data as Record<string, Row>) ?? {};
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-2xl">Audience Campaign Performance</h2>
        <p className="text-sm text-muted-foreground">
          آخر 90 يوم — الزيارات والعملاء الفريدون على كل Landing Page.
        </p>
      </div>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AUDIENCE_KEYS.map((k) => {
          const r = data?.[k];
          return (
            <div key={k} className="rounded-sm border border-border bg-background p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{AUDIENCE_LABEL[k].en}</div>
              <div className="mt-2 text-2xl font-semibold">{r?.visits ?? 0}</div>
              <div className="text-xs text-muted-foreground">Visits</div>
              <div className="mt-3 text-sm">{r?.unique_visitors ?? 0} <span className="text-xs text-muted-foreground">unique</span></div>
            </div>
          );
        })}
      </div>

      <div className="rounded-sm border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Meta Pixel events (LandingPageView, WhatsAppClick, ViewContent, Purchase) are enriched with
        <code className="mx-1">audience_type</code>, <code>landing_page</code>, and <code>utm_campaign</code>.
        Use Meta Events Manager to build custom audiences per campaign.
      </div>
    </div>
  );
}