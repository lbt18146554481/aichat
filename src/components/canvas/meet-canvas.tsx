import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUp, ArrowLeft, MessageCircle, SkipForward, Users, X, ChevronRight, Bookmark, BookmarkCheck } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { SideState, ChatMsg, LevelTier, WhenTier } from "@/lib/agents/side-by-side";
import { currentView } from "@/lib/agents/side-by-side";
import { countAvailableMatches, getIntentById, type Intent } from "@/lib/intents";
import type { ActivityKind } from "@/lib/types";
import { avatarUrl, getPersonById } from "@/lib/people";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PublicProfileSheet } from "@/components/public-profile-sheet";

import { useIsSaved } from "@/components/saved-trigger";
import { loadProfile } from "@/lib/profile";


interface Props {
  state: SideState;
  onStartChat: () => void;
  onRevoke: () => void;
  onTryNearMiss: (intentId: string) => void;
  onSendChat: (text: string) => void;
  onEditWish: (patch: { when?: WhenTier; level?: LevelTier; city?: string }) => void;
  onSkip: () => void;
  onRevokeReshare: () => void;
  /** Bookmark the current match candidate. */
  onSave?: () => void;
  /** Remove someone from the saved list. */
  onUnsave?: (intentId: string) => void;
  /** Start a chat directly with a saved candidate. */
  onChatWithSaved?: (intentId: string) => void;
  /** Return from the TA chat back to the candidate card without ending the wish. */
  onBackToCandidate?: () => void;
  /** Called after the composer has consumed state.pendingDraft. */
  onDraftConsumed?: () => void;
}




const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾", run: "🏃", climb: "🧗", cook: "🍳", exhibition: "🖼", bookstore: "📚", other: "✨",
};

export function MeetCanvas(props: Props) {
  const view = currentView(props.state);

  let content: React.ReactNode;
  if (view === "chat") content = <ChatView {...props} />;
  else if (view === "match") content = <MatchView {...props} />;
  else if (view === "nomatch") content = <NoMatchView {...props} />;
  else content = <EmptyCanvas />;

  return <div className="relative h-full">{content}</div>;
}


// ---- Empty ---------------------------------------------------------------

