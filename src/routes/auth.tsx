import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";
import { asAuthError, authErrorMessage, signIn, signUp, useAuth } from "@/lib/auth";
import { validateInvite } from "@/lib/invites";

type Mode = "signin" | "signup";
type Step = "invite" | "credentials";

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
      { title: "Sign in — Maitri" },
      { name: "description", content: "Sign in or join Maitri with an invite." },
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
  const search = useSearch({ from: "/auth" });
  const mode: Mode = search.mode ?? "signin";
  const navigate = useNavigate();
  const { user, hydrated } = useAuth();

  const [step, setStep] = useState<Step>(mode === "signup" ? "invite" : "credentials");
  const [inviteCode, setInviteCode] = useState("");
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"verify" | "submit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (mode === "signin") {
      setStep("credentials");
      setVerifiedCode(null);
      setInviteCode("");
    } else {
      setStep(verifiedCode ? "credentials" : "invite");
    }
  }, [mode, verifiedCode]);

  useEffect(() => {
    setErr(null);
    setNotFound(false);
  }, [mode]);

  useEffect(() => {
    if (!hydrated || !user) return;
    void navigate({ to: safeRedirect(search.redirect) as "/", replace: true });
  }, [hydrated, user, navigate, search.redirect]);

  function finishAfterAuth() {
    void navigate({ to: safeRedirect(search.redirect) as "/", replace: true });
  }

  async function handleVerifyInvite(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setErr(t("auth.err.invite_required"));
      return;
    }
    setPending("verify");
    try {
      const ok = await validateInvite(code);
      if (!ok) {
        setErr(t("auth.err.invite_invalid"));
        return;
      }
      setVerifiedCode(code);
      setStep("credentials");
    } catch (e) {
      setErr(authErrorMessage(t, asAuthError(e).code));
    } finally {
      setPending(null);
    }
  }

  function changeInvite() {
    setVerifiedCode(null);
    setStep("invite");
    setErr(null);
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
    setPending("submit");
    try {
      if (mode === "signup") {
        if (!verifiedCode) {
          setErr(t("auth.err.invite_required"));
          setStep("invite");
          return;
        }
        await signUp({ email: em, password: pw, inviteCode: verifiedCode });
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
        setErr(authErrorMessage(t, err.code));
      }
    } finally {
      setPending(null);
    }
  }

  const otherMode: Mode = mode === "signin" ? "signup" : "signin";
  const showCredentials = mode === "signin" || step === "credentials";

  return (
    <div className="min-h-dvh bg-background flex flex-col pt-safe pb-safe">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">Maitri</span>
          </Link>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-[24px] font-semibold tracking-tight leading-tight text-foreground">
            {mode === "signin"
              ? t("auth.title_signin")
              : step === "invite"
                ? t("auth.invite_step_title")
                : t("auth.credentials_step_title_signup")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            {mode === "signin"
              ? t("auth.sub_signin_email")
              : step === "invite"
                ? t("auth.invite_step_sub")
                : t("auth.sub_signup_email")}
          </p>

          {mode === "signup" && step === "invite" && (
            <form onSubmit={handleVerifyInvite} className="mt-6 space-y-3">
              <label className="block">
                <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                  {t("auth.invite_label")}
                </span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder={t("auth.invite_placeholder")}
                  className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2.5 text-[15px] font-mono tracking-widest text-foreground outline-none focus:border-foreground/50"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>

              {err && <p className="text-[12px] text-red-600 dark:text-red-400">{err}</p>}

              <button
                type="submit"
                disabled={pending === "verify"}
                className="w-full inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {pending === "verify" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  t("auth.invite_verify")
                )}
              </button>
            </form>
          )}

          {showCredentials && (
            <>
              {mode === "signup" && verifiedCode && (
                <div className="mt-6 flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-mono tracking-wider">{verifiedCode}</span>
                  </span>
                  <button
                    type="button"
                    onClick={changeInvite}
                    className="text-[11.5px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
                  >
                    {t("auth.invite_change")}
                  </button>
                </div>
              )}

              <form onSubmit={handleCredentials} className="mt-6 space-y-3">
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
                    autoFocus={mode === "signin"}
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
            </>
          )}

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
