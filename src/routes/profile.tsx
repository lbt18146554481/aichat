import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { loadProfile, profileProgress } from "@/lib/profile";
import { LangSwitcher } from "@/components/lang-switcher";
import { ProfileForm } from "@/components/profile-form";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Your profile — Kindred" },
      { name: "description", content: "Edit how you appear to people Kindred introduces you to." },
    ],
  }),
});

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const [progress, setProgress] = useState({ done: 0, total: 3 });
  const [hydrated, setHydrated] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [needCity, setNeedCity] = useState(false);

  useEffect(() => {
    setProgress(profileProgress(loadProfile()));
    try {
      setReturnTo(window.sessionStorage.getItem("kindred:profile:return"));
      setNeedCity(window.sessionStorage.getItem("kindred:profile:focus") === "city");
    } catch { /* noop */ }
    setHydrated(true);
    const onFocus = () => setProgress(profileProgress(loadProfile()));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  function handleBack() {
    let back: string | null = null;
    try {
      back = window.sessionStorage.getItem("kindred:profile:return");
      window.sessionStorage.removeItem("kindred:profile:return");
      window.sessionStorage.removeItem("kindred:profile:focus");
    } catch { /* noop */ }
    if (back === "/matchmaker") void navigate({ to: "/matchmaker" });
    else if (back === "/side-by-side") void navigate({ to: "/side-by-side" });
    else void navigate({ to: "/" });
  }

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const backLabel =
    returnTo === "/matchmaker"
      ? t("hello.gate.back_to_matchmaker")
      : returnTo === "/side-by-side"
      ? t("hello.gate.back_to_sidebyside")
      : "Kindred";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className={returnTo ? "" : "font-mono uppercase tracking-wide"}>
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
            {t("profile.subhead")}
          </p>
          <p className="mt-2 text-[11px] font-mono uppercase tracking-wide text-muted-foreground tabular-nums">
            {t("profile.progress", { done: progress.done, total: progress.total })}
          </p>
        </div>

        <ProfileForm lang={lang} />
      </main>
    </div>
  );
}
