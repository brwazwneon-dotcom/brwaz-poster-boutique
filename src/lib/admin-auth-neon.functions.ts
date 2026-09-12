import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import {
  findAdminByEmail,
  verifyPassword,
  hashPassword,
  createSessionToken,
  verifySessionToken,
  touchAdminLogin,
} from "@/lib/admin-auth-neon.server";
import { sql } from "@/lib/neon.server";

const SESSION_COOKIE = "brwaz_admin_session";

/**
 * One-time setup: only works while admin_users is empty, so it can never
 * be used to mint a rogue extra admin later. Lets the site owner pick
 * their own email/password on first visit instead of a password being
 * generated and relayed through chat.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { email?: unknown; password?: unknown };
    if (typeof d.email !== "string" || !d.email.includes("@")) throw new Error("Valid email required");
    if (typeof d.password !== "string" || d.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return { email: d.email, password: d.password };
  })
  .handler(async ({ data }) => {
    const existing = await sql()`select count(*)::int as n from admin_users`;
    if ((existing[0] as { n: number }).n > 0) {
      throw new Error("Admin already set up");
    }
    const hash = await hashPassword(data.password);
    await sql()`insert into admin_users (email, password_hash) values (${data.email.toLowerCase().trim()}, ${hash})`;
    return { ok: true as const };
  });

export const adminSetupNeeded = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await sql()`select count(*)::int as n from admin_users`;
  return { needed: (rows[0] as { n: number }).n === 0 };
});

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { email?: unknown; password?: unknown };
    if (typeof d.email !== "string" || typeof d.password !== "string") {
      throw new Error("Email and password are required");
    }
    return { email: d.email, password: d.password };
  })
  .handler(async ({ data }) => {
    const admin = await findAdminByEmail(data.email);
    if (!admin) return { ok: false as const, error: "Invalid email or password" };
    const valid = await verifyPassword(data.password, admin.password_hash);
    if (!valid) return { ok: false as const, error: "Invalid email or password" };

    const token = await createSessionToken(admin.id);
    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    await touchAdminLogin(admin.id);
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true as const };
});

export const adminSessionCheck = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  const session = await verifySessionToken(token);
  return { isAdmin: !!session };
});

/** Middleware for every other Neon-backed admin server function. */
export const requireAdminSessionNeon = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const token = getCookie(SESSION_COOKIE);
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Unauthorized");
  return next({ context: { adminId: session.id } });
});
