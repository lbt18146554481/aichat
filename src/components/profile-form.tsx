// Shared Profile form UI — used by the /profile route.
// Reads/writes localStorage directly via load/saveProfile. Every field
// change persists immediately; nothing gates on "complete".
//
// Three layers, each with a helper explaining who reads it:
//   01 Vitals          — system hard filter
//   02 Compatibility   — system soft signals (optional)
//   03 Moments         — other real people
//   04 One work        — other real people

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import {
  EMPTY_PROFILE,
  MIN_MOMENTS,
  MAX_ACTIVITIES,
  addActivity,
  isProfileComplete,
  loadProfile,
  removeActivity,
  removeMoment,
  saveProfile,
  setCompatibility,
  updateActivity,
  upsertMoment,
  type ActivityCadence,
  type CompatibilityAnswers,
  type OneWork,
  type Profile,
  type UserActivity,
  type WorkKind,
} from "@/lib/profile";
import type { ActivityKind } from "@/lib/types";
import {
  MOMENT_PROMPTS,
  getMomentPromptById,
  localizedHint,
  localizedMomentPrompt,
} from "@/lib/questions";

const WORK_KINDS: WorkKind[] = ["book", "film", "music", "exhibition", "food", "other"];
const ACTIVITY_KINDS: ActivityKind[] = ["tennis", "run", "climb", "cook", "exhibition", "bookstore"];
const CADENCES: ActivityCadence[] = ["weekly", "monthly", "occasional"];

// Compatibility question definitions. Ids are stable; wording lives in i18n.
const COMPAT_QUESTIONS: Array<{
  key: keyof CompatibilityAnswers;
  options: string[];
}> = [
  { key: "weekend",    options: ["quiet_recharge", "one_close_friend", "out_and_about"] },
  { key: "conflict",   options: ["talk_now", "cool_off_first", "write_it_out"] },
  { key: "five_years", options: ["depth_one_thing", "range_many_things", "stability_family"] },
];

interface Props {
  lang: Lang;
  /** When true, renders in a slightly denser layout. */
  compact?: boolean;
}

export function ProfileForm({ lang, compact = false }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setProfile(loadProfile()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) saveProfile(profile); }, [profile, hydrated]);

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
  function pickCompat<K extends keyof CompatibilityAnswers>(k: K, v: CompatibilityAnswers[K]) {
    setProfile((p) => setCompatibility(p, k, p.compatibility[k] === v ? undefined : v));
  }
  function handleAddActivity() {
    setProfile((p) => addActivity(p, { kind: "tennis", area: "", cadence: "weekly" }));
  }
  function patchActivity(i: number, patch: Partial<UserActivity>) {
    setProfile((p) => updateActivity(p, i, patch));
  }
  function dropActivity(i: number) {
    setProfile((p) => removeActivity(p, i));
  }

  if (!hydrated) return <div />;

  const gap = compact ? "space-y-10" : "space-y-14";

  return (
    <div className={gap}>
      {/* — 01 Vitals — */}
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

      {/* — 02 Compatibility — */}
      <section className="space-y-6">
        <SectionHeader
          index={2}
          title={t("profile.section.compat")}
          hint={t("profile.section.compat_hint")}
          badge={t("profile.optional")}
        />

        {/* Situational questions */}
        <div className="space-y-5">
          {COMPAT_QUESTIONS.map((q) => (
            <div key={q.key} className="space-y-2">
              <div className="text-[13px] text-foreground leading-snug">
                {t(`profile.compat.${q.key}.q`)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {q.options.map((opt) => {
                  const active = profile.compatibility[q.key] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => pickCompat(q.key, opt as CompatibilityAnswers[typeof q.key])}
                      className={
                        "text-left rounded-lg border px-3 py-2 text-[13px] leading-snug transition-colors " +
                        (active
                          ? "border-foreground bg-foreground/[0.04] text-foreground"
                          : "border-border text-foreground/80 hover:border-foreground/40")
                      }
                    >
                      {t(`profile.compat.${q.key}.${opt}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Activities */}
        <div className="space-y-3 pt-2">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[13px] text-foreground">
                {t("profile.activities.title")}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                {t("profile.activities.hint")}
              </div>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {profile.activities.length} / {MAX_ACTIVITIES}
            </span>
          </div>

          <div className="space-y-2">
            {profile.activities.map((a, i) => (
              <div key={i} className="rounded-lg border border-border bg-card px-3 py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={a.kind}
                    onChange={(e) => patchActivity(i, { kind: e.target.value as ActivityKind })}
                    className="bg-transparent text-[13px] font-medium text-foreground outline-none border-b border-transparent hover:border-border focus:border-foreground py-0.5"
                  >
                    {ACTIVITY_KINDS.map((k) => (
                      <option key={k} value={k}>{t(`activity.kind.${k}`)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => dropActivity(i)}
                    aria-label={t("profile.activities.remove")}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={a.area}
                    onChange={(e) => patchActivity(i, { area: e.target.value })}
                    placeholder={t("profile.activities.area_placeholder")}
                    className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1 text-[13px]"
                  />
                  <div className="flex gap-1.5">
                    {CADENCES.map((c) => {
                      const active = a.cadence === c;
                      return (
                        <button
                          key={c}
                          onClick={() => patchActivity(i, { cadence: c })}
                          className={
                            "px-2.5 py-1 rounded-full text-[11.5px] border transition-colors " +
                            (active
                              ? "bg-foreground text-background border-foreground"
                              : "border-border text-foreground/80 hover:border-foreground/50")
                          }
                        >
                          {t(`profile.cadence.${c}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {profile.activities.length < MAX_ACTIVITIES && (
              <button
                onClick={handleAddActivity}
                className="w-full rounded-lg border border-dashed border-border hover:border-foreground/40 py-2.5 text-[13px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("profile.activities.add")}
              </button>
            )}
          </div>
        </div>

        {/* MBTI */}
        <div className="space-y-2 pt-2">
          <div className="text-[13px] text-foreground">{t("profile.mbti.title")}</div>
          <input
            value={profile.mbti ?? ""}
            onChange={(e) => updateField("mbti", e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            placeholder={t("profile.mbti.placeholder")}
            className="w-40 bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px] tracking-widest uppercase"
          />
          <div className="text-[11.5px] text-muted-foreground">
            {t("profile.mbti.note")}
          </div>
        </div>
      </section>

      {/* — 03 Moments — */}
      <section className="space-y-4">
        <SectionHeader
          index={3}
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

      {/* — 04 One Work — */}
      <section className="space-y-4">
        <SectionHeader index={4} title={t("profile.section.one_work")} hint={t("profile.section.one_work_hint")} />
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

      {/* — Note — */}
      <p className="text-[12px] text-muted-foreground max-w-md leading-relaxed">
        {complete ? t("profile.done_note") : t("profile.incomplete_note")}
      </p>

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
