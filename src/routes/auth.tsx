import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureBrandAdminRole } from "@/lib/admin-auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Login — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const ensureAdmin = useServerFn(ensureBrandAdminRole);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await ensureAdmin();
        toast.success("Welcome back");
        navigate({ to: "/admin" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-sm border border-border bg-card p-8"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Staff only
        </div>
        <h1 className="text-display mt-2 text-3xl">
          {mode === "signin" ? "Admin sign in" : "Create admin"}
        </h1>
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        <Link to="/" className="mt-6 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Back to store
        </Link>
      </form>
    </div>
  );
}