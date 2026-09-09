import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowUp,
  MessageCircle,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { AppLang } from "@/lib/lang";
import { pickLocaleText, normalizeLang } from "@/lib/lang";
import type { SideState, ChatMsg, LevelTier, WhenTier } from "@/lib/agents/side-by-side";
import { currentView, sessionWishIds } from "@/lib/agents/side-by-side";
import { getIntentById, type Intent } from "@/lib/intents";
import type { ActivityKind } from "@/lib/types";
import { avatarUrl, getPersonById } from "@/lib/people";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PublicProfileSheet } from "@/components/public-profile-sheet";
import { CanvasSwapShell } from "@/components/canvas/canvas-swap-shell";
import { formatWishContentLines } from "@/lib/wish-display";
import { WishQuoteCard, WishQuoteChatBubble } from "@/components/wish-quote-card";

import { useIsSaved } from "@/components/saved-trigger";
import { draftAsIntent } from "@/lib/wish-draft-intent";
import { EMPTY_WISH_HARD_FILTERS, emptyWishDraft } from "@/lib/wish-types";
import { loadProfile } from "@/lib/profile";
import { WishPublishForm } from "@/components/wish-publish-form";
import { WishPublisherHeader } from "@/components/wish-publisher-header";

interface Props {
  state: SideState;
  onStartChat: () => void;
  onRevoke: () => void;
  onTryNearMiss: (intentId: string) => void;
  onSendChat: (text: string, opts?: { attachWishCard?: boolean }) => void;
  onEditWish: (patch: { when?: WhenTier; level?: LevelTier; city?: string }) => void;
  onSkip: () => void;
  onRevokeReshare: () => void;
  /** Bookmark the current match candidate. */
  onSave?: () => void;
  /** Remove someone from the saved list. */
  onUnsave?: (intentId: string) => void;
  /** Browse ranked queue — next (see mode). */
  onSeeNext?: () => void;
  /** Browse ranked queue — previous. */
  onSeePrev?: () => void;
  canGoPrev?: boolean;
  /** Start a chat directly with a saved candidate. */
  onChatWithSaved?: (intentId: string) => void;
  /** Return from the TA chat back to the candidate card without ending the wish. */
  onBackToCandidate?: () => void;
  /** Called after the composer has consumed state.pendingDraft. */
  onDraftConsumed?: () => void;
  /** Submit or cancel the publish form on the right pane. */
  onPublishResolve?: (value: string | null) => void;
  publishPlaceError?: string | null;
  publishDisabled?: boolean;
}

const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾",
  run: "🏃",
  climb: "🧗",
  cook: "🍳",
  exhibition: "🖼",
  bookstore: "📚",
  other: "✨",
};

export function MeetCanvas(props: Props) {
  const view = currentView(props.state);
  const swapToken = `${view}:${props.state.currentPersonId ?? ""}:${props.state.myIntentId ?? ""}:${props.state.matchIntentId ?? ""}:${props.state.canvasSwapKey ?? 0}`;

  if (view === "chat") {
    return (
      <div className="relative h-full">
        <ChatView {...props} />
      </div>
    );
  }

  if (view === "publish") {
    return (
      <div className="relative h-full">
        <PublishView {...props} />
      </div>
    );
  }

  if (view === "mine") {
    return (
      <div className="relative h-full">
        <CanvasSwapShell swapToken={swapToken} className="h-full">
          <PublishedWishView state={props.state} />
        </CanvasSwapShell>
      </div>
    );
  }

  if (view === "hanging") {
    return (
      <div className="relative h-full">
        <CanvasSwapShell swapToken={swapToken} className="h-full">
          <HangingInviteView {...props} />
        </CanvasSwapShell>
      </div>
    );
  }

  if (view === "match") {
    const personId =
      props.state.currentPersonId ??
      (props.state.matchIntentId ? getIntentById(props.state.matchIntentId)?.ownerId : null);
    const other = props.state.matchIntentId ? getIntentById(props.state.matchIntentId) : null;
    const mine = resolveMineIntent(props.state);
    return (
      <div className="relative h-full">
        <CanvasSwapShell
          swapToken={swapToken}
          queueCursor={props.state.queueCursor}
          className="h-full"
        >
          {personId ? (
            <MatchView {...props} />
          ) : other ? (
            <MatchView {...props} />
          ) : mine ? (
            <PublishedWishView state={props.state} />
          ) : null}
        </CanvasSwapShell>
      </div>
    );
  }

  return null;
}

