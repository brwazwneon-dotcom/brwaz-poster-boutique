import { useState } from "react";
import { Copy, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getAnalyticsReport, getAnalyticsReportNarrative } from "@/lib/analytics-center.functions";
import type { ReportNarrative, ReportPeriodKind } from "@/lib/analytics-center.types";
import { ErrorState, Notice, SectionTitle, periodLabel, previousLabel, useAsync } from "./ui";

const KINDS: Array<{ id: ReportPeriodKind; label: string; help: string }> = [
  { id: "daily", label: "Daily", help: "one day (default: yesterday)" },
  { id: "weekly", label: "Weekly", help: "7 days ending on the chosen day" },
  { id: "monthly", label: "Monthly", help: "the calendar month containing the chosen day" },
];

export function ReportsSection() {
  const [kind, setKind] = useState<ReportPeriodKind>("daily");
  const [date, setDate] = useState("");
  const [narrative, setNarrative] = useState<ReportNarrative | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => getAnalyticsReport({ data: { kind, date: date || undefined } }),
    [kind, date],
  );

  const change = (fn: () => void) => {
    fn();
    setNarrative(null);
    setAiError(null);
  };

  const askAi = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      setNarrative(await getAnalyticsReportNarrative({ data: { kind, date: date || undefined } }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "The AI summary is unavailable right now.");
    } finally {
      setAiBusy(false);
    }
  };

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.text);
      toast.success("Report copied");
    } catch {
      toast.error("Could not copy — select the text and copy manually");
    }
  };

  const download = () => {
    if (!data) return;
    const blob = new Blob([data.text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `brwazwneon-${kind}-report-${data.period.start.slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => change(() => setKind(k.id))}
              title={k.help}
              className={`rounded-sm border px-3 py-1.5 text-xs ${kind === k.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Day (optional)</span>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => change(() => setDate(e.target.value))}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {KINDS.find((k) => k.id === kind)?.help}. Reports use complete Cairo days only.
        </p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingTiles count={4} />
      ) : (
        <div className={loading ? "opacity-70 transition" : "transition"}>
          <SectionTitle
            aside={
              <div className="flex gap-1">
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
                <button
                  onClick={download}
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent"
                >
                  <Download className="h-3 w-3" /> .txt
                </button>
              </div>
            }
          >
            Measured report — {periodLabel(data.period)} (vs {previousLabel(data.period)})
          </SectionTitle>
          <pre
            className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-card p-4 text-xs leading-relaxed"
            dir="ltr"
          >
            {data.text}
          </pre>

          <SectionTitle
            aside={
              <button
                onClick={askAi}
                disabled={aiBusy}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />{" "}
                {aiBusy ? "Writing…" : narrative ? "Regenerate" : "Write AI summary"}
              </button>
            }
          >
            AI interpretation
          </SectionTitle>
          <Notice>
            Optional. The AI only re-words the measured report above; it is told not to add,
            estimate or calculate numbers, and any figure it uses that is not in the report is
            flagged. It is an interpretation, not measured data.
          </Notice>
          {aiError && (
            <div className="mt-2">
              <ErrorState title="Couldn't write the AI summary" message={aiError} onRetry={askAi} />
            </div>
          )}
          {narrative && (
            <div className="mt-2 rounded-sm border border-border p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                AI interpretation · {narrative.provider} · generated from the numbers above
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
                {narrative.text}
              </p>
              {narrative.unverifiedNumbers.length > 0 && (
                <p className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  Check before using: these figures in the AI text are not in the measured report —{" "}
                  <strong>{narrative.unverifiedNumbers.join(", ")}</strong>.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ReportsSection;
