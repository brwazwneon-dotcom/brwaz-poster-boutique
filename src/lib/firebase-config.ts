// Public Firebase client config (safe to expose — publishable keys).
// Loaded lazily from site_settings so admin can rotate without code changes.
import { supabase } from "@/integrations/supabase/client";

export type FirebasePublicConfig = {
  enabled: boolean;
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

export const FIREBASE_CONFIG_KEY = "firebase_config";

export const DEFAULT_FIREBASE_CONFIG: FirebasePublicConfig = {
  enabled: false,
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  vapidKey: "",
};

export async function loadFirebaseConfig(): Promise<FirebasePublicConfig> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", FIREBASE_CONFIG_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<FirebasePublicConfig>;
  return { ...DEFAULT_FIREBASE_CONFIG, ...v };
}

export function isConfigComplete(c: FirebasePublicConfig): boolean {
  return Boolean(
    c.enabled &&
      c.apiKey &&
      c.authDomain &&
      c.projectId &&
      c.messagingSenderId &&
      c.appId &&
      c.vapidKey,
  );
}