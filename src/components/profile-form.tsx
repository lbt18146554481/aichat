// Shared Profile form UI — used by the /profile route.
// Reads/writes localStorage directly via load/saveProfile. Every field
// change persists immediately; nothing gates on "complete".
//
// Four sections, each with a clear reader:
//   01 Vitals      — identity + system hard filter (same city)
//   02 Activities  — Side-by-Side matcher (real weekly rhythm)
//   03 Moments     — other real people (Introduce Someone right pane)
//   04 Favorites   — other real people (cultural taste; multi-entry)

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import {
  EMPTY_PROFILE,
  MIN_MOMENTS,
  MAX_ACTIVITIES,
  MAX_FAVORITES,
  addActivity,
  addFavorite,
  isProfileComplete,
  loadProfile,
  removeActivity,
  removeFavorite,
  removeMoment,
  saveProfile,
  updateActivity,
  updateFavorite,
  upsertMoment,
  type ActivityCadence,
  type Favorite,
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
const MBTI_TYPES = [
  "INTJ","INTP","ENTJ","ENTP",
  "INFJ","INFP","ENFJ","ENFP",
  "ISTJ","ISFJ","ESTJ","ESFJ",
  "ISTP","ISFP","ESTP","ESFP",
];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB soft cap


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
  function handleAddActivity() {
    setProfile((p) => addActivity(p, { kind: "tennis", area: "", cadence: "weekly" }));
  }
  function patchActivity(i: number, patch: Partial<UserActivity>) {
    setProfile((p) => updateActivity(p, i, patch));
  }
  function dropActivity(i: number) {
    setProfile((p) => removeActivity(p, i));
  }
  function handleAddFavorite() {
    setProfile((p) => addFavorite(p, { kind: "book", title: "", why: "" }));
  }
  function patchFavorite(i: number, patch: Partial<Favorite>) {
    setProfile((p) => updateFavorite(p, i, patch));
  }
  function dropFavorite(i: number) {
    setProfile((p) => removeFavorite(p, i));
  }

  if (!hydrated) return <div />;

  const gap = compact ? "space-y-10" : "space-y-14";

  return (
    <div className={gap}>
      {/* — 01 Vitals — */}
      <section className="space-y-4">
        <SectionHeader index={1} title={t("profile.section.vitals")} hint={t("profile.section.vitals_hint")} />
        <AvatarField
          value={profile.avatar}
          name={profile.name}
          onChange={(dataUrl) => updateField("avatar", dataUrl)}
        />
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
          <Field label={`${t("profile.f.mbti")} · ${t("profile.optional")}`}>
            <select
              value={profile.mbti}
              onChange={(e) => updateField("mbti", e.target.value)}
              className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
            >
              <option value="">{t("profile.f.mbti_placeholder")}</option>
              {MBTI_TYPES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>


      {/* — 02 Activities — */}
      <section className="space-y-4">
        <SectionHeader
          index={2}
          title={t("profile.section.activities")}
          hint={t("profile.section.activities_hint")}
          badge={`${profile.activities.length} / ${MAX_ACTIVITIES}`}
        />
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

      {/* — 04 Favorites — */}
      <section className="space-y-4">
        <SectionHeader
          index={4}
          title={t("profile.section.favorites")}
          hint={t("profile.section.favorites_hint")}
          badge={`${profile.favorites.length} / ${MAX_FAVORITES}`}
        />
        <div className="space-y-2">
          {profile.favorites.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-card px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {WORK_KINDS.map((k) => {
                    const active = f.kind === k;
                    return (
                      <button
                        key={k}
                        onClick={() => patchFavorite(i, { kind: k })}
                        className={
                          "px-2.5 py-1 rounded-full text-[11.5px] border transition-colors " +
                          (active
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-foreground/80 hover:border-foreground/50")
                        }
                      >
                        {t(`profile.kind.${k}`)}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => dropFavorite(i)}
                  aria-label={t("profile.favorite.remove")}
                  className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={f.title}
                onChange={(e) => patchFavorite(i, { title: e.target.value })}
                placeholder={t("profile.favorite.title_placeholder")}
                className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
              />
              <textarea
                rows={2}
                value={f.why}
                onChange={(e) => patchFavorite(i, { why: e.target.value.slice(0, 120) })}
                placeholder={t("profile.favorite.why_placeholder")}
                className="w-full bg-transparent resize-none border-b border-border focus:border-foreground outline-none py-1.5 text-[14px] leading-relaxed"
              />
            </div>
          ))}

          {profile.favorites.length < MAX_FAVORITES && (
            <button
              onClick={handleAddFavorite}
              className="w-full rounded-lg border border-dashed border-border hover:border-foreground/40 py-2.5 text-[13px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {profile.favorites.length === 0 ? t("profile.favorite.add_first") : t("profile.favorite.add")}
            </button>
          )}
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

function AvatarField({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (dataUrl: string) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-pick same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("profile.avatar.error_type"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(t("profile.avatar.error_size"));
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      onChange(result);
    };
    reader.onerror = () => setError(t("profile.avatar.error_read"));
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-full border border-border bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[20px] font-serif italic text-muted-foreground">{initial}</span>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[12px] text-foreground/80 hover:border-foreground/50 cursor-pointer transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span>{value ? t("profile.avatar.replace") : t("profile.avatar.upload")}</span>
            <input type="file" accept="image/*" onChange={handlePick} className="hidden" />
          </label>
          {value && (
            <button
              onClick={() => { onChange(""); setError(null); }}
              className="text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              {t("profile.avatar.remove")}
            </button>
          )}
        </div>
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          {error ?? t("profile.avatar.hint")}
        </p>
      </div>
    </div>
  );
}


function PreviewCard({ profile, lang }: { profile: Profile; lang: Lang }) {
  const { t } = useTranslation();
  const favs = profile.favorites.filter((f) => f.title.trim() && f.why.trim()).slice(0, 3);
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <div className="flex items-start gap-4">
        {profile.avatar ? (
          <img src={profile.avatar} alt="" className="w-14 h-14 rounded-full object-cover border border-border shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full border border-border bg-secondary/60 flex items-center justify-center shrink-0">
            <span className="text-[18px] font-serif italic text-muted-foreground">
              {(profile.name.trim()[0] ?? "?").toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-[18px] font-semibold tracking-tight text-foreground">{profile.name}</h3>
            <span className="text-[12px] font-mono text-muted-foreground tabular-nums">{profile.age}</span>
            {profile.mbti && (
              <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">{profile.mbti}</span>
            )}
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{profile.occupation} · {profile.city}</p>
        </div>
      </div>


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

      {favs.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("intro.favorites_label")}
          </div>
          <ul className="space-y-1.5">
            {favs.map((f, i) => (
              <li key={i} className="text-[13px] text-foreground leading-snug">
                <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mr-1.5">
                  {t(`profile.kind.${f.kind}`)}
                </span>
                <span className="font-medium">{f.title}</span>
                <span className="text-muted-foreground"> — {f.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
