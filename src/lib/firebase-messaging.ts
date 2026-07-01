// Admin-only lazy Firebase Messaging client. Never imported by public routes.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from "firebase/messaging";
import { loadFirebaseConfig, isConfigComplete, type FirebasePublicConfig } from "./firebase-config";
import { supabase } from "@/integrations/supabase/client";

let cachedApp: FirebaseApp | null = null;
let cachedMessaging: Messaging | null = null;
let cachedConfig: FirebasePublicConfig | null = null;

async function ensureMessaging(): Promise<{ messaging: Messaging; config: FirebasePublicConfig }> {
  if (typeof window === "undefined") throw new Error("Messaging is browser-only");
  const supported = await isSupported();
  if (!supported) throw new Error("Push notifications are not supported in this browser");

  const config = cachedConfig ?? (await loadFirebaseConfig());
  cachedConfig = config;
  if (!isConfigComplete(config)) throw new Error("Firebase notifications are not configured");

  if (!cachedApp) {
    cachedApp = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        });
  }

  // Register the FCM service worker at project root scope.
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?v=${encodeURIComponent(config.messagingSenderId)}`,
    { scope: "/" },
  );
  // Hand config to the SW so it can init itself for background messages.
  registration.active?.postMessage({ type: "FIREBASE_CONFIG", config });
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: "FIREBASE_CONFIG", config });
  });

  if (!cachedMessaging) cachedMessaging = getMessaging(cachedApp);
  return { messaging: cachedMessaging, config };
}

export async function requestAndRegisterAdminDevice(label?: string): Promise<{ token: string }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission denied");

  const { messaging, config } = await ensureMessaging();
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Failed to obtain FCM token");

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You must be signed in as admin");

  const { error } = await supabase.from("admin_devices").upsert(
    {
      user_id: userId,
      fcm_token: token,
      label: label ?? navigator.platform ?? "Device",
      user_agent: navigator.userAgent.slice(0, 400),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token" },
  );
  if (error) throw error;

  // Foreground handler — show a native notification while dashboard is open.
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? payload.data?.title ?? "New Order";
    const body = payload.notification?.body ?? payload.data?.body ?? "";
    try {
      new Notification(title, { body, icon: "/favicon.ico", data: payload.data });
    } catch { /* ignore */ }
  });

  return { token };
}