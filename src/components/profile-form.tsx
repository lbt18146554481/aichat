// Shared Profile form UI — used by the /profile route.
// Reads/writes localStorage directly via load/saveProfile. Every field
// change persists immediately; nothing gates on "complete".
//
// Three sections, each with a clear reader:
//   01 Vitals      — identity + system hard filter (same city)
//   02 Moments     — other real people (Introduce Someone right pane)
//   03 Favorites   — other real people (cultural taste; multi-entry)

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, BookOpen, Film, Music, Landmark, UtensilsCrossed, Dumbbell, Sparkles, ChevronDown, Eye, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import {
  EMPTY_PROFILE,
  MIN_MOMENTS,
  MAX_FAVORITES,
  addFavorite,
  isHidden,
  isProfileComplete,
  loadProfile,
  removeFavorite,
  removeMoment,
  saveProfile,
  toggleHidden,
  updateFavorite,
  upsertMoment,
  type Favorite,
  type Gender,
  type Orientation,
  type Profile,
  type WorkKind,
} from "@/lib/profile";
import {
  MOMENT_PROMPTS,
  getMomentPromptById,
  localizedHint,
  localizedMomentPrompt,
} from "@/lib/questions";

const WORK_KINDS: WorkKind[] = ["book", "film", "music", "exhibition", "food", "sport", "other"];
const KIND_ICONS: Record<WorkKind, LucideIcon> = {
  book: BookOpen,
  film: Film,
  music: Music,
  exhibition: Landmark,
  food: UtensilsCrossed,
  sport: Dumbbell,
  other: Sparkles,
};
const GENDERS: Gender[] = ["female", "male", "nonbinary", "prefer_not_to_say"];
const ORIENTATIONS: Orientation[] = ["straight", "gay", "lesbian", "bi", "pan", "asexual", "prefer_not_to_say"];
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
  function flipHide(key: string) {
    setProfile((p) => toggleHidden(p, key));
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
  // Always render at least one empty row so the shape is discoverable.
  const favRows = profile.favorites.length === 0
    ? [{ kind: "book" as WorkKind, title: "", why: "" }]
    : profile.favorites;
  const hasStoredFavs = profile.favorites.length > 0;

  return (
    <div className={gap}>
      {/* — 01 Vitals — */}
      <section className="space-y-4">
        <SectionHeader index={1} title={t("profile.section.vitals")} hint={t("profile.section.vitals_hint")} />
        <AvatarField
          value={profile.avatar}
          name={profile.name}
          hidden={isHidden(profile, "avatar")}
          onToggleHide={() => flipHide("avatar")}
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
          <Field
            label={t("profile.f.age")}
            hidden={isHidden(profile, "age")}
            onToggleHide={() => flipHide("age")}
          >
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
          <Field
            label={`${t("profile.f.gender")} · ${t("profile.optional")}`}
            hidden={isHidden(profile, "gender")}
            onToggleHide={() => flipHide("gender")}
          >
            <select
              value={profile.gender}
              onChange={(e) => updateField("gender", e.target.value as Gender)}
              className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
            >
              <option value="">{t("profile.f.gender_placeholder")}</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>{t(`profile.gender.${g}`)}</option>
              ))}
            </select>
          </Field>
          <Field
            label={`${t("profile.f.orientation")} · ${t("profile.optional")}`}
            hidden={isHidden(profile, "orientation")}
            onToggleHide={() => flipHide("orientation")}
          >
            <select
              value={profile.orientation}
              onChange={(e) => updateField("orientation", e.target.value as Orientation)}
              className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14.5px]"
            >
              <option value="">{t("profile.f.orientation_placeholder")}</option>
              {ORIENTATIONS.map((o) => (
                <option key={o} value={o}>{t(`profile.orientation.${o}`)}</option>
              ))}
            </select>
          </Field>
          <Field
            label={`${t("profile.f.mbti")} · ${t("profile.optional")}`}
            hidden={isHidden(profile, "mbti")}
            onToggleHide={() => flipHide("mbti")}
          >
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
        <Field
          label={`${t("profile.f.bio")} · ${t("profile.optional")}`}
          hidden={isHidden(profile, "bio")}
          onToggleHide={() => flipHide("bio")}
        >
          <textarea
            value={profile.bio}
            onChange={(e) => updateField("bio", e.target.value.slice(0, 140))}
            placeholder={t("profile.f.bio_placeholder")}
            rows={2}
            maxLength={140}
            className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-[14px] leading-relaxed resize-none"
          />
        </Field>

        {/* Interest tags — the only structured signal the matcher can compare
            against another person's tags, so "you both care about X" is a
            real, attributable reason instead of copy. */}
        <Field
          label={`${t("profile.f.interests")} · ${t("profile.optional")}`}
          hidden={isHidden(profile, "interests")}
          onToggleHide={() => flipHide("interests")}
        >
          <div className="pt-1 flex flex-wrap gap-1.5">
            {INTEREST_TAGS.map((tag) => {
              const on = (profile.interests ?? []).includes(tag);
              const full = (profile.interests ?? []).length >= MAX_INTERESTS;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => setProfile((p) => toggleInterest(p, tag))}
                  className={[
                    "px-2.5 py-1 rounded-full border text-[12.5px] transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40 disabled:opacity-35",
                  ].join(" ")}
                >
                  {t(`signal.${tag}`, { defaultValue: tag })}
                </button>
              );
            })}
          </div>
        </Field>
      </section>


      {/* — 02 Moments — */}
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
                  <div className="shrink-0 flex items-center gap-1">
                    {active && (
                      <VisibilityToggle
                        hidden={isHidden(profile, `moment:${p.id}`)}
                        onClick={() => flipHide(`moment:${p.id}`)}
                      />
                    )}
                    {active && (
                      <button
                        onClick={() => dropMoment(p.id)}
                        aria-label={t("profile.moment.remove")}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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

      {/* — 03 Favorites — */}
      <section className="space-y-4">
        <SectionHeader
          index={3}
          title={t("profile.section.favorites")}
          hint={t("profile.section.favorites_hint")}
          badge={`${profile.favorites.length} / ${MAX_FAVORITES}`}
        />
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {favRows.map((f, i) => (
            <FavoriteRow
              key={i}
              favorite={f}
              onKind={(kind) => hasStoredFavs ? patchFavorite(i, { kind }) : setProfile((p) => addFavorite(p, { ...f, kind }))}
              onTitle={(title) => {
                if (hasStoredFavs) patchFavorite(i, { title });
                else if (title.length > 0) setProfile((p) => addFavorite(p, { ...f, title }));
              }}
              onWhy={(why) => {
                const capped = why.slice(0, 80);
                if (hasStoredFavs) patchFavorite(i, { why: capped });
                else if (capped.length > 0) setProfile((p) => addFavorite(p, { ...f, why: capped }));
              }}
              onRemove={hasStoredFavs ? () => dropFavorite(i) : undefined}
              hidden={hasStoredFavs ? isHidden(profile, `favorite:${i}`) : false}
              onToggleHide={hasStoredFavs ? () => flipHide(`favorite:${i}`) : undefined}
            />
          ))}
        </ul>

        {profile.favorites.length < MAX_FAVORITES && hasStoredFavs && (
          <button
            onClick={handleAddFavorite}
            className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("profile.favorite.add_more")}
          </button>
        )}
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

function FavoriteRow({
  favorite,
  onKind,
  onTitle,
  onWhy,
  onRemove,
  hidden,
  onToggleHide,
}: {
  favorite: Favorite;
  onKind: (k: WorkKind) => void;
  onTitle: (v: string) => void;
  onWhy: (v: string) => void;
  onRemove?: () => void;
  hidden?: boolean;
  onToggleHide?: () => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const Icon = KIND_ICONS[favorite.kind];

  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  return (
    <li ref={rootRef} className="group relative flex items-start gap-3 py-3">
      <div className="relative pt-0.5">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={t("profile.favorite.kind_label")}
          aria-expanded={pickerOpen}
          className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full border border-border bg-secondary/60 text-[11.5px] text-foreground/80 hover:border-foreground/40 hover:text-foreground transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{t(`profile.kind.${favorite.kind}`)}</span>
          <ChevronDown className={"w-3 h-3 transition-transform " + (pickerOpen ? "rotate-180" : "")} />
        </button>
        {pickerOpen && (
          <div className="absolute left-0 top-9 z-10 rounded-lg border border-border bg-popover shadow-md p-1 flex flex-col min-w-[9rem]">
            {WORK_KINDS.map((k) => {
              const KI = KIND_ICONS[k];
              const active = favorite.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { onKind(k); setPickerOpen(false); }}
                  className={
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] text-left transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/80 hover:bg-secondary hover:text-foreground")
                  }
                >
                  <KI className="w-3.5 h-3.5" />
                  <span>{t(`profile.kind.${k}`)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <input
          value={favorite.title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={t(`profile.favorite.title_placeholder.${favorite.kind}`)}
          className="w-full bg-transparent outline-none py-0.5 text-[14.5px] text-foreground placeholder:text-muted-foreground/60"
        />
        <input
          value={favorite.why}
          onChange={(e) => onWhy(e.target.value)}
          placeholder={t("profile.favorite.why_placeholder")}
          maxLength={80}
          className="w-full bg-transparent outline-none py-0.5 text-[12.5px] italic text-muted-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="mt-1.5 flex items-center gap-0.5">
        {onToggleHide && (favorite.title.trim() || favorite.why.trim()) && (
          <VisibilityToggle hidden={!!hidden} onClick={onToggleHide} />
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={t("profile.favorite.remove")}
            className="p-1 text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
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

function Field({
  label,
  hidden,
  onToggleHide,
  children,
}: {
  label: string;
  hidden?: boolean;
  onToggleHide?: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">{label}</span>
        {onToggleHide && (
          <VisibilityToggle hidden={!!hidden} onClick={onToggleHide} />
        )}
      </span>
      {children}
    </label>
  );
}

function VisibilityToggle({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onClick(); }}
      aria-label={hidden ? t("profile.visibility.show") : t("profile.visibility.hide")}
      title={hidden ? t("profile.visibility.hidden_hint") : t("profile.visibility.shown_hint")}
      className={
        "inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors " +
        (hidden
          ? "text-muted-foreground/70 hover:text-foreground"
          : "text-muted-foreground/40 hover:text-foreground")
      }
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
    </button>
  );
}

function AvatarField({
  value,
  name,
  hidden,
  onToggleHide,
  onChange,
}: {
  value: string;
  name: string;
  hidden?: boolean;
  onToggleHide?: () => void;
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
          {value && onToggleHide && (
            <VisibilityToggle hidden={!!hidden} onClick={onToggleHide} />
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
  // Respect the user's per-field visibility toggles here — the preview is
  // the truth of what others will see.
  const showAvatar = !isHidden(profile, "avatar") && !!profile.avatar;
  const showAge = !isHidden(profile, "age") && profile.age != null;
  const showMbti = !isHidden(profile, "mbti") && !!profile.mbti;
  const favs = profile.favorites
    .map((f, i) => ({ f, i }))
    .filter(({ f, i }) => f.title.trim() && f.why.trim() && !isHidden(profile, `favorite:${i}`))
    .slice(0, 3);
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <div className="flex items-start gap-4">
        {showAvatar ? (
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
            {showAge && (
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">{profile.age}</span>
            )}
            {showMbti && (
              <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">{profile.mbti}</span>
            )}
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{profile.occupation} · {profile.city}</p>
        </div>
      </div>


      <div className="mt-6 space-y-4">
        {profile.moments
          .filter((m) => m.answer.trim() && !isHidden(profile, `moment:${m.promptId}`))
          .map((m) => {
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
          <ul className="space-y-2">
            {favs.map(({ f, i }) => {
              const Icon = KIND_ICONS[f.kind];
              return (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug">
                  <Icon className="w-3.5 h-3.5 mt-1 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-foreground">{f.title}</div>
                    <div className="text-muted-foreground italic">“{f.why}”</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
