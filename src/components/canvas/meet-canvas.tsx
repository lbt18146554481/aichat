import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUp, ArrowLeft, MessageCircle, SkipForward, Users, X, ChevronRight } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { SideState, ChatMsg, LevelTier, WhenTier } from "@/lib/agents/side-by-side";
import { currentView } from "@/lib/agents/side-by-side";
import { countAvailableMatches, getIntentById, type Intent } from "@/lib/intents";
import type { ActivityKind } from "@/lib/types";
import { avatarUrl, getPersonById } from "@/lib/people";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";


interface Props {
  state: SideState;
  onStartChat: () => void;
  onRevoke: () => void;
  onTryNearMiss: (intentId: string) => void;
  onSendChat: (text: string) => void;
  onEditWish: (patch: { when?: WhenTier; level?: LevelTier; location?: string }) => void;
  onSkip: () => void;
  onRevokeReshare: () => void;
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
  if (view === "chat") return <ChatView {...props} />;
  if (view === "match") return <MatchView {...props} />;
  if (view === "nomatch") return <NoMatchView {...props} />;
  return <EmptyCanvas />;
}

// ---- Empty ---------------------------------------------------------------

function EmptyCanvas() {
  const { t } = useTranslation();
  return (
    <div className="h-full grid place-items-center px-8 py-12">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="mt-5 text-[18px] font-medium text-foreground leading-snug">
          {t("meet.empty_title")}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
          {t("meet.empty_hint")}
        </p>
      </div>
    </div>
  );
}

// ---- Match — two intent cards side by side + [start chat] --------------

function MatchView({ state, onStartChat, onSkip }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
  const [openProfile, setOpenProfile] = useState(false);

  if (!mine || !other) return <EmptyCanvas />;

  const alignedKind = t(`activity.kind.${mine.kind}`);
  const alignedWhen = sharedWhenLabel(mine, other, t);
  const alignedLevel = sharedLevelLabel(mine, other, t);
  // Remaining candidates = everyone still matchable minus the current TA.
  const remaining = Math.max(
    0,
    countAvailableMatches(mine, { exclude: state.triedIntentIds }) - 1,
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

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("intent.match_label")}
          </div>
          {remaining > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {t("intent.pool_remaining", { count: remaining })}
            </div>
          )}
        </div>

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
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t("intent.start_chat")}
          </button>
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

        <p className="mt-4 text-[11.5px] text-muted-foreground leading-relaxed text-center">
          {t("intent.match_footnote")}
        </p>
      </div>

      <PersonProfileSheet
        open={openProfile}
        onOpenChange={setOpenProfile}
        mine={mine}
        other={other}
        lang={lang}
        onStartChat={() => {
          setOpenProfile(false);
          onStartChat();
        }}
      />
    </div>
  );
}

// ---- Person profile sheet (opened from the identity row) ---------------

const ONE_WORK_EMOJI: Record<string, string> = {
  book: "📖", film: "🎬", music: "🎵", exhibition: "🖼", food: "🍜", other: "✨",
};