function PublishView({
  state,
  onPublishResolve,
  publishPlaceError,
  publishDisabled,
}: Props) {
  const { t } = useTranslation();
  const profileCity = loadProfileCity();

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-lg">
        <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-4">
          {t("intent.wish_form.panel_label")}
        </div>
        <WishPublishForm
          variant="canvas"
          prompt={state.pendingConfirm ?? undefined}
          draft={state.wishDraft ?? emptyWishDraft()}
          understandingNotes={state.understanding?.notes ?? []}
          profileCity={profileCity}
          placeError={publishPlaceError ?? undefined}
          confirmLabel={t("intent.publish_confirm")}
          cancelLabel={t("intent.publish_edit")}
          disabled={publishDisabled}
          onResolve={(value) => onPublishResolve?.(value)}
        />
      </div>
    </div>
  );
}

function PublishedWishView({ state }: { state: SideState }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const ids = sessionWishIds(state);
  const newestFirst = [...ids].reverse();
  const draftOnly = newestFirst.length === 0 ? resolveMineIntent(state) : null;
  if (newestFirst.length === 0 && !draftOnly) return null;

  const profile = loadProfile();
  const cards: Array<{ id: string; intent: Intent; active: boolean }> = newestFirst.length
    ? newestFirst
        .map((id) => {
          const intent =
            getIntentById(id) ??
            (id === state.myIntentId ? resolveMineIntent(state) : null);
          if (!intent) return null;
          return { id, intent, active: id === state.myIntentId };
        })
        .filter((x): x is { id: string; intent: Intent; active: boolean } => Boolean(x))
    : draftOnly
      ? [{ id: "draft", intent: draftOnly, active: true }]
      : [];

  if (cards.length === 0) return null;

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg space-y-5">
        <WishPublisherHeader profile={profile} lang={lang} />

        {cards.length > 1 ? (
          <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
            {t("intent.session_wishes_label", { count: cards.length })}
          </div>
        ) : null}

        {cards.map(({ id, intent, active }) => {
          const wishLines = formatWishContentLines(intent, lang);
          return (
            <section
              key={id}
              className={[
                "rounded-xl border bg-card px-4 py-3.5 space-y-2",
                active && cards.length > 1 ? "border-foreground/30" : "border-border",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
                  {t("intent.wish_content_label")}
                </div>
                {active && cards.length > 1 ? (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {t("intent.session_wish_active")}
                  </span>
                ) : null}
              </div>
              <WishContentBlock lines={wishLines} kind={intent.kind} t={t} />
            </section>
          );
        })}

        <p className="text-center text-[12px] text-muted-foreground leading-relaxed px-2">
          {cards.length > 1
            ? t("intent.session_wishes_hint")
            : t("intent.published_card_hint")}
        </p>
      </div>
    </div>
  );
}

// ---- Match — their wish first, alignment, slim publisher row ------------

/** Mirror server `draftSearchable` / `resolveRecallMine` so the canvas can
 *  render browse matches when the draft has activity text but no kind enum. */
function draftIsSearchable(
  draft: SideState["wishDraft"],
): boolean {
  if (!draft) return false;
  return (
    draft.kind != null ||
    Boolean(draft.activityCore?.trim()) ||
    (draft.rawText?.trim().length ?? 0) >= 2
  );
}

function resolveMineIntent(state: SideState): Intent | null {
  if (state.myIntentId) {
    const found = getIntentById(state.myIntentId);
    if (found) return found;
  }
  if (
    draftIsSearchable(state.wishDraft) ||
    state.myIntentId ||
    (state.wishLane === "browse" && Boolean(state.matchIntentId))
  ) {
    return draftAsIntent(state.wishDraft ?? emptyWishDraft(), {
      profile: loadProfile(),
      hardFilters: state.hardFilters ?? EMPTY_WISH_HARD_FILTERS,
    });
  }
  return null;
}

function MatchView({ state, onStartChat, onSkip, onSave, onSeeNext }: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const personId =
    state.currentPersonId ??
    (state.matchIntentId ? getIntentById(state.matchIntentId)?.ownerId : null) ??
    null;
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
  const person = personId ? getPersonById(personId) : null;
  const [openProfile, setOpenProfile] = useState(false);
  const wishSaved = useIsSaved(personId ?? other?.id);
  const isSaved = personId
    ? (state.savedPersonIds ?? []).includes(personId) || wishSaved
    : wishSaved;

  if (!person && !other) return null;

  const otherName = person
    ? lang === "zh-CN"
      ? person.name_zh || person.name
      : person.name
    : lang === "zh-CN"
      ? other!.ownerName_zh
      : other!.ownerName;
  const otherCity = person
    ? lang === "zh-CN"
      ? person.city_zh || person.city
      : person.city
    : lang === "zh-CN"
      ? other!.ownerCity_zh
      : other!.ownerCity;
  const otherOccupation = person
    ? lang === "zh-CN"
      ? person.occupation_zh
      : person.occupation
    : "";
  const identityMetaParts = [otherCity, otherOccupation].filter((s) => s && s.trim().length > 0);
  const avatarId = person?.id ?? other!.ownerId;

  const whyTags =
    (state.whyTags?.length ?? 0) > 0
      ? state.whyTags!
      : other
        ? [
            `${KIND_EMOJI[other.kind]} ${t(`activity.kind.${other.kind}`)}`,
            sharedWhenLabel(other, other, t),
            sharedLevelLabel(other, other, t),
          ]
        : [];

  const onNext = onSeeNext ?? onSkip;

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => setOpenProfile(true)}
          aria-label={t("intent.open_profile", { name: otherName })}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 hover:border-foreground/25 transition-colors"
        >
          <img
            src={avatarUrl(avatarId)}
            alt=""
            className="w-12 h-12 rounded-full border border-border shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-foreground truncate">{otherName}</div>
            {identityMetaParts.length > 0 ? (
              <div className="text-[12px] text-muted-foreground truncate">
                {identityMetaParts.join(" · ")}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5 text-muted-foreground">
            <span className="text-[9.5px] font-mono uppercase tracking-[0.14em]">
              {t("intent.more_hint")}
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>

        <WhyPersonBox summary={state.personSummary} otherOwnerId={avatarId} lang={lang} />

        {whyTags.length > 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
              {t("intent.aligned_label")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {whyTags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onStartChat}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-md bg-primary text-primary-foreground text-[13.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t("intent.start_chat")}
          </button>
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              aria-pressed={isSaved}
              title={isSaved ? t("intent.unsave") : t("intent.save_hint")}
              className={[
                "inline-flex items-center gap-1.5 min-h-11 px-3 rounded-md border text-[13px] transition-colors",
                isSaved
                  ? "bg-primary text-primary-foreground border-foreground hover:opacity-90"
                  : "border-border text-foreground/85 hover:bg-secondary",
              ].join(" ")}
            >
              {isSaved ? (
                <BookmarkCheck className="w-3.5 h-3.5" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
              {isSaved ? t("intent.saved") : t("intent.save")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-md border border-border text-[13px] text-foreground/85 hover:bg-secondary transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            {t("intent.next_match")}
          </button>
        </div>
      </div>

      <PublicProfileSheet
        person={person ?? null}
        open={openProfile}
        onOpenChange={setOpenProfile}
      />
    </div>
  );
}

function HangingInviteView({ state, onRevoke }: Props) {
  const { t } = useTranslation();
  const invite = state.hangingInvite;
  if (!invite) return null;

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-3">
          {t("intent.hanging_label")}
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-4 space-y-3">
          <p className="text-[14.5px] text-foreground leading-relaxed">{invite.summary}</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            {t("intent.hanging_hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onRevoke}
          className="mt-4 w-full min-h-11 rounded-md border border-border text-[13.5px] text-foreground hover:bg-muted/50 transition-colors"
        >
          {t("intent.hanging_revoke")}
        </button>
      </div>
    </div>
  );
}

function WhyPersonBox({
  summary,
  otherOwnerId,
  lang,
}: {
  summary?: string;
  otherOwnerId: string;
  lang: AppLang;
}) {
  const { t } = useTranslation();
  const person = getPersonById(otherOwnerId);
  const line =
    summary?.trim() ||
    (person?.whyPersonLine
      ? lang === "zh-CN"
        ? person.whyPersonLine.zh
        : person.whyPersonLine.en
      : null);
  if (!line) return null;

  return (
    <div className="mt-5 rounded-xl border border-border bg-secondary/40 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
        <Sparkles className="w-3 h-3" />
        {t("why.agent_read")}
      </div>
      <p className="mt-1.5 text-[13.5px] text-foreground/90 leading-relaxed">{line}</p>
    </div>
  );
}

function sharedWhenLabel(a: Intent, b: Intent, t: TFunction): string {
  if (a.day === b.day && a.window === b.window) {
    return `${t(`activity.day.${a.day}`)} ${t(`activity.window.${a.window}`)}`;
  }
  return `${t(`activity.day.${b.day}`)} ${t(`activity.window.${b.window}`)}`;
}

function sharedLevelLabel(a: Intent, b: Intent, t: TFunction): string {
  if (a.level === b.level) return t(`activity.level.${a.level}`);
  return t("intent.level_similar");
}

function WishContentBlock({
  lines,
  kind,
  t,
}: {
  lines: ReturnType<typeof formatWishContentLines>;
  kind: ActivityKind;
  t: TFunction;
}) {
  return (
    <dl className="mt-3 space-y-2.5">
      <WishContentRow label={t("intent.wish_time_label")} value={lines.time} />
      <WishContentRow label={t("intent.wish_place_label")} value={lines.place} />
      <WishContentRow
        label={t("intent.wish_activity_label")}
        value={
          lines.activity ? (
            <>
              <span className="mr-1.5">{KIND_EMOJI[kind]}</span>
              {lines.activity}
            </>
          ) : (
            <span className="text-muted-foreground">{t(`activity.kind.${kind}`)}</span>
          )
        }
      />
      <WishContentRow label={t("intent.wish_buddy_pref_label")} value={lines.buddyPref} />
    </dl>
  );
}

function WishContentRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-[13px] leading-relaxed">
      <dt className="text-muted-foreground font-mono text-[11px] uppercase tracking-wide pt-0.5">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function loadProfileCity(): string {
  try {
    return loadProfile().city || "";
  } catch {
    return "";
  }
}

function IntentCard({
  intent,
  side,
  lang,
  showOwnerHeader = true,
}: {
  intent: Intent;
  side: "me" | "them";
  lang: AppLang;
  showOwnerHeader?: boolean;
}) {
  const { t } = useTranslation();
  const raw = lang === "zh-CN" ? intent.rawText_zh : intent.rawText;
  const label = side === "me" ? t("intent.you_said") : t("intent.they_said");
  const nameOrYou =
    side === "me"
      ? t("intent.your_tag")
      : `${lang === "zh-CN" ? intent.ownerName_zh : intent.ownerName}${(lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity) ? " · " + (lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity) : ""}`;
  const venueLabel = pickLocaleText(lang, intent.venue, intent.venue_zh);

  return (
    <article className="rounded-xl border border-border bg-card p-4 flex flex-col">
      {showOwnerHeader && (
        <div className="flex items-center gap-2">
          {side === "them" ? (
            <img
              src={avatarUrl(intent.ownerId)}
              alt=""
              className="w-7 h-7 rounded-full border border-border"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-secondary border border-border grid place-items-center text-[11px] font-mono text-muted-foreground">
              {t("intent.you_short")}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
              {label}
            </div>
            <div className="text-[12px] text-foreground/85 truncate">{nameOrYou}</div>
          </div>
        </div>
      )}
      <p
        className={
          showOwnerHeader
            ? "mt-2.5 text-[13px] text-foreground leading-relaxed"
            : "text-[13.5px] text-foreground leading-relaxed"
        }
      >
        "{raw}"
      </p>
      <div className={showOwnerHeader ? "mt-2.5 flex flex-wrap gap-1.5" : "mt-3 flex flex-wrap gap-1.5"}>
        <Tag>
          {KIND_EMOJI[intent.kind]} {t(`activity.kind.${intent.kind}`)}
        </Tag>
        {(() => {
          const cityLabel = pickLocaleText(
            lang,
            intent.city || intent.ownerCity,
            intent.city_zh || intent.ownerCity_zh,
          );
          if (!cityLabel) return null;
          // "This wish" badge only on my own card, when the wish city differs
          // from my profile city.
          const profile = side === "me" ? loadProfileCity() : "";
          const overridden =
            side === "me" &&
            !!profile &&
            cityLabel.trim().toLowerCase() !== profile.trim().toLowerCase();
          return (
            <Tag>
              📍 {cityLabel}
              {overridden && (
                <span className="ml-1 text-muted-foreground">
                  · {t("intent.city_override_badge")}
                </span>
              )}
            </Tag>
          );
        })()}
        {venueLabel?.trim() && <Tag>📌 {venueLabel}</Tag>}
        {!intent.whenAny && (
          <Tag>
            {t(`activity.day.${intent.day}`)} {t(`activity.window.${intent.window}`)}
          </Tag>
        )}
        {!intent.levelAny && (intent.kind === "tennis" || intent.kind === "climb") && (
          <Tag>{t(`activity.level.${intent.level}`)}</Tag>
        )}
        {intent.whenAny && <Tag>{t("meet.when.any")}</Tag>}
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

// ---- Chat view (in-canvas) ---------------------------------------------

function ChatView({ state, onSendChat, onBackToCandidate, onDraftConsumed }: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [attachWishQuote, setAttachWishQuote] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mine = resolveMineIntent(state);
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
  const personId =
    state.currentPersonId ?? (other ? other.ownerId : null);
  const person = personId ? getPersonById(personId) : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.chatMessages.length]);

  useEffect(() => {
    if (state.composerWishQuoteId) setAttachWishQuote(true);
  }, [state.composerWishQuoteId]);

  // Pre-fill the composer when the left Agent drafts a line for the user.
  useEffect(() => {
    if (state.pendingDraft) {
      setText(state.pendingDraft);
      onDraftConsumed?.();
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

  if (!person && !other) return null;

  const showComposerQuote =
    Boolean(other && state.composerWishQuoteId && attachWishQuote && state.composerWishQuoteId === other.id);

  function submit() {
    const v = text.trim();
    if (!v && !showComposerQuote) return;
    onSendChat(v, { attachWishCard: showComposerQuote });
    setText("");
    setAttachWishQuote(false);
  }

  const otherName = person
    ? lang === "zh-CN"
      ? person.name_zh || person.name
      : person.name
    : lang === "zh-CN"
      ? other!.ownerName_zh
      : other!.ownerName;
  const otherCity = person
    ? lang === "zh-CN"
      ? person.city_zh || person.city
      : person.city
    : lang === "zh-CN"
      ? other!.ownerCity_zh
      : other!.ownerCity;
  const avatarId = person?.id ?? other!.ownerId;
  const bannerKind = mine?.kind ?? other?.kind;

  return (
    <div className="h-full flex flex-col">
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
            <img
              src={avatarUrl(avatarId)}
              alt=""
              className="w-8 h-8 rounded-full border border-border"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground truncate">
                {otherName}
                {otherCity ? ` · ${otherCity}` : ""}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {mine && bannerKind
                  ? t("intent.aligned_slim", {
                      kind: t(`activity.kind.${bannerKind}`),
                      day: t(`activity.day.${mine.day}`),
                      window: t(`activity.window.${mine.window}`),
                    })
                  : state.wishDraft?.activityCore?.trim() ||
                    (other ? t(`activity.kind.${other.kind}`) : t("intent.start_chat"))}
              </div>
            </div>
            {other ? (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {expanded ? t("intent.hide_alignment") : t("intent.show_alignment")}
              </span>
            ) : null}
          </div>
          {expanded && mine && other && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 pointer-events-none">
              <IntentCard intent={mine} side="me" lang={lang} />
              <IntentCard intent={other} side="them" lang={lang} />
            </div>
          )}
          {expanded && !mine && other && (
            <div className="mt-3 pointer-events-none">
              <IntentCard intent={other} side="them" lang={lang} />
            </div>
          )}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-md mx-auto">
          {state.chatMessages.length === 0 && (
            <p className="text-[12.5px] text-muted-foreground text-center py-8 leading-relaxed">
              {t("intent.chat_empty_hint")}
            </p>
          )}
          <ul className="space-y-2.5">
            {state.chatMessages.map((m) => (
              <ChatBubble key={m.id} m={m} lang={lang} />
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-md mx-auto space-y-2">
          {showComposerQuote && other ? (
            <WishQuoteCard
              intent={other}
              lang={lang}
              compact
              onRemove={() => setAttachWishQuote(false)}
            />
          ) : null}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={t("intent.chat_placeholder")}
              className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() && !showComposerQuote}
              aria-label="Send"
              className="absolute right-2 bottom-2 w-8 h-8 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-25 hover:opacity-90 transition-opacity"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ m, lang }: { m: ChatMsg; lang: AppLang }) {
  const isMine = m.from === "me";
  if (m.kind === "wish_card" && m.wishIntentId) {
    const intent = getIntentById(m.wishIntentId);
    if (!intent) return null;
    return (
      <li className={isMine ? "flex justify-end" : "flex justify-start"}>
        <WishQuoteChatBubble intent={intent} lang={lang} fromMe={isMine} />
      </li>
    );
  }
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
// Silence unused export for tree-shaking consumers.
export {};
