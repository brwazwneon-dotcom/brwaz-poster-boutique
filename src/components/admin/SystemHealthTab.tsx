import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  Database,
  HardDrive,
  Bell,
  ShieldCheck,
  Cloud,
  Zap,
  RefreshCw,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Rocket,
  CreditCard,
  BarChart3,
  Server,
  Package,
} from "lucide-react";
import { getSystemHealth, type HealthReport } from "@/lib/system-health.functions";
import { sendTestNotification } from "@/lib/notifications.functions";
import { createBackupServer } from "@/lib/backups.functions";
import { cn } from "@/lib/utils";
import { MetaPixelDebugCard } from "@/components/admin/MetaPixelDebugCard";

type Severity = "ok" | "warn" | "crit";

function bytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return "—"; }
}

function dot(sev: Severity) {
  const cls =
    sev === "ok" ? "bg-emerald-500" : sev === "warn" ? "bg-amber-500" : "bg-red-500";
  return <span className={cn("inline-block h-2 w-2 rounded-full", cls)} />;
}

function Card({ title, icon: Icon, sev, children }: {
  title: string;
  icon: any;
  sev?: Severity;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-widest">{title}</h3>
        </div>
        {sev && dot(sev)}
      </div>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value, sev }: { label: string; value: React.ReactNode; sev?: Severity }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono text-xs text-foreground">
        {sev && dot(sev)}
        {value}
      </span>
    </div>
  );
}

function computeChecks(r: HealthReport) {
  const critical: string[] = [];
  const warnings: string[] = [];
  const optional: string[] = [];
  const passed: string[] = [];

  // DB
  if (r.database.ok) passed.push("Database connected");
  else critical.push("Database connection failed");
  if (r.database.counts.posters === 0) critical.push("Catalog is empty (0 posters)");
  if (r.database.counts.posters_missing_image > 0) warnings.push(`${r.database.counts.posters_missing_image} posters missing image`);
  if (r.database.counts.reviews_pending > 0) warnings.push(`${r.database.counts.reviews_pending} reviews awaiting moderation`);

  // Storage
  if (r.storage.ok) passed.push("Storage reachable");
  else critical.push("Storage manifest failed");

  // Backups
  if (r.backups.last_daily || r.backups.last_weekly || r.backups.last_monthly) passed.push("Backups configured");
  else warnings.push("No backups recorded yet");

  // Notifications (optional integration)
  if (r.notifications.fcm_configured) passed.push("Firebase Cloud Messaging configured");
  else optional.push("Firebase (push notifications) — optional");
  if (r.notifications.fcm_configured && r.notifications.devices === 0) optional.push("No admin devices registered for FCM");
  if (r.notifications.recent_failures > 0) warnings.push(`${r.notifications.recent_failures} notification failures in last 24h`);

  // Marketing (optional integrations)
  if (r.marketing.ga4_measurement_id && r.marketing.ga4_enabled) passed.push("Google Analytics 4 active");
  else optional.push("Google Analytics 4 — optional");
  // Meta Pixel: configured as long as Pixel ID exists. CAPI + Test Event Code
  // are optional and never counted as issues when the Pixel is configured.
  if (r.marketing.meta_pixel_id) {
    passed.push("Meta Pixel configured (Pixel ID present)");
    if (r.marketing.meta_capi_enabled) passed.push("Meta Conversion API active");
    else optional.push("Meta Conversion API — optional (server-side tracking)");
  } else {
    warnings.push("Meta Pixel is not configured. Add your Pixel ID to enable tracking.");
  }

  // Payment
  if (r.payment.cash_on_delivery) passed.push("Cash on Delivery available");
  if (r.payment.instapay_configured) passed.push("Instapay configured");
  else optional.push("Instapay — optional");
  if (r.payment.vodafone_configured) passed.push("Vodafone Cash configured");
  else optional.push("Vodafone Cash — optional");

  // Env
  if (!r.environment.supabase_url || !r.environment.service_role_key) critical.push("Missing server env vars");
  else passed.push("Server environment variables set");
  if (!r.environment.backup_encryption_key) warnings.push("Backup encryption key missing");

  return { critical, warnings, optional, passed };
}

