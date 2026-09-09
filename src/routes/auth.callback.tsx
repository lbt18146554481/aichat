import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  asAuthError,
  authErrorMessage,
  completeGoogleOAuth,
  refreshUser,
  type AuthUser,
} from "@/lib/auth";

interface Search {
  code?: string;
  state?: string;
  error?: string;
}

/** Dedupe Strict Mode double-mount; Google codes are single-use. */
const oauthInflight = new Map<string, Promise<{ redirect: string; user: AuthUser }>>();

function completeGoogleOAuthOnce(code: string, state: string) {
  const existing = oauthInflight.get(code);
  if (existing) return existing;
  const promise = completeGoogleOAuth({ code, state }).finally(() => {
    window.setTimeout(() => oauthInflight.delete(code), 5000);
  });
  oauthInflight.set(code, promise);
  return promise;
}

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    code: typeof raw.code === "string" ? raw.code : undefined,
    state: typeof raw.state === "string" ? raw.state : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  }),
  component: AuthCallbackPage,
  head: () => ({
    meta: [{ title: "Signing in — Maitri" }],
  }),
});

function AuthCallbackPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/auth/callback" });
  const navigate = useNavigate();
  // Stable SSR/client initial text — avoid i18n hydration mismatch.
  const [message, setMessage] = useState("…");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMessage(t("auth.oauth_working"));
    setReady(true);
  }, [t]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      if (search.error) {
        if (!cancelled) {
          setMessage(authErrorMessage(t, "oauth_denied", t("auth.err.oauth_denied")));
        }
        window.setTimeout(() => {
          void navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }, 1600);
        return;
      }
      if (!search.code || !search.state) {
        if (!cancelled) {
          setMessage(authErrorMessage(t, "oauth_failed", t("auth.err.oauth_failed")));
        }
        window.setTimeout(() => {
          void navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }, 1600);
        return;
      }

      try {
        const result = await completeGoogleOAuthOnce(search.code, search.state);
        if (cancelled) return;
        await refreshUser();
        if (cancelled) return;
        void navigate({ to: (result.redirect || "/") as "/", replace: true });
      } catch (e) {
        if (cancelled) return;
        const err = asAuthError(e);
        console.error("[google oauth callback]", err.code, err.message);
        setMessage(authErrorMessage(t, err.code, err.message));
        window.setTimeout(() => {
          void navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }, 3500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, ready, search.code, search.error, search.state, t]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin opacity-70" aria-hidden />
      <p className="text-sm text-muted-foreground max-w-md break-words" suppressHydrationWarning>
        {message}
      </p>
    </main>
  );
}
