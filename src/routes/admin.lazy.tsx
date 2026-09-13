import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  adminLogin,
  adminSessionCheck,
  adminSetupNeeded,
  bootstrapAdmin,
} from "@/lib/admin-auth-neon.functions";
import { Dashboard } from "@/components/admin/tabs/Dashboard";

export const Route = createLazyFileRoute("/admin")({
  component: AdminPage,
});

// =========================================================
// BRWAZWNEON 2.0 admin — Phase 3 (Neon).
//
// Deliberately NOT a port of the old 56-tab admin.lazy.tsx: that file was
// built entirely against Supabase (auth, storage, 90+ tables) and would
// need a rewrite line-by-line regardless of how much of it was kept. This
// is a fresh, minimal admin covering what actually runs the business
// today — products, categories, orders, pricing — so the storefront can
// go live fast. Analytics, campaigns, reviews, and the rest of the old
// tabs are Phase 4, added incrementally once the core loop works.
//
// As of the Business OS Phase 1 module split, every tab (and the
// Dashboard tab-switching shell) lives under src/components/admin/tabs/ —
// this file is just the route entry and the pre-login auth screens.
// =========================================================

type Screen = "loading" | "setup" | "login" | "dashboard";

function AdminPage() {
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    (async () => {
      const setup = await adminSetupNeeded();
      if (setup.needed) {
        setScreen("setup");
        return;
      }
      const session = await adminSessionCheck();
      setScreen(session.isAdmin ? "dashboard" : "login");
    })();
  }, []);

  if (screen === "loading") {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (screen === "setup") {
    return <SetupScreen onDone={() => setScreen("login")} />;
  }
  if (screen === "login") {
    return <LoginScreen onDone={() => setScreen("dashboard")} />;
  }
  return <Dashboard onLogout={() => setScreen("login")} />;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-card p-8">
        <h1 className="text-display mb-6 text-2xl">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function SetupScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await bootstrapAdmin({ data: { email, password } });
      toast.success("Admin account created — now log in");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Set up admin access">
      <p className="mb-6 text-sm text-muted-foreground">
        First time here. Create the one admin account for this site.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-sm bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create admin account"}
        </button>
      </form>
    </AuthCard>
  );
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminLogin({ data: { email, password } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Admin sign in">
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-sm bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
