import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import {
  EMPTY_PROFILE,
  MIN_MOMENTS,
  isProfileComplete,
  loadProfile,
  profileProgress,
  removeMoment,
  saveProfile,
  upsertMoment,
  type OneWork,
  type Profile,
  type WorkKind,
} from "@/lib/profile";
import {
  MOMENT_PROMPTS,
  getMomentPromptById,
  localizedHint,
  localizedMomentPrompt,
} from "@/lib/questions";
import { LangSwitcher } from "@/components/lang-switcher";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Your profile — Kindred" },
      { name: "description", content: "Edit how you appear to people Kindred introduces you to." },
    ],
  }),
});

const WORK_KINDS: WorkKind[] = ["book", "film", "music", "exhibition", "food", "other"];

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setProfile(loadProfile()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) saveProfile(profile); }, [profile, hydrated]);

  const progress = profileProgress(profile);
  const complete = isProfileComplete(profile);
  const filledMoments = profile.moments.filter((m) => m.answer.trim().length > 0);

  function updateField<K extends keyof Profile>(k: K, v: Profile[K]) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  function updateMoment(promptId: string, answer: string) {
    setProfile((p) => upsertMoment(p, promptId, answer));
  }
  function dropMoment(promptId: string) {
    setProfile((p) => removeMoment(p, promptId));
  }

  function updateWork<K extends keyof OneWork>(k: K, v: OneWork[K]) {
    setProfile((p) => ({
      ...p,
      oneWork: { kind: "book", title: "", why: "", ...(p.oneWork ?? {}), [k]: v },
    }));
  }

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
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              {t("profile.progress", { done: progress.done, total: progress.total })}
            </span>
            <LangSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-12">
        <div>
          <h1 className="text-[24px] font-serif italic leading-tight text-foreground">
            {complete ? t("profile.heading_edit") : t("profile.heading_setup")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed max-w-xl">
            {t("profile.subhead")}
          </p>
        </div>

        {/* — Vitals — */}
        <section className="space-y-4">
          <SectionHeader index={1} title={t("profile.section.vitals")} hint={t("profile.section.vitals_hint")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("profile.f.name")}>
              <input
                value={profile.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
              />
            </Field>
            <Field label={t("profile.f.age")}>
              <input
                type="number" min={18} max={99}
                value={profile.age ?? ""}
                onChange={(e) => updateField("age", e.target.value === "" ? null : Number(e.target.value))}
                className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
              />
            </Field>
            <Field label={t("profile.f.city")}>
              <input
                value={profile.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
              />
            </Field>
            <Field label={t("profile.f.occupation")}>
              <input
                value={profile.occupation}
                onChange={(e) => updateField("occupation", e.target.value)}
                className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
              />
            </Field>
          </div>
        </section>

        {/* — Moments — */}
        <section className="space-y-4">
          <SectionHeader
            index={2}
            title={t("profile.section.moments", { n: MIN_MOMENTS })}
            hint={t("profile.section.moments_hint")}
            badge={`${filledMoments.length} / ${MIN_MOMENTS}`}
          />
          <div className="space-y-3">
            {MOMENT_PROMPTS.map((p) => {
              const current = profile.moments.find((m) => m.promptId === p.id);
              const active = current !== undefined;
              return (
                <article
                  key={p.id}
                  className={
                    "rounded-lg border bg-card transition-colors " +
                    (active ? "border-foreground/30" : "border-border hover:border-foreground/20")
                  }
                >
                  <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] text-foreground leading-snug">
                        {localizedMomentPrompt(p, lang)}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                        {localizedHint(p, lang)}
                      </div>
                    </div>
                    {active && (
                      <button
                        onClick={() => dropMoment(p.id)}
                        aria-label={t("profile.moment.remove")}
                        className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={active ? 3 : 1}
                    value={current?.answer ?? ""}
                    onChange={(e) => updateMoment(p.id, e.target.value)}
                    placeholder={t("profile.moment.placeholder")}
                    className="w-full bg-transparent resize-none outline-none border-t border-border px-4 py-2.5 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70"
                  />
                </article>
              );
            })}
          </div>
        </section>

        {/* — One Work — */}
        <section className="space-y-4">
          <SectionHeader index={3} title={t("profile.section.one_work")} hint={t("profile.section.one_work_hint")} />
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {WORK_KINDS.map((k) => {
                const active = (profile.oneWork?.kind ?? "book") === k;
                return (
                  <button
                    key={k}
                    onClick={() => updateWork("kind", k)}
                    className={
                      "px-2.5 py-1 rounded-full text-[11.5px] border transition-colors " +
                      (active ? "bg-foreground text-background border-foreground" : "border-border text-foreground/80 hover:border-foreground/50")
                    }
                  >
                    {t(`profile.kind.${k}`)}
                  </button>
                );
              })}
            </div>
            <Field label={t("profile.f.work_title")}>
              <input
                value={profile.oneWork?.title ?? ""}
                onChange={(e) => updateWork("title", e.target.value)}
                placeholder={t("profile.f.work_title_placeholder")}
                className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
              />
            </Field>
            <Field label={t("profile.f.work_why")}>
              <textarea
                rows={2}
                value={profile.oneWork?.why ?? ""}
                onChange={(e) => updateWork("why", e.target.value)}
                placeholder={t("profile.f.work_why_placeholder")}
                className="w-full bg-transparent resize-none border-b border-border focus:border-foreground outline-none py-1.5 text-[14px] leading-relaxed"
              />
            </Field>
          </div>
        </section>

        {/* — Done — */}
        <section className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground max-w-md leading-relaxed">
            {complete ? t("profile.done_note") : t("profile.incomplete_note", { n: MIN_MOMENTS })}
          </p>
          <button
            onClick={() => void navigate({ to: "/" })}
            disabled={!complete}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            <Check className="w-3.5 h-3.5" />
            {complete ? t("profile.done") : t("profile.keep_going")}
          </button>
        </section>

        {/* — Preview — */}
        {complete && (
          <section className="space-y-3 pt-6 border-t border-border">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
              {t("profile.preview_label")}
            </div>
            <p className="text-[12px] text-muted-foreground italic">{t("profile.preview_hint")}</p>
            <PreviewCard profile={profile} lang={lang} />
          </section>
        )}
      </main>
    </div>
  );
}

function SectionHeader({ index, title, hint, badge }: {
  index: number; title: string; hint: string; badge?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
          <h2 className="text-[16px] font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {badge && (
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{badge}</span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground leading-snug">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PreviewCard({ profile, lang }: { profile: Profile; lang: Lang }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-[18px] font-semibold tracking-tight text-foreground">{profile.name}</h3>
        <span className="text-[12px] font-mono text-muted-foreground tabular-nums">{profile.age}</span>
      </div>
      <p className="text-[12.5px] text-muted-foreground mt-0.5">{profile.occupation} · {profile.city}</p>

      <div className="mt-6 space-y-4">
        {profile.moments.filter((m) => m.answer.trim()).map((m) => {
          const prompt = getMomentPromptById(m.promptId);
          return (
            <article key={m.promptId} className="border-l-2 border-border pl-3">
              {prompt && (
                <div className="text-[11px] text-muted-foreground italic mb-1">
                  {localizedMomentPrompt(prompt, lang)}
                </div>
              )}
              <p className="text-[14px] leading-[1.65] text-foreground">{m.answer}</p>
            </article>
          );
        })}
      </div>

      {profile.oneWork && profile.oneWork.title && (
        <div className="mt-6 rounded-lg border border-border px-3.5 py-3">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
            {t("intro.one_work_label", { kind: t(`profile.kind.${profile.oneWork.kind}`) })}
          </div>
          <div className="text-[14px] font-medium text-foreground">{profile.oneWork.title}</div>
          <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{profile.oneWork.why}</p>
        </div>
      )}
    </div>
  );
}

// keep Plus reachable for tree-shake friendliness in case we add a "+" elsewhere
export const _plusRef = Plus;