function EmptyCanvas() {
  const { t } = useTranslation();
  const examples = t("meet.examples", { returnObjects: true }) as unknown;
  const exampleList = Array.isArray(examples) ? (examples as string[]) : [];
  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-md">
        <div className="mx-auto w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="mt-5 text-[18px] font-medium text-foreground leading-snug text-center">
          {t("meet.empty_title")}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed text-center">
          {t("meet.empty_hint")}
        </p>

        {exampleList.length > 0 && (
          <section className="mt-8">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground text-center">
              {t("meet.examples_label")}
            </div>
            <ul className="mt-3 space-y-2">
              {exampleList.map((ex, i) => (
                <li key={i} className="rounded-xl border border-border bg-card px-4 py-3 text-[13px] text-foreground/85 leading-relaxed">
                  <span className="text-muted-foreground mr-1.5">“</span>
                  {ex}
                  <span className="text-muted-foreground ml-0.5">”</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-muted-foreground leading-relaxed text-center">
              {t("meet.examples_footnote")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

// ---- Match — two intent cards side by side + [start chat] --------------

function MatchView({ state, onStartChat, onSkip, onSave }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
  const [openProfile, setOpenProfile] = useState(false);
  const isSaved = useIsSaved(other?.id);

  if (!mine || !other) return <EmptyCanvas />;

  const alignedKind = t(`activity.kind.${mine.kind}`);
  const alignedWhen = sharedWhenLabel(mine, other, t);
  const alignedLevel = sharedLevelLabel(mine, other, t);
  // Remaining candidates = everyone still matchable minus the current TA.
  const remaining = Math.max(
    0,
    countAvailableMatches(mine, {
      exclude: state.triedIntentIds ?? [],
      excludeOwnerIds: [other.ownerId, ...(state.triedOwnerIds ?? [])],
    }),
  );
  const person = getPersonById(other.ownerId);
  const otherName = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const otherCity = lang === "zh-CN" ? other.ownerCity_zh : other.ownerCity;
  const otherOccupation = person
    ? (lang === "zh-CN" ? person.occupation_zh : person.occupation)
    : "";
  const identityMetaParts = [
    otherCity,
    otherOccupation,
  ].filter((s) => s && s.trim().length > 0);
  // One-line self-introduction — the person's bio in their own words.
  // We DON'T fall back to `portrait` (a system-authored third-person blurb)
  // because it isn't sourced content and misleads the reader about what
  // the system actually knows. If bio is missing we just show nothing here
  // and let the signals row carry the summary instead.
  const personBioLine = person
    ? (lang === "zh-CN" ? person.bio_zh ?? "" : person.bio ?? "")
    : "";

  const quality = state.matchQuality ?? "exact";
  const labelKey =
    quality === "exact" ? "intent.match_label" : "intent.match_label_close";
  const closeReasonKey =
    quality === "relaxed-when" ? "intent.close_reason_when"
    : quality === "relaxed-level" ? "intent.close_reason_level"
    : null;

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t(labelKey)}
          </div>
        </div>
        {closeReasonKey && (
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed">
            {t(closeReasonKey)}
          </p>
        )}


        {/* Identity row — the whole block is a button that opens the profile sheet. */}
        <button
          type="button"
          onClick={() => setOpenProfile(true)}
          aria-label={t("intent.open_profile", { name: otherName })}
          className="mt-4 w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 hover:border-foreground/25 transition-colors"
        >
          <img
            src={avatarUrl(other.ownerId)}
            alt=""
            className="w-12 h-12 rounded-full border border-border shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-foreground truncate">
              {otherName}
              {person?.age ? <span className="text-muted-foreground font-normal">, {person.age}</span> : null}
            </div>
            {identityMetaParts.length > 0 && (
              <div className="text-[12px] text-muted-foreground truncate">
                {identityMetaParts.join(" · ")}
              </div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5 text-muted-foreground">
            <span className="text-[9.5px] font-mono uppercase tracking-[0.14em]">
              {t("intent.more_hint")}
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>

        {personBioLine ? (
          <div className="mt-2">
            <span className="text-[9.5px] uppercase tracking-[0.16em] font-mono text-muted-foreground/70 mr-1.5">
              {t("attribution.self_words")}
            </span>
            <span className="text-[12.5px] text-foreground/80 leading-relaxed">
              {personBioLine}
            </span>
          </div>
        ) : person && person.signals.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[9.5px] uppercase tracking-[0.16em] font-mono text-muted-foreground/70 mr-0.5">
              {t("attribution.signals")}
            </span>
            {person.signals.slice(0, 5).map((s) => (
              <span key={s} className="px-2 py-0.5 rounded-full border border-border text-[11px] text-muted-foreground">
                {s}
              </span>
            ))}
          </div>
        ) : null}

        <WhyPersonBox otherOwnerId={other.ownerId} lang={lang} />

        <div className="mt-3 text-[11.5px] text-muted-foreground leading-relaxed">
          <span className="uppercase tracking-[0.14em] font-mono text-[10px] mr-2 opacity-70">
            {t("intent.aligned_label")}
          </span>
          {t("intent.aligned_body", {
            kind: alignedKind,
            when: alignedWhen,
            level: alignedLevel,
          })}
        </div>

        {/* Their own words + yours — human evidence backing the aligned tag. */}
        <div className="mt-3 space-y-1.5">
          <QuoteLine
            label={t("intent.you_said")}
            text={lang === "zh-CN" ? mine.rawText_zh : mine.rawText}
          />
          <QuoteLine
            label={t("intent.they_said")}
            text={lang === "zh-CN" ? other.rawText_zh : other.rawText}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onStartChat}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-[13.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t("intent.start_chat")}
          </button>
          {onSave && (
            <button
              onClick={onSave}
              aria-pressed={isSaved}
              title={isSaved ? t("intent.unsave") : t("intent.save_hint")}
              className={
                "inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md border text-[13px] transition-colors " +
                (isSaved
                  ? "bg-primary text-primary-foreground border-foreground hover:opacity-90"
                  : "border-border text-foreground/85 hover:bg-secondary")
              }
            >
              {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
              {isSaved ? t("intent.saved") : t("intent.save")}
            </button>
          )}
          <button
            onClick={onSkip}
            disabled={remaining === 0}
            title={remaining === 0 ? t("intent.pool_empty_hint") : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md border border-border text-[13px] text-foreground/85 hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SkipForward className="w-3.5 h-3.5" />
            {t("intent.next_match")}
          </button>
        </div>

      </div>

      <PublicProfileSheet
        person={getPersonById(other.ownerId) ?? null}
        open={openProfile}
        onOpenChange={setOpenProfile}
      />


    </div>
  );
}


// ---- Why is TA — the Agent's own read, clearly attributed --------------
//
// This used to also render an inline "tell the Agent" input. We pulled it:
// any info the Agent needs about the user belongs in the left chat, not
// scattered across the canvas. This box now does ONE thing: show a short
// line the Agent thinks about this person, labeled so the user sees it
// as the Agent's interpretation — not first-person from the other user.

function WhyPersonBox({ otherOwnerId, lang }: { otherOwnerId: string; lang: Lang }) {
  const { t } = useTranslation();
  const person = getPersonById(otherOwnerId);
  const line = person?.whyPersonLine
    ? (lang === "zh-CN" ? person.whyPersonLine.zh : person.whyPersonLine.en)
    : null;
  if (!line) return null;

  return (
    <div className="mt-5 rounded-xl border border-border bg-secondary/40 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
        <Sparkles className="w-3 h-3" />
        {t("attribution.agent_read")}
      </div>
      <p className="mt-1.5 text-[13.5px] text-foreground/90 leading-relaxed">
        {line}
      </p>
    </div>
  );
}



function EditWishPanel({
  intent,
  showLevel,
  onApply,
}: {
  intent: Intent;
  showLevel: boolean;
  onApply: (patch: { when?: WhenTier; level?: LevelTier; city?: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const currentWhen: WhenTier = intent.whenAny
    ? "any"
    : intent.day === "sat" || intent.day === "sun" ? "weekend"
    : intent.window === "evening" ? "weeknight" : "any";
  const [when, setWhen] = useState<WhenTier>(currentWhen);
  const [level, setLevel] = useState<LevelTier | "any">(intent.levelAny ? "any" : intent.level);
  // City is anchored to Profile; the panel only exposes a per-wish override.
  // Empty string here means "use my profile city" — which the reducer resolves.
  const profileCity = (typeof window !== "undefined" ? loadProfileCity() : "");
  const initialCity = intent.city || intent.ownerCity || "";
  const isOverride = !!profileCity && !!initialCity && initialCity.trim().toLowerCase() !== profileCity.trim().toLowerCase();
  const [city, setCity] = useState<string>(isOverride ? initialCity : "");

  const whenOptions: WhenTier[] = ["weekend", "weeknight", "any"];
  const levelOptions: (LevelTier | "any")[] = ["beginner", "intermediate", "advanced", "any"];

  function apply() {
    const patch: { when?: WhenTier; level?: LevelTier; city?: string } = {};
    if (when !== currentWhen) patch.when = when;
    if (showLevel) {
      const cur = intent.levelAny ? "any" : intent.level;
      if (level !== cur && level !== "any") patch.level = level as LevelTier;
    }
    const currentEffective = isOverride ? initialCity : "";
    if (city.trim() !== currentEffective.trim()) patch.city = city.trim();
    onApply(patch);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
          {t("intent.edit_when")}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {whenOptions.map((w) => (
            <button
              key={w}
              onClick={() => setWhen(w)}
              className={[
                "px-3 py-1 rounded-full text-[12px] border transition-colors",
                when === w
                  ? "border-foreground bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-foreground/80 hover:border-foreground/40",
              ].join(" ")}
            >
              {t(`meet.when.${w}`)}
            </button>
          ))}
        </div>
      </div>

      {showLevel && (
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
            {t("intent.edit_level")}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {levelOptions.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={[
                  "px-3 py-1 rounded-full text-[12px] border transition-colors",
                  level === l
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-border bg-secondary text-foreground/80 hover:border-foreground/40",
                ].join(" ")}
              >
                {t(`meet.level.${l}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
            {t("intent.edit_city")}
          </div>
          {profileCity && (
            <div className="text-[10.5px] font-mono text-muted-foreground">
              {t("intent.edit_city_profile", { city: profileCity })}
            </div>
          )}
        </div>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t("intent.edit_city_placeholder", { city: profileCity || "—" })}
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("intent.edit_city_hint")}
        </p>
      </div>

      <button
        onClick={apply}
        className="w-full inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        {t("intent.edit_apply")}
      </button>
    </div>
  );
}

function loadProfileCity(): string {
  try { return loadProfile().city || ""; } catch { return ""; }
}


function IntentCard({ intent, side, lang }: { intent: Intent; side: "me" | "them"; lang: Lang }) {
  const { t } = useTranslation();
  const raw = lang === "zh-CN" ? intent.rawText_zh : intent.rawText;
  const label = side === "me" ? t("intent.you_said") : t("intent.they_said");
  const nameOrYou = side === "me"
    ? t("intent.your_tag")
    : `${lang === "zh-CN" ? intent.ownerName_zh : intent.ownerName}${(lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity) ? " · " + (lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity) : ""}`;

  return (
    <article className="rounded-xl border border-border bg-card p-4 flex flex-col">
      <div className="flex items-center gap-2">
        {side === "them" ? (
          <img src={avatarUrl(intent.ownerId)} alt="" className="w-7 h-7 rounded-full border border-border" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary border border-border grid place-items-center text-[11px] font-mono text-muted-foreground">
            {t("intent.you_short")}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">{label}</div>
          <div className="text-[12px] text-foreground/85 truncate">{nameOrYou}</div>
        </div>
      </div>
      <p className="mt-2.5 text-[13px] text-foreground leading-relaxed">"{raw}"</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Tag>{KIND_EMOJI[intent.kind]} {t(`activity.kind.${intent.kind}`)}</Tag>
        {(() => {
          const cityLabel = lang === "zh-CN" ? (intent.city_zh || intent.city) : (intent.city || intent.city_zh);
          if (!cityLabel) return null;
          // "This wish" badge only on my own card, when the wish city differs
          // from my profile city.
          const profile = side === "me" ? loadProfileCity() : "";
          const overridden = side === "me" && !!profile && cityLabel.trim().toLowerCase() !== profile.trim().toLowerCase();
          return (
            <Tag>
              📍 {cityLabel}
              {overridden && (
                <span className="ml-1 text-muted-foreground">· {t("intent.city_override_badge")}</span>
              )}
            </Tag>
          );
        })()}
        {!intent.whenAny && (
          <Tag>{t(`activity.day.${intent.day}`)} {t(`activity.window.${intent.window}`)}</Tag>
        )}
        {!intent.levelAny && (intent.kind === "tennis" || intent.kind === "climb") && (
          <Tag>{t(`activity.level.${intent.level}`)}</Tag>
        )}
        {intent.whenAny && <Tag>{t("meet.when.any")}</Tag>}
      </div>
    </article>
  );
}

function QuoteLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
        {label}
      </div>
      <p className="mt-0.5 text-[12.5px] text-foreground/90 leading-snug line-clamp-2">
        "{text}"
      </p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary border border-border text-[11px] text-foreground/80">
      {children}
    </span>
  );
}

// ---- No match — my published card + near-miss list ---------------------

function NoMatchView({
  state,
  onRevoke,
  onTryNearMiss,
  onRevokeReshare,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  if (!mine) return <EmptyCanvas />;

  const nears = state.nearMissIds.map((id) => getIntentById(id)).filter(Boolean) as Intent[];
  const exhausted = state.triedIntentIds.length > 0;

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {exhausted ? t("intent.pool_exhausted_label") : t("intent.published_label")}
        </div>
        {exhausted && (
          <p className="mt-2 text-[13px] text-foreground/85 leading-relaxed">
            {t("intent.pool_exhausted_body")}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <IntentCard intent={mine} side="me" lang={lang} />
          <button
            onClick={exhausted ? onRevokeReshare : onRevoke}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            {exhausted ? t("intent.revoke_reshare") : t("intent.revoke")}
          </button>
        </div>


        {nears.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              {t("intent.near_label")}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              {t("intent.near_hint")}
            </p>
            <ul className="mt-3 space-y-2.5">
              {nears.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onTryNearMiss(n.id)}
                    className="w-full text-left rounded-lg border border-border bg-card p-3.5 hover:border-foreground/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <img src={avatarUrl(n.ownerId)} alt="" className="w-6 h-6 rounded-full border border-border" />
                      <div className="text-[12px] text-foreground/85">
                        {lang === "zh-CN" ? n.ownerName_zh : n.ownerName}
                        {(lang === "zh-CN" ? n.ownerCity_zh : n.ownerCity) && (
                          <span className="text-muted-foreground"> · {lang === "zh-CN" ? n.ownerCity_zh : n.ownerCity}</span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-[12.5px] text-foreground/85 leading-relaxed">
                      "{lang === "zh-CN" ? n.rawText_zh : n.rawText}"
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Tag>{t(`activity.day.${n.day}`)} {t(`activity.window.${n.window}`)}</Tag>
                      <Tag>{t(`activity.level.${n.level}`)}</Tag>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}


// (The old session-scoped SavedDrawer has been replaced by the global
// SavedTrigger in the header.)


// ---- Chat view (in-canvas) ---------------------------------------------

function ChatView({ state, onSendChat, onBackToCandidate, onDraftConsumed }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.chatMessages.length]);

  // Pre-fill the composer when the left Agent drafts a line for the user.
  useEffect(() => {
    if (state.pendingDraft) {
      setText(state.pendingDraft);
      onDraftConsumed?.();
      // Focus and place cursor at end so the user can tweak before sending.
      window.setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = el.value.length;
        }
      }, 40);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingDraft]);

  if (!mine || !other) return <EmptyCanvas />;

  function submit() {
    const v = text.trim();
    if (!v) return;
    onSendChat(v);
    setText("");
  }

  const otherName = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const otherCity = lang === "zh-CN" ? other.ownerCity_zh : other.ownerCity;

  return (
    <div className="h-full flex flex-col">
      {/* Back to candidate + slim aligned banner */}
      <div className="border-b border-border bg-emerald-500/5">
        {onBackToCandidate && (
          <button
            type="button"
            onClick={onBackToCandidate}
            className="w-full text-left px-5 pt-2 pb-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            {t("intent.back_to_candidate")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-5 py-2.5 hover:bg-emerald-500/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <img src={avatarUrl(other.ownerId)} alt="" className="w-8 h-8 rounded-full border border-border" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground truncate">{otherName}{otherCity ? ` · ${otherCity}` : ""}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {t("intent.aligned_slim", {
                  kind: t(`activity.kind.${mine.kind}`),
                  day: t(`activity.day.${mine.day}`),
                  window: t(`activity.window.${mine.window}`),
                })}
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {expanded ? t("intent.hide_alignment") : t("intent.show_alignment")}
            </span>
          </div>
          {expanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 pointer-events-none">
              <IntentCard intent={mine} side="me" lang={lang} />
              <IntentCard intent={other} side="them" lang={lang} />
            </div>
          )}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-md mx-auto">
          <ul className="space-y-2.5">
            {state.chatMessages.map((m) => <ChatBubble key={m.id} m={m} />)}
          </ul>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-md mx-auto relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder={t("intent.chat_placeholder")}
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Send"
            className="absolute right-2 bottom-1.5 w-8 h-8 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-25 hover:opacity-90 transition-opacity"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ m }: { m: ChatMsg }) {
  const isMine = m.from === "me";
  return (
    <li className={isMine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[80%] px-3.5 py-2 text-[14px] leading-relaxed",
          isMine
            ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
            : "rounded-2xl rounded-bl-md bg-secondary text-foreground",
        ].join(" ")}
      >
        {m.text}
      </div>
    </li>
  );
}

// ---- Helpers -------------------------------------------------------------

function sharedWhenLabel(a: Intent, b: Intent, t: TFunction): string {
  if (a.day === b.day && a.window === b.window) {
    return `${t(`activity.day.${a.day}`)} ${t(`activity.window.${a.window}`)}`;
  }
  return t(`activity.day.${b.day}`) + " " + t(`activity.window.${b.window}`);
}
function sharedLevelLabel(a: Intent, b: Intent, t: TFunction): string {
  if (a.level === b.level) return t(`activity.level.${a.level}`);
  return t("intent.level_similar");
}

// Silence unused imports for consumers that used to pass X icon here.
export const _KeepX = X;
