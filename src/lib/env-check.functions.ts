import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CheckSeverity = "ok" | "warn" | "crit";

export type EnvCheck = {
  id: string;
  category: string;
  name: string;
  severity: CheckSeverity;
  message: string;
  detail?: string;
};

export type EnvReport = {
  generatedAt: string;
  score: number;
  counts: { ok: number; warn: number; crit: number };
  serverEnv: {
    present: string[];
    missing: string[];
    leakedToClient: string[]; // server-only names accidentally exposed as VITE_
  };
  checks: EnvCheck[];
};

// Names that MUST live server-side only. If any appear as VITE_* on the client
// or are missing from the server, that is a critical issue.
const REQUIRED_SERVER_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
];

const OPTIONAL_SERVER_SECRETS = [
  "BACKUP_ENCRYPTION_KEY",
  "GA4_MEASUREMENT_ID",
  "GA4_API_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "LOVABLE_API_KEY",
];

// Substrings that indicate a value is secret and MUST NOT be VITE_ exposed.
const SECRET_MARKERS = [
  "SERVICE_ROLE",
  "SECRET",
  "PRIVATE_KEY",
  "ACCESS_TOKEN",
  "API_SECRET",
  "CLIENT_SECRET",
  "SB_SECRET",
  "SK_LIVE",
  "SK_TEST",
  "FIREBASE_PRIVATE",
  "GEMINI",
  "LOVABLE_API_KEY",
];