function PersonProfileSheet({
  open,
  onOpenChange,
  mine,
  other,
  lang,
  onStartChat,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mine: Intent;
  other: Intent;
  lang: Lang;
  onStartChat: () => void;
}) {
  const { t } = useTranslation();
  const person = getPersonById(other.ownerId);

  const name = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const city = lang === "zh-CN" ? other.ownerCity_zh : other.ownerCity;
  const occupation = person
    ? (lang === "zh-CN" ? person.occupation_zh : person.occupation)
    : "";
  const metaParts = [city, occupation].filter((s) => s && s.trim().length > 0);

  const brief = person?.personBrief
    ? (lang === "zh-CN" ? person.personBrief.zh : person.personBrief.en)
    : "";
  const oneWork = person?.oneWork;
  const oneWorkTitle = oneWork
    ? (lang === "zh-CN" && oneWork.title_zh ? oneWork.title_zh : oneWork.title)
    : "";
  const oneWorkWhy = oneWork
    ? (lang === "zh-CN" ? oneWork.why_zh : oneWork.why)
    : "";
  const moments = (person?.moments ?? [])
    .slice(0, 3)
    .map((m) => (lang === "zh-CN" ? m.answer_zh : m.answer))
    .filter((s) => s && s.trim().length > 0);

  const rawMine = lang === "zh-CN" ? mine.rawText_zh : mine.rawText;
  const rawTheirs = lang === "zh-CN" ? other.rawText_zh : other.rawText;

  const alignedTag = `${KIND_EMOJI[mine.kind]} ${t(`activity.kind.${mine.kind}`)}${
    mine.whenAny ? "" : ` · ${t(`activity.day.${mine.day}`)} ${t(`activity.window.${mine.window}`)}`
  }${
    !mine.levelAny && (mine.kind === "tennis" || mine.kind === "climb")
      ? ` · ${t(`activity.level.${mine.level}`)}`
      : ""
  }`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        {/* Header */}
        <div className="px-6 pt-8 pb-5 border-b border-border">
          <div className="flex items-center gap-4">
            <img
              src={avatarUrl(other.ownerId)}
              alt=""
              className="w-16 h-16 rounded-full border border-border shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[18px] font-medium text-foreground leading-tight truncate">
                {name}
                {person?.age ? <span className="text-muted-foreground font-normal">, {person.age}</span> : null}
              </div>
              {metaParts.length > 0 && (
                <div className="mt-1 text-[13px] text-muted-foreground truncate">
                  {metaParts.join(" · ")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {brief && (
            <section>
              <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
                {t("intent.sheet.about_ta")}
              </div>
              <p className="mt-2 text-[13.5px] text-foreground/90 leading-relaxed">
                {brief}
              </p>
            </section>
          )}

          {oneWork && oneWorkTitle && (
            <section>
              <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
                {t("intent.sheet.one_work")}
              </div>
              <div className="mt-2 rounded-lg border border-border bg-card px-3.5 py-3">
                <div className="text-[13.5px] text-foreground">
                  <span className="mr-1.5">{ONE_WORK_EMOJI[oneWork.kind] ?? "✨"}</span>
                  {oneWorkTitle}
                </div>
                {oneWorkWhy && (
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed italic">
                    "{oneWorkWhy}"
                  </p>
                )}
              </div>
            </section>
          )}

          {moments.length > 0 && (
            <section>
              <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
                {t("intent.sheet.moments")}
              </div>
              <ul className="mt-2 space-y-2">
                {moments.map((m, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-foreground/85 leading-relaxed">
                    <span className="text-muted-foreground/70 shrink-0">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
              {t("intent.sheet.aligning")}
            </div>
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-border bg-card px-3.5 py-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
                  {t("intent.you_said")}
                </div>
                <p className="mt-1 text-[13px] text-foreground leading-relaxed">"{rawMine}"</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3.5 py-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
                  {t("intent.they_said")}
                </div>
                <p className="mt-1 text-[13px] text-foreground leading-relaxed">"{rawTheirs}"</p>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary border border-border text-[11px] text-foreground/80">
                  {alignedTag}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Sticky CTA */}
        <div className="border-t border-border bg-background px-6 py-4">
          <button
            onClick={onStartChat}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t("intent.start_chat")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}



// ---- Why is TA (demo copy from PEOPLE.whyPersonLine) -------------------

const TOLD_KEY = "kindred:told-agent-pref";

function WhyPersonBox({ otherOwnerId, lang }: { otherOwnerId: string; lang: Lang }) {
  const { t } = useTranslation();
  const person = getPersonById(otherOwnerId);
  const line = person?.whyPersonLine
    ? (lang === "zh-CN" ? person.whyPersonLine.zh : person.whyPersonLine.en)
    : null;

  // Demo "fallback" state: user hasn't told the Agent yet.
  // Triggered by `?fresh=1` in the URL. Once they type a line, we flip to told.
  const [hasTold, setHasTold] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const fresh = new URLSearchParams(window.location.search).get("fresh") === "1";
    if (!fresh) return true;
    return window.localStorage.getItem(TOLD_KEY) === "1";
  });
  const [draft, setDraft] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  function submit() {
    const v = draft.trim();
    if (!v) return;
    try { window.localStorage.setItem(TOLD_KEY, "1"); } catch {}
    setHasTold(true);
    setJustSaved(true);
  }

  if (!hasTold) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] font-mono text-amber-700 dark:text-amber-400">
          <Sparkles className="w-3 h-3" />
          {t("intent.why_person_label")}
        </div>
        <p className="mt-1.5 text-[13px] text-foreground/85 leading-relaxed">
          {t("intent.tell_agent_empty")}
        </p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={t("intent.tell_agent_placeholder")}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40"
          />
          <button
            onClick={submit}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
          >
            {t("intent.tell_agent_submit")}
          </button>
        </div>
      </div>
    );
  }

  if (!line) return null;

  return (
    <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] font-mono text-emerald-700 dark:text-emerald-400">
        <Sparkles className="w-3 h-3" />
        {t("intent.why_person_label")}
      </div>
      <p className="mt-1.5 text-[14px] text-foreground leading-relaxed">
        {line}
      </p>
      {justSaved && (
        <p className="mt-2 text-[11.5px] text-emerald-700 dark:text-emerald-400">
          {t("intent.tell_agent_thanks")}
        </p>
      )}
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
  onApply: (patch: { when?: WhenTier; level?: LevelTier; location?: string }) => void;
}) {
  const { t } = useTranslation();
  const currentWhen: WhenTier = intent.whenAny
    ? "any"
    : intent.day === "sat" || intent.day === "sun" ? "weekend"
    : intent.window === "evening" ? "weeknight" : "any";
  const [when, setWhen] = useState<WhenTier>(currentWhen);
  const [level, setLevel] = useState<LevelTier | "any">(intent.levelAny ? "any" : intent.level);
  const [location, setLocation] = useState<string>(intent.location ?? "");

  const whenOptions: WhenTier[] = ["weekend", "weeknight", "any"];
  const levelOptions: (LevelTier | "any")[] = ["beginner", "intermediate", "advanced", "any"];

  function apply() {
    const patch: { when?: WhenTier; level?: LevelTier; location?: string } = {};
    if (when !== currentWhen) patch.when = when;
    if (showLevel) {
      const cur = intent.levelAny ? "any" : intent.level;
      if (level !== cur && level !== "any") patch.level = level as LevelTier;
    }
    if ((intent.location ?? "") !== location) patch.location = location;
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
                  ? "border-foreground bg-foreground text-background"
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
                    ? "border-foreground bg-foreground text-background"
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
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
          {t("intent.edit_location")}
        </div>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("intent.edit_location_placeholder")}
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40"
        />
      </div>

      <button
        onClick={apply}
        className="w-full inline-flex items-center justify-center px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        {t("intent.edit_apply")}
      </button>
    </div>
  );
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
        {!intent.whenAny && (
          <Tag>{t(`activity.day.${intent.day}`)} {t(`activity.window.${intent.window}`)}</Tag>
        )}
        {!intent.levelAny && (intent.kind === "tennis" || intent.kind === "climb") && (
          <Tag>{t(`activity.level.${intent.level}`)}</Tag>
        )}
        {intent.whenAny && <Tag>{t("meet.when.any")}</Tag>}
        {side === "me" && intent.location && <Tag>📍 {intent.location}</Tag>}

      </div>
    </article>
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

function NoMatchView({ state, onRevoke, onTryNearMiss, onRevokeReshare }: Props) {
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
            className="absolute right-2 bottom-1.5 w-8 h-8 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-25 hover:opacity-90 transition-opacity"
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
            ? "rounded-2xl rounded-br-md bg-foreground text-background"
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
