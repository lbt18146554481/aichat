import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";
import { asAuthError, authErrorMessage, signIn, signUp, startAppleOAuth, startGoogleOAuth, useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";
type OAuthProvider = "google" | "apple" | "wechat";

interface Search {
  mode?: Mode;
  redirect?: string;
}

export const Route = createFileRoute("/auth/")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    mode: raw.mode === "signup" ? "signup" : "signin",
    redirect: typeof raw.redirect === "string" ? raw.redirect : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — nightlong" },
      { name: "description", content: "Sign in or create a nightlong account." },
    ],
  }),
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/";
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  if (target === "/auth" || target.startsWith("/auth?") || target.startsWith("/auth/")) return "/";
  return target;
}

function AuthPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/auth/" });
  const mode: Mode = search.mode ?? "signin";
  const navigate = useNavigate();
  const { user, hydrated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [pending, setPending] = useState<"submit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setErr(null);
    setNotFound(false);
    setPasswordConfirm("");
  }, [mode]);

  useEffect(() => {
    if (!hydrated || !user) return;
    void navigate({ to: safeRedirect(search.redirect) as "/", replace: true });
  }, [hydrated, user, navigate, search.redirect]);

  function finishAfterAuth() {
    void navigate({ to: safeRedirect(search.redirect) as "/", replace: true });
  }

  async function handleOAuth(provider: OAuthProvider) {
    setErr(null);
    setNotFound(false);
    if (provider === "google") {
      setPending("submit");
      try {
        const url = await startGoogleOAuth(search.redirect);
        window.location.assign(url);
      } catch (e) {
        const err = asAuthError(e);
        setErr(authErrorMessage(t, err.code, err.message));
        setPending(null);
      }
      return;
    }
    if (provider === "apple") {
      setPending("submit");
      try {
        const url = await startAppleOAuth(search.redirect);
        window.location.assign(url);
      } catch (e) {
        const err = asAuthError(e);
        setErr(authErrorMessage(t, err.code, err.message));
        setPending(null);
      }
      return;
    }
    toast(t("auth.wechat_coming_soon"));
  }

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setNotFound(false);
    const em = email.trim();
    const pw = password;
    if (!em || !pw) {
      setErr(t("auth.err.credentials_required"));
      return;
    }
    if (pw.length < 6) {
      setErr(t("auth.err.password_short"));
      return;
    }
    if (mode === "signup") {
      if (!passwordConfirm) {
        setErr(t("auth.err.password_confirm_required"));
        return;
      }
      if (pw !== passwordConfirm) {
        setErr(t("auth.err.password_mismatch"));
        return;
      }
    }
    setPending("submit");
    try {
      if (mode === "signup") {
        await signUp({ email: em, password: pw });
        finishAfterAuth();
      } else {
        await signIn({ email: em, password: pw });
        finishAfterAuth();
      }
    } catch (e) {
      const err = asAuthError(e);
      if (err.code === "account_not_found") {
        setNotFound(true);
      } else {
        setErr(authErrorMessage(t, err.code, err.message));
      }
    } finally {
      setPending(null);
    }
  }

  const otherMode: Mode = mode === "signin" ? "signup" : "signin";

  return (
    <div className="min-h-dvh bg-background flex flex-col pt-safe pb-safe">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">nightlong</span>
          </Link>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-[24px] font-semibold tracking-tight leading-tight text-foreground">
            {mode === "signin" ? t("auth.title_signin") : t("auth.credentials_step_title_signup")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            {mode === "signin" ? t("auth.sub_signin_email") : t("auth.sub_signup_email")}
          </p>

          <div className="mt-6 space-y-2">
                <ProviderButton
                  provider="google"
                  label={t("auth.continue_google")}
                  onClick={() => void handleOAuth("google")}
                  disabled={pending !== null}
                  primary
                />
                <ProviderButton
                  provider="apple"
                  label={t("auth.continue_apple")}
                  onClick={() => void handleOAuth("apple")}
                  disabled={pending !== null}
                  soon
                />
                <ProviderButton
                  provider="wechat"
                  label={t("auth.continue_wechat")}
                  onClick={() => void handleOAuth("wechat")}
                  disabled={pending !== null}
                  soon
                />
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                    {t("auth.or_email")}
                  </span>
                </div>
              </div>

              <form onSubmit={handleCredentials} className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                    {t("auth.email_label")}
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-foreground/50"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                    {t("auth.password_label")}
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-foreground/50"
                  />
                </label>
                {mode === "signup" && (
                  <label className="block">
                    <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                      {t("auth.password_confirm_label")}
                    </span>
                    <input
                      type="password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-foreground/50"
                    />
                  </label>
                )}

                {notFound && (
                  <div className="rounded-md border border-border bg-secondary/40 px-3 py-2.5">
                    <p className="text-[12px] text-foreground">{t("auth.err.account_not_found")}</p>
                    <Link
                      to="/auth"
                      search={{ mode: "signup", redirect: search.redirect }}
                      className="mt-1.5 inline-block text-[12px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:opacity-80"
                    >
                      {t("auth.switch_to_signup_cta")} →
                    </Link>
                  </div>
                )}

                {err && !notFound && (
                  <p className="text-[12px] text-red-600 dark:text-red-400">{err}</p>
                )}

                <button
                  type="submit"
                  disabled={pending === "submit"}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {pending === "submit" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{mode === "signin" ? t("auth.sign_in") : t("auth.create_account")}</span>
                </button>
              </form>

          <div className="mt-8 text-center text-[12px] text-muted-foreground">
            {mode === "signin" ? t("auth.switch_to_signup_lead") : t("auth.switch_to_signin_lead")}{" "}
            <Link
              to="/auth"
              search={{ mode: otherMode, redirect: search.redirect }}
              className="text-foreground underline decoration-dotted underline-offset-2 hover:opacity-80"
            >
              {mode === "signin" ? t("auth.switch_to_signup_cta") : t("auth.switch_to_signin_cta")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function ProviderButton({
  provider,
  label,
  onClick,
  disabled,
  primary,
  soon,
}: {
  provider: OAuthProvider;
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
  soon?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
        soon ? "opacity-60" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <ProviderGlyph provider={provider} />
      <span>{label}</span>
      {soon && (
        <span className="ml-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
          {t("auth.coming_soon")}
        </span>
      )}
    </button>
  );
}

function ProviderGlyph({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 11v3.6h5.1c-.2 1.4-1.6 4.1-5.1 4.1-3.1 0-5.6-2.6-5.6-5.7S8.9 7.3 12 7.3c1.8 0 2.9.8 3.6 1.4l2.5-2.4C16.4 4.9 14.4 4 12 4 7.6 4 4 7.6 4 12s3.6 8 8 8c4.6 0 7.6-3.2 7.6-7.8 0-.5-.1-.9-.1-1.2H12z" />
      </svg>
    );
  }
  if (provider === "apple") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.7-1-2.7-3.1zM14 4.8c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 3C4.6 3 1 6 1 9.7c0 2.1 1.3 3.9 3.3 5.2l-.8 2.4 2.8-1.4c.9.2 1.7.3 2.6.3h.7c-.2-.6-.3-1.2-.3-1.9 0-3.4 3.2-6.2 7.2-6.2h.7C16.6 5 13.1 3 9 3zm-2.4 3.9c.6 0 1 .5 1 1.1 0 .6-.5 1-1 1s-1.1-.5-1.1-1c0-.6.5-1.1 1.1-1.1zm5 0c.6 0 1 .5 1 1.1 0 .6-.5 1-1 1s-1.1-.5-1.1-1c0-.6.5-1.1 1.1-1.1zM16.5 10c-3.6 0-6.5 2.4-6.5 5.4 0 3 2.9 5.4 6.5 5.4.7 0 1.5-.1 2.2-.3l2.3 1.2-.6-1.9C22.2 18.6 23 17.1 23 15.4c0-3-2.9-5.4-6.5-5.4zm-2.2 3.2c.4 0 .8.4.8.9 0 .4-.4.8-.8.8-.5 0-.9-.4-.9-.8 0-.5.4-.9.9-.9zm4.4 0c.4 0 .8.4.8.9 0 .4-.4.8-.8.8-.5 0-.9-.4-.9-.8 0-.5.4-.9.9-.9z" />
    </svg>
  );
}
