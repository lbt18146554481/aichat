import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";
import {
  AuthError,
  signIn,
  signUp,
  useAuth,
  type AuthProvider,
} from "@/lib/auth";

type Mode = "signin" | "signup";

interface Search {
  mode?: Mode;
  redirect?: string;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    mode: raw.mode === "signup" ? "signup" : "signin",
    redirect: typeof raw.redirect === "string" ? raw.redirect : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Kindred" },
      { name: "description", content: "Sign in or join Kindred with an invite." },
    ],
  }),
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/";
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  return "/";
}

function AuthPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/auth" });
  const mode: Mode = search.mode ?? "signin";
  const navigate = useNavigate();
  const { user, hydrated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState<AuthProvider | "form" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // If already signed in, bounce to the intended target.
  if (hydrated && user) {
    void navigate({ to: safeRedirect(search.redirect) as "/", replace: true });
  }

  function finish() {
    const target = safeRedirect(search.redirect);
    // Land freshly-signed-up users on their profile.
    if (mode === "signup" && (!search.redirect || search.redirect === "/")) {
      void navigate({ to: "/profile", search: { welcome: 1 } as never, replace: true });
      return;
    }
    void navigate({ to: target as "/", replace: true });
  }

  async function handleProvider(provider: AuthProvider) {
    setErr(null);
    if (provider === "wechat") {
      toast(t("auth.wechat_coming_soon"));
      return;
    }
    if (mode === "signup" && !inviteCode.trim()) {
      setErr(t("auth.err.invite_required"));
      return;
    }
    setPending(provider);
    try {
      if (mode === "signup") {
        await signUp({ provider, inviteCode });
      } else {
        await signIn({ provider });
      }
      finish();
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !password.trim()) {
      setErr(t("auth.err.email_password_required"));
      return;
    }
    if (mode === "signup" && !inviteCode.trim()) {
      setErr(t("auth.err.invite_required"));
      return;
    }
    setPending("form");
    try {
      if (mode === "signup") {
        await signUp({ provider: "email", email, password, name, inviteCode });
      } else {
        await signIn({ provider: "email", email, password });
      }
      finish();
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const otherMode: Mode = mode === "signin" ? "signup" : "signin";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">Kindred</span>
          </Link>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-[24px] font-serif italic leading-tight text-foreground">
            {mode === "signin" ? t("auth.title_signin") : t("auth.title_signup")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            {mode === "signin" ? t("auth.sub_signin") : t("auth.sub_signup")}
          </p>

          {mode === "signup" && (
            <label className="mt-6 block">
              <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                {t("auth.invite_label")}
              </span>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder={t("auth.invite_placeholder")}
                className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] font-mono tracking-widest text-foreground outline-none focus:border-foreground/50"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t("auth.invite_hint")}
              </p>
            </label>
          )}

          <div className="mt-6 space-y-2">
            <ProviderButton
              provider="google"
              label={t("auth.continue_google")}
              onClick={() => handleProvider("google")}
              pending={pending === "google"}
              disabled={!!pending}
              primary
            />
            <ProviderButton
              provider="apple"
              label={t("auth.continue_apple")}
              onClick={() => handleProvider("apple")}
              pending={pending === "apple"}
              disabled={!!pending}
            />
            <ProviderButton
              provider="wechat"
              label={t("auth.continue_wechat")}
              onClick={() => handleProvider("wechat")}
              pending={false}
              disabled={!!pending}
              soon
            />
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              {t("auth.or")}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.name_placeholder")}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/50"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.email_placeholder")}
              autoComplete="email"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/50"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.password_placeholder")}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/50"
            />

            {err && (
              <p className="text-[12px] text-red-600 dark:text-red-400">{err}</p>
            )}

            <button
              type="submit"
              disabled={!!pending}
              className="w-full inline-flex items-center justify-center rounded-md bg-foreground text-background px-3 py-2 text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {pending === "form" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : mode === "signin" ? (
                t("auth.submit_signin")
              ) : (
                t("auth.submit_signup")
              )}
            </button>

            {mode === "signin" && (
              <div className="text-center">
                <Link
                  to="/reset-password"
                  className="text-[12px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
                >
                  {t("auth.forgot_password")}
                </Link>
              </div>
            )}
          </form>

          <div className="mt-6 text-center text-[12px] text-muted-foreground">
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
  pending,
  disabled,
  primary,
  soon,
}: {
  provider: AuthProvider;
  label: string;
  onClick: () => void;
  pending: boolean;
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
          ? "bg-foreground text-background hover:opacity-90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
        soon ? "opacity-60" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <ProviderGlyph provider={provider} />
      <span>{label}</span>
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {soon && (
        <span className="ml-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
          {t("auth.coming_soon")}
        </span>
      )}
    </button>
  );
}

function ProviderGlyph({ provider }: { provider: AuthProvider }) {
  // Minimal monochrome marks — no vendor colors, keeps the design cohesive.
  if (provider === "google") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 11v3.6h5.1c-.2 1.4-1.6 4.1-5.1 4.1-3.1 0-5.6-2.6-5.6-5.7S8.9 7.3 12 7.3c1.8 0 2.9.8 3.6 1.4l2.5-2.4C16.4 4.9 14.4 4 12 4 7.6 4 4 7.6 4 12s3.6 8 8 8c4.6 0 7.6-3.2 7.6-7.8 0-.5-.1-.9-.1-1.2H12z"/>
      </svg>
    );
  }
  if (provider === "apple") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.7-1-2.7-3.1zM14 4.8c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/>
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 3C4.6 3 1 6 1 9.7c0 2.1 1.3 3.9 3.3 5.2l-.8 2.4 2.8-1.4c.9.2 1.7.3 2.6.3h.7c-.2-.6-.3-1.2-.3-1.9 0-3.4 3.2-6.2 7.2-6.2h.7C16.6 5 13.1 3 9 3zm-2.4 3.9c.6 0 1 .5 1 1.1 0 .6-.5 1-1 1s-1.1-.5-1.1-1c0-.6.5-1.1 1.1-1.1zm5 0c.6 0 1 .5 1 1.1 0 .6-.5 1-1 1s-1.1-.5-1.1-1c0-.6.5-1.1 1.1-1.1zM16.5 10c-3.6 0-6.5 2.4-6.5 5.4 0 3 2.9 5.4 6.5 5.4.7 0 1.5-.1 2.2-.3l2.3 1.2-.6-1.9C22.2 18.6 23 17.1 23 15.4c0-3-2.9-5.4-6.5-5.4zm-2.2 3.2c.4 0 .8.4.8.9 0 .4-.4.8-.8.8-.5 0-.9-.4-.9-.8 0-.5.4-.9.9-.9zm4.4 0c.4 0 .8.4.8.9 0 .4-.4.8-.8.8-.5 0-.9-.4-.9-.8 0-.5.4-.9.9-.9z"/>
    </svg>
  );
}
