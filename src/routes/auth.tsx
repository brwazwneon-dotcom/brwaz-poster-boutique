import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureBrandAdminRole } from "@/lib/admin-auth.functions";
import { trackEvent, setUserData } from "@/lib/meta-pixel";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Admin Login — BRWAZWNEON" }, { name: "robots", content: "noindex" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
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

  const syncLanguagePreference = async () => {
    try {
      const storedLang = localStorage.getItem("brw_preferred_lang");
      if (storedLang) {
        await supabase.auth.updateUser({ data: { preferred_language: storedLang } });
      }
    } catch {
      // Silently fail
    }
  };

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
        setUserData({ email });
        try {
          trackEvent("CompleteRegistration", { status: "signup" }, { email });
        } catch {
          /* noop */
        }
        toast.success(t("auth.accountCreated"));
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        try {
          await ensureAdmin();
        } catch (adminError) {
          console.warn("Admin role sync failed; continuing with existing role checks.", adminError);
        }
        await syncLanguagePreference();
        toast.success(t("auth.welcomeBack"));
        navigate({ to: "/admin" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.authFailed"));
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
          {t("common.staffOnly")}
        </div>
        <h1 className="text-display mt-2 text-3xl">
          {mode === "signin" ? t("auth.adminSignIn") : t("auth.createAdmin")}
        </h1>
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("auth.email")}
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("auth.password")}
            </span>
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
          {loading
            ? t("auth.pleaseWait")
            : mode === "signin"
              ? t("auth.signIn")
              : t("auth.createAccount")}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? t("auth.needAccount") : t("auth.haveAccount")}
        </button>
        <Link
          to="/"
          className="mt-6 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {t("auth.backToStore")}
        </Link>
      </form>
    </div>
  );
}