function isSecretName(name: string): boolean {
  const u = name.toUpperCase();
  return SECRET_MARKERS.some((m) => u.includes(m));
}

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getEnvSecurityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { clientEnvKeys: string[] }) => ({
      clientEnvKeys: Array.isArray(input?.clientEnvKeys)
        ? input.clientEnvKeys.map(String)
        : [],
    }),
  )
  .handler(async ({ data, context }): Promise<EnvReport> => {
    await requireAdmin(context as any);

    const checks: EnvCheck[] = [];
    const env = process.env;

    // Meta Pixel can be configured via env vars (any of several names) OR
    // via site_settings.meta_pixel_id. Look everywhere before deciding.
    const pixelEnvNames = [
      "META_PIXEL_ID",
      "VITE_META_PIXEL_ID",
      "NEXT_PUBLIC_META_PIXEL_ID",
      "PUBLIC_META_PIXEL_ID",
      "FB_PIXEL_ID",
    ];
    const pixelEnvName = pixelEnvNames.find((k) => !!env[k]);
    let pixelIdFromEnv = pixelEnvName ? String(env[pixelEnvName]) : "";
    let pixelIdFromDb = "";
    let capiTokenPresent = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: s }, { data: sec }] = await Promise.all([
        supabaseAdmin.from("site_settings").select("value").eq("key", "meta_pixel_id").maybeSingle(),
        supabaseAdmin.from("marketing_secrets").select("meta_capi_access_token").eq("id", 1).maybeSingle(),
      ]);
      pixelIdFromDb = String((s as any)?.value ?? "").trim();
      capiTokenPresent = Boolean((sec as any)?.meta_capi_access_token);
    } catch { /* best-effort */ }
    const anyPixelId = pixelIdFromEnv || pixelIdFromDb;
    const capiConfigured = capiTokenPresent || !!env.META_PIXEL_ACCESS_TOKEN;
    const testEventCodePresent = !!env.META_CAPI_TEST_EVENT_CODE;

    const present = REQUIRED_SERVER_SECRETS.filter((k) => !!env[k]);
    const missing = REQUIRED_SERVER_SECRETS.filter((k) => !env[k]);

    // 1) Required server secrets present
    for (const k of REQUIRED_SERVER_SECRETS) {
      checks.push({
        id: `srv:${k}`,
        category: "Server Secrets",
        name: k,
        severity: env[k] ? "ok" : "crit",
        message: env[k]
          ? "Configured server-side"
          : "Missing — feature depending on this will fail",
      });
    }

    // 2) Optional server secrets — warn if missing
    for (const k of OPTIONAL_SERVER_SECRETS) {
      checks.push({
        id: `opt:${k}`,
        category: "Optional Integrations",
        name: k,
        severity: env[k] ? "ok" : "warn",
        message: env[k] ? "Configured" : "Not configured (integration disabled)",
      });
    }

    // Meta Pixel — dedicated checks (never critical, never noisy)
    checks.push({
      id: "meta:pixel",
      category: "Meta Pixel",
      name: "Meta Pixel ID",
      severity: anyPixelId ? "ok" : "warn",
      message: anyPixelId
        ? `Configured${pixelIdFromDb && !pixelIdFromEnv ? " (site settings)" : pixelEnvName ? ` (${pixelEnvName})` : ""}`
        : "Meta Pixel is not configured. Add your Pixel ID to enable tracking.",
      detail: "Browser-side tracking for page views and events.",
    });
    checks.push({
      id: "meta:capi",
      category: "Meta Pixel",
      name: "Meta Conversion API",
      severity: capiConfigured ? "ok" : anyPixelId ? "ok" : "warn",
      message: capiConfigured
        ? "Access Token configured — server-side tracking active"
        : "Optional — Not Configured (server-side tracking disabled)",
      detail: "Server-side backup for Pixel events. Optional but recommended.",
    });
    checks.push({
      id: "meta:test",
      category: "Meta Pixel",
      name: "Meta Test Event Code",
      severity: "ok",
      message: testEventCodePresent
        ? "Configured — events routed to Test Events tab"
        : "Optional — Only needed while testing from Meta Events Manager",
    });

    // 3) VITE_* client-exposed keys — none of them may look like a secret
    const viteKeys = Object.keys(env).filter((k) => k.startsWith("VITE_"));
    const publicPixelNames = new Set([
      "VITE_META_PIXEL_ID",
      "NEXT_PUBLIC_META_PIXEL_ID",
      "PUBLIC_META_PIXEL_ID",
    ]);
    const leakedServerVite = viteKeys.filter((k) => {
      if (publicPixelNames.has(k)) return false; // Pixel ID is public by design
      const bare = k.replace(/^VITE_/, "");
      return (
        isSecretName(bare) ||
        REQUIRED_SERVER_SECRETS.includes(bare) ||
        OPTIONAL_SERVER_SECRETS.includes(bare)
      );
    });

    for (const k of leakedServerVite) {
      checks.push({
        id: `leak:${k}`,
        category: "Frontend Exposure",
        name: k,
        severity: "crit",
        message: "Server secret exposed to the browser via VITE_ prefix",
        detail: "Remove the VITE_ prefixed copy and keep only the server-side variable.",
      });
    }

    // 4) Report on VITE_ keys the browser reports (from client)
    const clientKeys = data.clientEnvKeys;
    const clientLeaks = clientKeys.filter((k) => {
      if (publicPixelNames.has(k)) return false;
      const bare = k.replace(/^VITE_/, "");
      return isSecretName(bare);
    });
    for (const k of clientLeaks) {
      checks.push({
        id: `client:${k}`,
        category: "Frontend Exposure",
        name: k,
        severity: "crit",
        message: "Client bundle contains a variable whose name marks it as secret",
        detail: "Delete this from .env / VITE config; move to a server function.",
      });
    }

    // 5) Publishable Supabase key sanity (must be JWT-shaped or sb_publishable_*)
    const pub = env.SUPABASE_PUBLISHABLE_KEY || "";
    if (pub) {
      const looksJwt = pub.split(".").length === 3;
      const looksPublishable = /^sb_publishable_/.test(pub);
      checks.push({
        id: "srv:pub_shape",
        category: "Server Secrets",
        name: "SUPABASE_PUBLISHABLE_KEY shape",
        severity: looksJwt || looksPublishable ? "ok" : "warn",
        message:
          looksJwt || looksPublishable
            ? "Publishable key format looks correct"
            : "Unexpected key format — verify it is the publishable/anon key",
      });
    }

    // 6) Service role key must NOT match publishable key
    if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_PUBLISHABLE_KEY) {
      const same = env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_PUBLISHABLE_KEY;
      checks.push({
        id: "srv:role_distinct",
        category: "Server Secrets",
        name: "Service role distinct from publishable",
        severity: same ? "crit" : "ok",
        message: same
          ? "Service role key equals publishable key — misconfiguration"
          : "Service role and publishable keys are distinct",
      });
    }

    // 7) Analytics / Pixel — client GA4/Pixel IDs are OK to be public;
    //    only their *secrets* (GA4_API_SECRET, META_PIXEL_ACCESS_TOKEN) are private.
    const ga4Client = clientKeys.find((k) => /GA(4)?_MEASUREMENT_ID|GA_ID/i.test(k));
    checks.push({
      id: "ga4:id",
      category: "Analytics",
      name: "GA4 Measurement ID",
      severity: ga4Client || env.GA4_MEASUREMENT_ID ? "ok" : "warn",
      message:
        ga4Client || env.GA4_MEASUREMENT_ID
          ? "Measurement ID available (safe to expose)"
          : "Not configured",
    });

    const pixelClient = clientKeys.find((k) => /META_PIXEL_ID|FB_PIXEL/i.test(k));
    checks.push({
      id: "meta:id",
      category: "Analytics",
      name: "Meta Pixel ID",
      severity: pixelClient || env.META_PIXEL_ID ? "ok" : "warn",
      message:
        pixelClient || env.META_PIXEL_ID
          ? "Pixel ID available (safe to expose)"
          : "Not configured",
    });

    // 8) Firebase — client web config (apiKey/appId) is public by design; only
    //    the Admin service account (FIREBASE_PRIVATE_KEY) must stay server-side.
    const fbAdminOk = !!env.FIREBASE_PRIVATE_KEY && !!env.FIREBASE_CLIENT_EMAIL;
    checks.push({
      id: "firebase:admin",
      category: "Firebase",
      name: "Firebase Admin credentials",
      severity: fbAdminOk ? "ok" : "warn",
      message: fbAdminOk
        ? "Admin SDK credentials present server-side"
        : "Admin SDK not configured (push notifications disabled)",
    });
    const fbAdminLeaked = clientKeys.some((k) =>
      /FIREBASE_PRIVATE_KEY|FIREBASE_CLIENT_EMAIL|FIREBASE_ADMIN/i.test(k),
    );
    checks.push({
      id: "firebase:admin_leak",
      category: "Firebase",
      name: "Firebase Admin not exposed",
      severity: fbAdminLeaked ? "crit" : "ok",
      message: fbAdminLeaked
        ? "Admin credential name detected in the browser bundle"
        : "Admin credentials are not exposed to the browser",
    });

    const counts = {
      ok: checks.filter((c) => c.severity === "ok").length,
      warn: checks.filter((c) => c.severity === "warn").length,
      crit: checks.filter((c) => c.severity === "crit").length,
    };
    const total = checks.length || 1;
    const score = Math.round(
      ((counts.ok + counts.warn * 0.5) / total) * 100 - counts.crit * 5,
    );

    return {
      generatedAt: new Date().toISOString(),
      score: Math.max(0, Math.min(100, score)),
      counts,
      serverEnv: {
        present,
        missing,
        leakedToClient: leakedServerVite,
      },
      checks,
    };
  });