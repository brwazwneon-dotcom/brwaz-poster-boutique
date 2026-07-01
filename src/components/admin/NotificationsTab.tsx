import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendTestNotification } from "@/lib/notifications.functions";
import {
  FIREBASE_CONFIG_KEY,
  DEFAULT_FIREBASE_CONFIG,
  type FirebasePublicConfig,
} from "@/lib/firebase-config";

type AdminDevice = {
  id: string;
  label: string | null;
  user_agent: string | null;
  fcm_token: string;
  last_seen_at: string;
  created_at: string;
};

type NotificationLog = {
  id: string;
  title: string | null;
  body: string | null;
  sent_count: number;
  failed_count: number;
  status: string | null;
  error: string | null;
  created_at: string;
};

export function NotificationsTab() {
  const qc = useQueryClient();
  const testFn = useServerFn(sendTestNotification);
  const [cfg, setCfg] = useState<FirebasePublicConfig>(DEFAULT_FIREBASE_CONFIG);
  const [serviceAccount, setServiceAccount] = useState<string>("");
  const [savingCfg, setSavingCfg] = useState(false);
  const [savingSA, setSavingSA] = useState(false);
  const [registering, setRegistering] = useState(false);

  const { data: loadedCfg } = useQuery({
    queryKey: ["admin-firebase-config"],
    queryFn: async (): Promise<FirebasePublicConfig> => {
      const { data } = await supabase
        .from("site_settings").select("value").eq("key", FIREBASE_CONFIG_KEY).maybeSingle();
      return { ...DEFAULT_FIREBASE_CONFIG, ...((data?.value as object) ?? {}) };
    },
  });
  useEffect(() => { if (loadedCfg) setCfg(loadedCfg); }, [loadedCfg]);

  const { data: saStatus } = useQuery({
    queryKey: ["admin-firebase-sa"],
    queryFn: async () => {
      const { data } = await supabase.from("marketing_secrets")
        .select("firebase_service_account").eq("id", 1).maybeSingle();
      const sa = (data?.firebase_service_account ?? null) as
        | { client_email?: string; project_id?: string } | null;
      return sa ? { present: true, email: sa.client_email ?? "", project: sa.project_id ?? "" } : { present: false };
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["admin-devices"],
    queryFn: async (): Promise<AdminDevice[]> => {
      const { data } = await supabase.from("admin_devices")
        .select("id, label, user_agent, fcm_token, last_seen_at, created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as AdminDevice[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-notification-logs"],
    queryFn: async (): Promise<NotificationLog[]> => {
      const { data } = await supabase.from("notification_logs")
        .select("id, title, body, sent_count, failed_count, status, error, created_at")
        .order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as NotificationLog[];
    },
  });

  const saveCfg = async () => {
    setSavingCfg(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: FIREBASE_CONFIG_KEY,
        value: cfg as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Firebase settings saved");
      qc.invalidateQueries({ queryKey: ["admin-firebase-config"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSavingCfg(false); }
  };

  const saveServiceAccount = async () => {
    setSavingSA(true);
    try {
      let parsed: object;
      try { parsed = JSON.parse(serviceAccount); }
      catch { throw new Error("Service account must be valid JSON"); }
      const p = parsed as { client_email?: string; private_key?: string; project_id?: string };
      if (!p.client_email || !p.private_key || !p.project_id) {
        throw new Error("JSON must include client_email, private_key, project_id");
      }
      const { error } = await supabase.from("marketing_secrets").upsert({
        id: 1,
        firebase_service_account: parsed as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setServiceAccount("");
      toast.success("Service account saved");
      qc.invalidateQueries({ queryKey: ["admin-firebase-sa"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSavingSA(false); }
  };

  const enableOnThisDevice = async () => {
    setRegistering(true);
    try {
      const { requestAndRegisterAdminDevice } = await import("@/lib/firebase-messaging");
      await requestAndRegisterAdminDevice();
      toast.success("This device is now registered for push notifications");
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable notifications");
    } finally { setRegistering(false); }
  };

  const removeDevice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Device removed");
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const sendTest = async () => {
    try {
      const res = await testFn({ data: undefined as never });
      if (res.ok) toast.success(`Test sent — ${res.sent} delivered, ${res.failed} failed`);
      else toast.error(`Not sent: ${res.reason}`);
      qc.invalidateQueries({ queryKey: ["admin-notification-logs"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const field = (label: string, key: keyof FirebasePublicConfig, placeholder?: string) => (
    <label className="block text-xs">
      <span className="text-white/60">{label}</span>
      <input
        className="mt-1 w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-white text-sm"
        value={String(cfg[key] ?? "")}
        onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );

  return (
    <div className="space-y-8 text-white">
      <div className="rounded border border-white/10 bg-black/30 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold">Notifications Settings</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cfg.enabled}
              onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} />
            Enable Push Notifications
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field("Firebase API Key", "apiKey")}
          {field("Firebase Auth Domain", "authDomain", "your-project.firebaseapp.com")}
          {field("Firebase Project ID", "projectId")}
          {field("Firebase Storage Bucket", "storageBucket", "your-project.appspot.com")}
          {field("Firebase Messaging Sender ID", "messagingSenderId")}
          {field("Firebase App ID", "appId")}
          <div className="md:col-span-2">{field("Firebase VAPID Key (Web Push certificate)", "vapidKey")}</div>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={saveCfg} disabled={savingCfg}
            className="rounded bg-white text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">
            {savingCfg ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/30 p-5">
        <h2 className="text-lg font-semibold mb-2">Firebase Service Account (server-side)</h2>
        <p className="text-xs text-white/60 mb-3">
          Paste the full <code>service-account.json</code> from Firebase Console → Project Settings → Service Accounts.
          Stored privately — only used server-side to send notifications.
          {saStatus?.present ? (
            <span className="ml-1 text-emerald-400">
              Configured: {saStatus.email} ({saStatus.project})
            </span>
          ) : <span className="ml-1 text-amber-400">Not configured</span>}
        </p>
        <textarea rows={5}
          className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-white text-xs font-mono"
          value={serviceAccount}
          onChange={(e) => setServiceAccount(e.target.value)}
          placeholder='{"type":"service_account","project_id":"…","client_email":"…","private_key":"-----BEGIN PRIVATE KEY-----\n…"}'
        />
        <div className="mt-3 flex justify-end">
          <button onClick={saveServiceAccount} disabled={savingSA || !serviceAccount.trim()}
            className="rounded bg-white text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">
            {savingSA ? "Saving…" : "Save Service Account"}
          </button>
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/30 p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold">This Device</h2>
          <div className="flex gap-2">
            <button onClick={enableOnThisDevice} disabled={registering}
              className="rounded bg-emerald-500 text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">
              {registering ? "Enabling…" : "Enable Mobile Notifications"}
            </button>
            <button onClick={sendTest}
              className="rounded border border-white/30 text-white text-sm font-semibold px-4 py-2">
              Send Test Notification
            </button>
          </div>
        </div>
        <p className="text-xs text-white/60">
          Open this admin dashboard on your phone, then tap <b>Enable Mobile Notifications</b> to
          receive an instant alert every time a new order is placed.
        </p>
      </div>

      <div className="rounded border border-white/10 bg-black/30 p-5">
        <h2 className="text-lg font-semibold mb-3">Registered Devices ({devices.length})</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-white/60">No devices registered yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {devices.map((d) => (
              <li key={d.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.label ?? "Device"}</div>
                  <div className="text-xs text-white/50 truncate">{d.user_agent ?? ""}</div>
                  <div className="text-xs text-white/40">
                    Last seen: {new Date(d.last_seen_at).toLocaleString()}
                  </div>
                </div>
                <button onClick={() => removeDevice.mutate(d.id)}
                  className="text-xs text-red-400 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border border-white/10 bg-black/30 p-5">
        <h2 className="text-lg font-semibold mb-3">Recent Notifications</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-white/60">No notifications sent yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {logs.map((l) => (
              <li key={l.id} className="py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <div className="font-medium">{l.title ?? "(no title)"}</div>
                  <div className={`text-xs ${l.status === "sent" ? "text-emerald-400" : "text-red-400"}`}>
                    {l.status ?? ""} · {l.sent_count} sent / {l.failed_count} failed
                  </div>
                </div>
                {l.body && <div className="text-xs text-white/60 whitespace-pre-line mt-1">{l.body}</div>}
                {l.error && <div className="text-xs text-red-300 mt-1 truncate">{l.error}</div>}
                <div className="text-xs text-white/40 mt-1">{new Date(l.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}