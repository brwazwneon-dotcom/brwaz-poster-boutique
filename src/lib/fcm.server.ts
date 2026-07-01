// FCM HTTP v1 sender. Server-only. Uses service account JSON stored in marketing_secrets.
// Signs a Google OAuth JWT with Web Crypto (RS256) — no Node-only deps.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function b64url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function mintAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export type FcmMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  clickUrl?: string;
};

export async function sendFcmToTokens(
  sa: ServiceAccount,
  tokens: string[],
  message: FcmMessage,
): Promise<{ sent: number; failed: number; invalidTokens: string[]; errors: string[] }> {
  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [], errors: [] };
  const accessToken = await mintAccessToken(sa);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
            webpush: {
              fcm_options: { link: message.clickUrl ?? "/admin?tab=orders" },
              notification: { icon: "/favicon.ico", badge: "/favicon.ico" },
            },
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        const invalid = res.status === 404 || res.status === 400 ||
          text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT");
        throw { token, status: res.status, text, invalid };
      }
      return token;
    }),
  );

  const invalidTokens: string[] = [];
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") sent++;
    else {
      failed++;
      const reason = r.reason as { token?: string; text?: string; invalid?: boolean };
      if (reason?.invalid && reason.token) invalidTokens.push(reason.token);
      if (reason?.text) errors.push(reason.text.slice(0, 300));
    }
  }
  return { sent, failed, invalidTokens, errors };
}