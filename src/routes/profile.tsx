import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { loadProfile, profileProgress } from "@/lib/profile";
import { LangSwitcher } from "@/components/lang-switcher";
import { ProfileForm } from "@/components/profile-form";
import { signOut } from "@/lib/auth";
import { useRequireAuth } from "@/lib/auth-guard";

interface ProfileSearch {
  welcome?: 1;
}

export const Route = createFileRoute("/profile")({
  validateSearch: (raw: Record<string, unknown>): ProfileSearch =>
    raw.welcome === 1 || raw.welcome === "1" ? { welcome: 1 } : {},
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Your profile — Compamore" },
      { name: "description", content: "Tell people nearby who you are and what you like doing together." },
    ],
  }),
});

function ProfilePage() {
  const { ready } = useRequireAuth();
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const search = useSearch({ from: "/profile" });
  const [progress, setProgress] = useState({ done: 0, total: 3 });
  const [hydrated, setHydrated] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [needCity, setNeedCity] = useState(false);

  const isWelcome = search.welcome === 1 && !returnTo;

  useEffect(() => {
    const loaded = loadProfile();
    setProgress(profileProgress(loaded));
    try {
      setReturnTo(window.sessionStorage.getItem("kindred:profile:return"));
      setNeedCity(window.sessionStorage.getItem("kindred:profile:focus") === "city");
    } catch {
      /* noop */
    }
    setHydrated(true);
    const onFocus = () => setProgress(profileProgress(loadProfile()));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Opening the profile from the corner should stay on this page.
  // A stored return path is only used by the back button.

  const handleProfileChange = useCallback((profile: ReturnType<typeof loadProfile>) => {
    setProgress(profileProgress(profile));
  }, []);

  function handleBack() {
    let back: string | null = null;
    try {
      back = window.sessionStorage.getItem("kindred:profile:return");
      window.sessionStorage.removeItem("kindred:profile:return");
      window.sessionStorage.removeItem("kindred:profile:focus");
    } catch {
      /* noop */
    }
    if (back && back.startsWith("/")) {
      window.location.assign(back);
      return;
    }
    void navigate({ to: "/" });
  }

  if (!ready || !hydrated) return <div className="min-h-screen bg-background" />;

  const isMatchmakerReturn = returnTo?.startsWith("/matchmaker");
  const isSideBySideReturn = returnTo?.startsWith("/side-by-side");
  const backLabel = isMatchmakerReturn
    ? t("hello.gate.back_to_matchmaker")
    : isSideBySideReturn
      ? t("hello.gate.back_to_sidebyside")
      : isWelcome
        ? t("profile.skip_for_now")
        : t("app.name");

  return (
    <div className="min-h-dvh bg-background pt-safe pb-tabbar">
      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className={returnTo || isWelcome ? "" : "font-mono uppercase tracking-wide"}>
              {backLabel}
            </span>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {t("profile.autosaved_status")}
            </span>
            <LangSwitcher />
          </div>
        </div>
      </header>

      {returnTo && (
        <div className="border-b border-border bg-secondary/40">
          <div className="max-w-3xl mx-auto px-5 py-2 text-[12px] text-muted-foreground">
            {needCity ? t("profile.gate.need_city") : t("hello.gate.return_hint")}
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-10">
        <div>
          <h1 className="text-[24px] font-serif italic leading-tight text-foreground">
            {t("profile.heading_setup")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed max-w-xl">
            {isWelcome ? t("profile.welcome_sub") : t("profile.subhead")}
          </p>
          <p className="mt-2 text-[11px] font-mono uppercase tracking-wide text-muted-foreground tabular-nums">
            {t("profile.progress", { done: progress.done, total: progress.total })}
          </p>
        </div>

        <ProfileForm lang={lang} onChange={handleProfileChange} />

        <button
          type="button"
          onClick={() => {
            void signOut().then(() => navigate({ to: "/" }));
          }}
          className="w-full rounded-xl border border-border py-3 text-[18px] text-foreground mb-8"
        >
          {t("auth.sign_out")}
        </button>
      </main>
    </div>
  );
}
