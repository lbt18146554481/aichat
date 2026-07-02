import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check } from "lucide-react";
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

  useEffect(() => {
    setProgress(profileProgress(loadProfile()));
    setHydrated(true);
    // Refresh progress on focus (form saves on every keystroke; this keeps
    // the header badge in sync if the user tabs away and back).
    const onFocus = () => setProgress(profileProgress(loadProfile()));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">Kindred</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground tabular-nums">
              {t("profile.progress", { done: progress.done, total: progress.total })}
            </span>
            <LangSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-10">
        <div>
          <h1 className="text-[24px] font-serif italic leading-tight text-foreground">
            {t("profile.heading_setup")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed max-w-xl">
            {t("profile.subhead")}
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed max-w-xl">
            {t("profile.autosave_hint")}
          </p>
        </div>

        <ProfileForm lang={lang} />

        <section className="pt-4 border-t border-border flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => { void navigate({ to: "/" }); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90"
          >
            <Check className="w-3.5 h-3.5" />
            {t("profile.done_generic")}
          </button>
        </section>
      </main>
    </div>
  );
}