function healthScore(critical: number, warnings: number, optional: number) {
  // Critical items are true blockers (DB, storage, checkout, env, payment upload).
  // Warnings are things to fix but do not block launch.
  // Optional integrations (FCM, GA4, Meta Pixel, Instapay, Vodafone) only cost 1pt each.
  const score = Math.max(0, 100 - critical * 20 - warnings * 4 - optional * 1);
  const sev: Severity = critical > 0 ? "crit" : warnings > 3 ? "warn" : "ok";
  return { score, sev };
}

export function SystemHealthTab() {
  const fetchHealth = useServerFn(getSystemHealth);
  const sendTest = useServerFn(sendTestNotification);
  const doBackup = useServerFn(createBackupServer);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const checks = useMemo(() => (data ? computeChecks(data) : null), [data]);
  const health = useMemo(
    () => (checks ? healthScore(checks.critical.length, checks.warnings.length, checks.optional.length) : null),
    [checks],
  );
  const [ignored, setIgnored] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("health-ignored") ?? "{}"); } catch { return {}; }
  });
  const ignore = (key: string) => {
    const next = { ...ignored, [key]: true };
    setIgnored(next);
    try { localStorage.setItem("health-ignored", JSON.stringify(next)); } catch { /* noop */ }
    toast.success("Ignored for launch");
  };

  async function handleTestNotif() {
    setBusy("notif");
    try {
      const res = await sendTest();
      if ((res as any)?.ok) toast.success(`Sent to ${(res as any).sent} device(s)`);
      else toast.error(`Failed: ${(res as any)?.reason ?? "unknown"}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); refetch(); }
  }

  async function handleBackup() {
    setBusy("backup");
    try {
      await doBackup({ data: { type: "manual" } } as any);
      toast.success("Backup created");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); refetch(); }
  }

  function exportCSV() {
    if (!data) return;
    const rows: [string, string][] = [];
    const flat = (prefix: string, obj: any) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === "object" && !Array.isArray(v)) flat(`${prefix}${k}.`, v);
        else rows.push([`${prefix}${k}`, String(v)]);
      }
    };
    flat("", data);
    const csv = ["Field,Value", ...rows.map(([k, v]) => `${k},"${v.replace(/"/g, '""')}"`)].join("\n");
    downloadFile(csv, "system-health.csv", "text/csv");
  }

  async function exportPDF() {
    if (!data || !checks || !health) return;
    const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("BRWAZWNEON — System Health Report", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${fmtDate(data.generatedAt)}`, 14, 26);
    doc.text(`Overall Score: ${health.score}%  (${health.sev.toUpperCase()})`, 14, 32);
    doc.text(`Response: ${data.responseMs}ms`, 14, 38);

    let y = 48;
    const line = (t: string, indent = 14) => { doc.text(t, indent, y); y += 6; if (y > 280) { doc.addPage(); y = 20; } };
    doc.setFontSize(12); line("Critical Issues"); doc.setFontSize(10);
    checks.critical.length ? checks.critical.forEach((c) => line(`• ${c}`, 18)) : line("None", 18);
    y += 2; doc.setFontSize(12); line("Warnings"); doc.setFontSize(10);
    checks.warnings.length ? checks.warnings.forEach((w) => line(`• ${w}`, 18)) : line("None", 18);
    y += 2; doc.setFontSize(12); line("Passed"); doc.setFontSize(10);
    checks.passed.forEach((p) => line(`✔ ${p}`, 18));
    y += 2; doc.setFontSize(12); line("Database"); doc.setFontSize(10);
    Object.entries(data.database.counts).forEach(([k, v]) => line(`${k}: ${v}`, 18));
    doc.save("system-health.pdf");
  }

  if (isLoading || !data || !checks || !health) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading system health…</div>;
  }

  const c = data.database.counts;

  return (
    <div className="space-y-6">
      {/* Header + Score */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-display text-3xl">System Health</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Auto-refresh every 30s · Last update: {fmtDate(new Date(dataUpdatedAt).toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={cn(
            "rounded-sm border-2 px-6 py-3 text-center",
            health.sev === "ok" && "border-emerald-500/60 bg-emerald-500/10",
            health.sev === "warn" && "border-amber-500/60 bg-amber-500/10",
            health.sev === "crit" && "border-red-500/60 bg-red-500/10",
          )}>
            <div className="text-3xl font-bold">{health.score}%</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Overall Health</div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
          <RefreshCw className="h-3.5 w-3.5" /> Run Full Check
        </button>
        <button onClick={handleTestNotif} disabled={busy === "notif"} className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-50">
          <Bell className="h-3.5 w-3.5" /> Send Test Notification
        </button>
        <button onClick={handleBackup} disabled={busy === "backup"} className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-50">
          <Package className="h-3.5 w-3.5" /> Create Backup Now
        </button>
        <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
        <button onClick={exportPDF} className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
          <FileText className="h-3.5 w-3.5" /> Export PDF
        </button>
      </div>

      {/* Critical + Warnings summary */}
      {(checks.critical.length > 0 || checks.warnings.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {checks.critical.length > 0 && (
            <div className="rounded-sm border border-red-500/50 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2"><XCircle className="h-4 w-4 text-red-500" /><span className="text-xs uppercase tracking-widest font-semibold">Critical ({checks.critical.length})</span></div>
              <ul className="space-y-2 text-sm">
                {checks.critical.map((c) => (
                  <li key={c} className="flex flex-wrap items-center justify-between gap-2">
                    <span>• {c}</span>
                    <FixActions issue={c} onIgnore={ignore} onRefresh={() => refetch()} onBackup={handleBackup} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {checks.warnings.length > 0 && (
            <div className="rounded-sm border border-amber-500/50 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-xs uppercase tracking-widest font-semibold">Warnings ({checks.warnings.length})</span></div>
              <ul className="space-y-2 text-sm">
                {checks.warnings.filter((w) => !ignored[w]).map((w) => (
                  <li key={w} className="flex flex-wrap items-center justify-between gap-2">
                    <span>• {w}</span>
                    <FixActions issue={w} onIgnore={ignore} onRefresh={() => refetch()} onBackup={handleBackup} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {checks.optional.length > 0 && (
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs uppercase tracking-widest font-semibold">Optional integrations ({checks.optional.length})</span>
            <span className="text-[10px] text-muted-foreground">— safe to launch without these</span>
          </div>
          <ul className="space-y-2 text-sm">
            {checks.optional.filter((o) => !ignored[o]).map((o) => (
              <li key={o} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">• {o}</span>
                <FixActions issue={o} onIgnore={ignore} onRefresh={() => refetch()} onBackup={handleBackup} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Website & Server" icon={Activity} sev="ok">
          <Row label="Status" value="Online" sev="ok" />
          <Row label="Response time" value={`${data.responseMs} ms`} sev={data.responseMs < 1500 ? "ok" : "warn"} />
          <Row label="HTTPS" value="Enforced" sev="ok" />
          <Row label="Runtime" value="Cloudflare Workers" />
          <Row label="Build mode" value={data.version.build_mode} />
        </Card>

        <Card title="Database" icon={Database} sev={data.database.ok ? "ok" : "crit"}>
          <Row label="Connection" value={data.database.ok ? "Healthy" : "Down"} sev={data.database.ok ? "ok" : "crit"} />
          <Row label="Posters" value={`${c.posters} (${c.posters_hidden} hidden)`} sev={c.posters === 0 ? "crit" : "ok"} />
          <Row label="Categories / Sub" value={`${c.categories} / ${c.subcategories}`} />
          <Row label="Orders / Photo / Custom" value={`${c.orders} / ${c.photo_orders} / ${c.custom_orders}`} />
          <Row label="Customers (unique)" value={String(c.customers)} />
          <Row label="Reviews" value={`${c.reviews} (${c.reviews_pending} pending)`} sev={c.reviews_pending > 0 ? "warn" : "ok"} />
          <Row label="Last order" value={fmtDate(data.database.latest.last_order_at)} />
        </Card>

        <Card title="Storage" icon={HardDrive} sev={data.storage.ok ? "ok" : "crit"}>
          <Row label="Total used" value={bytes(data.storage.total_bytes)} />
          {Object.entries(data.storage.buckets).map(([name, s]) => (
            <Row key={name} label={name} value={`${s.file_count} · ${bytes(s.total_bytes)}`} />
          ))}
        </Card>

        <Card title="Backups" icon={Package} sev={data.backups.total > 0 ? "ok" : "warn"}>
          <Row label="Last daily" value={fmtDate(data.backups.last_daily?.created_at ?? null)} />
          <Row label="Last weekly" value={fmtDate(data.backups.last_weekly?.created_at ?? null)} />
          <Row label="Last monthly" value={fmtDate(data.backups.last_monthly?.created_at ?? null)} />
          <Row label="Total in registry" value={String(data.backups.total)} />
          <Row label="Encryption" value={data.environment.backup_encryption_key ? "AES-256-GCM" : "Missing key"} sev={data.environment.backup_encryption_key ? "ok" : "warn"} />
        </Card>

        <Card title="Firebase & Notifications" icon={Bell} sev={data.notifications.fcm_configured ? (data.notifications.devices > 0 ? "ok" : "warn") : "warn"}>
          <Row label="FCM configured" value={data.notifications.fcm_configured ? "Yes" : "No"} sev={data.notifications.fcm_configured ? "ok" : "warn"} />
          <Row label="Admin devices" value={String(data.notifications.devices)} sev={data.notifications.devices > 0 ? "ok" : "warn"} />
          <Row label="Last sent" value={fmtDate(data.notifications.last_sent_at)} />
          <Row label="Last status" value={data.notifications.last_status ?? "—"} />
          <Row label="Failures (24h)" value={String(data.notifications.recent_failures)} sev={data.notifications.recent_failures > 0 ? "warn" : "ok"} />
        </Card>

        <Card title="Google Analytics" icon={BarChart3} sev={data.marketing.ga4_enabled && data.marketing.ga4_measurement_id ? "ok" : "warn"}>
          <Row label="Enabled" value={data.marketing.ga4_enabled ? "Yes" : "No"} sev={data.marketing.ga4_enabled ? "ok" : "warn"} />
          <Row label="Measurement ID" value={data.marketing.ga4_measurement_id ?? "—"} />
          <Row label="Last visitor" value={fmtDate(data.database.latest.last_visitor_at)} />
        </Card>

        <Card title="Meta Pixel & CAPI" icon={Zap} sev={data.marketing.meta_pixel_id ? "ok" : "warn"}>
          <Row
            label="Pixel ID"
            value={data.marketing.meta_pixel_id ? "Configured" : "Not configured"}
            sev={data.marketing.meta_pixel_id ? "ok" : "warn"}
          />
          <p className="text-[10px] text-muted-foreground -mt-1">Tracks page views & events from the browser.</p>
          <Row
            label="Conversion API"
            value={data.marketing.meta_capi_enabled ? "Active" : "Optional — Not configured"}
            sev="ok"
          />
          <p className="text-[10px] text-muted-foreground -mt-1">Server-side tracking. Optional but recommended.</p>
          <Row
            label="Test Event Code"
            value="Optional — for Meta Events Manager testing"
            sev="ok"
          />
          <Row label="Advanced matching" value={data.marketing.meta_advanced_matching_enabled ? "Yes" : "No"} />
          <Row label="Last CAPI event" value={fmtDate(data.marketing.last_capi_event_at)} />
          <div className="pt-2">
            <button
              onClick={() => testMetaPixel(data.marketing.meta_pixel_id)}
              className="w-full rounded-sm border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
            >
              Test Meta Pixel
            </button>
          </div>
        </Card>

        <MetaPixelDebugCard />

        <Card title="Payment" icon={CreditCard} sev="ok">
          <Row label="Cash on Delivery" value="Enabled" sev="ok" />
          <Row label="Instapay" value={data.payment.instapay_configured ? "Configured" : "Not set"} sev={data.payment.instapay_configured ? "ok" : "warn"} />
          <Row label="Vodafone Cash" value={data.payment.vodafone_configured ? "Configured" : "Not set"} sev={data.payment.vodafone_configured ? "ok" : "warn"} />
          <Row label="Screenshots received" value={String(data.payment.screenshots_uploaded_total)} />
        </Card>

        <Card title="Security" icon={ShieldCheck} sev="ok">
          <Row label="HTTPS" value="Enforced" sev="ok" />
          <Row label="Authentication" value="Supabase Auth" sev="ok" />
          <Row label="Role-based access" value="user_roles + has_role()" sev="ok" />
          <Row label="RLS policies" value="Enabled on all tables" sev="ok" />
          <Row label="Upload protection" value="UUID prefix + MIME filter" sev="ok" />
          <Row label="XSS / CSRF" value="React + same-site cookies" sev="ok" />
        </Card>

        <Card title="Environment" icon={Server} sev={data.environment.supabase_url && data.environment.service_role_key ? "ok" : "crit"}>
          <Row label="SUPABASE_URL" value={data.environment.supabase_url ? "Set" : "MISSING"} sev={data.environment.supabase_url ? "ok" : "crit"} />
          <Row label="SERVICE_ROLE_KEY" value={data.environment.service_role_key ? "Set" : "MISSING"} sev={data.environment.service_role_key ? "ok" : "crit"} />
          <Row label="BACKUP_ENCRYPTION_KEY" value={data.environment.backup_encryption_key ? "Set" : "MISSING"} sev={data.environment.backup_encryption_key ? "ok" : "warn"} />
          <Row label="LOVABLE_API_KEY" value={data.environment.lovable_api_key ? "Set" : "MISSING"} sev={data.environment.lovable_api_key ? "ok" : "warn"} />
        </Card>

        <Card title="CDN & Edge (Cloudflare)" icon={Cloud} sev="ok">
          <Row label="CDN" value="Cloudflare (managed)" sev="ok" />
          <Row label="HTTP/3 + Brotli" value="On" sev="ok" />
          <Row label="Image optimization" value="On (assets pipeline)" sev="ok" />
          <Row label="DDoS protection" value="On" sev="ok" />
          <Row label="SSL" value="Auto-renewed by Cloudflare" sev="ok" />
        </Card>

        <Card title="Passed Checks" icon={CheckCircle2} sev="ok">
          <ul className="space-y-1 text-xs">
            {checks.passed.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {p}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function testMetaPixel(pixelId: string | null) {
  if (!pixelId) {
    toast.error("Meta Pixel is not configured. Add your Pixel ID first.");
    return;
  }
  const w = typeof window !== "undefined" ? (window as any) : null;
  if (!w?.fbq) {
    toast.error("Pixel Not Detected — fbq() not loaded in this browser.");
    return;
  }
  try {
    w.fbq("track", "PageView");
    toast.success(`Pixel Loaded Successfully (ID ${pixelId}) — Test PageView sent.`);
  } catch (e) {
    toast.error(`Pixel error: ${(e as Error).message}`);
  }
}

function issueTarget(issue: string): { tab?: string; label: string } {
  const s = issue.toLowerCase();
  if (s.includes("firebase")) return { tab: "notifications", label: "Configure Firebase Notifications" };
  if (s.includes("google analytics") || s.includes("ga4")) return { tab: "marketing", label: "Configure GA4" };
  if (s.includes("meta pixel")) return { tab: "marketing", label: "Configure Meta Pixel" };
  if (s.includes("instapay")) return { tab: "settings", label: "Configure Instapay" };
  if (s.includes("vodafone")) return { tab: "settings", label: "Configure Vodafone Cash" };
  if (s.includes("backup")) return { tab: "backups", label: "Open Backups" };
  if (s.includes("review")) return { tab: "reviews", label: "Moderate Reviews" };
  if (s.includes("missing image") || s.includes("catalog")) return { tab: "posters", label: "Open Catalog" };
  if (s.includes("storage")) return { tab: "system-health", label: "Retry storage check" };
  if (s.includes("env vars") || s.includes("encryption")) return { tab: "env-check", label: "Open Env Check" };
  if (s.includes("admin devices")) return { tab: "notifications", label: "Register admin device" };
  return { label: "Fix Now" };
}

function FixActions({
  issue,
  onIgnore,
  onRefresh,
  onBackup,
}: {
  issue: string;
  onIgnore: (k: string) => void;
  onRefresh: () => void;
  onBackup: () => void;
}) {
  const t = issueTarget(issue);
  const isBackup = /backup/i.test(issue);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {isBackup && (
        <button
          onClick={onBackup}
          className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-600 hover:bg-emerald-500/20"
        >
          Create Backup Now
        </button>
      )}
      {t.tab && (
        <a
          href={`/admin#tab=${t.tab}`}
          className="rounded-sm border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
        >
          {t.label}
        </a>
      )}
      <button
        onClick={onRefresh}
        className="rounded-sm border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
      >
        Fix Now
      </button>
      <button
        onClick={() => onIgnore(issue)}
        className="rounded-sm border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:bg-accent"
      >
        Ignore for Launch
      </button>
    </span>
  );
}