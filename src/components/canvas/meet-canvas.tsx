import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowUp,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import type { AppLang } from "@/lib/lang";
import { pickLocaleText, normalizeLang } from "@/lib/lang";
import type { SideState, ChatMsg, LevelTier, WhenTier } from "@/lib/agents/side-by-side";
import { currentView } from "@/lib/agents/side-by-side";
import { getIntentById, type Intent } from "@/lib/intents";
import type { ActivityKind } from "@/lib/types";
import { avatarUrl, getPersonById } from "@/lib/people";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PublicProfileSheet } from "@/components/public-profile-sheet";
import { CanvasSwapShell } from "@/components/canvas/canvas-swap-shell";
import { formatWishContentLines, defaultMatchReason } from "@/lib/wish-display";
import { resolvePlaceOnline } from "@/lib/wish-place";
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
  const swapToken = `${view}:${props.state.myIntentId ?? ""}:${props.state.matchIntentId ?? ""}:${props.state.canvasSwapKey ?? 0}`;

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

  if (view === "match") {
    const mine = resolveMineIntent(props.state);
    const other = props.state.matchIntentId
      ? getIntentById(props.state.matchIntentId)
      : null;
    return (
      <div className="relative h-full">
        <CanvasSwapShell
          swapToken={swapToken}
          queueCursor={props.state.queueCursor}
          className="h-full"
        >
          {mine && other ? (
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
  const mine = resolveMineIntent(state);
  if (!mine) return null;

  const profile = loadProfile();
  const wishLines = formatWishContentLines(mine, lang);

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg space-y-4">
        <WishPublisherHeader profile={profile} lang={lang} />

        <section className="rounded-xl border border-border bg-card px-4 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
            {t("intent.wish_content_label")}
          </div>
          <WishContentBlock lines={wishLines} kind={mine.kind} t={t} />
        </section>

        <p className="text-center text-[12px] text-muted-foreground leading-relaxed px-2">
          {t("intent.published_card_hint")}
        </p>
      </div>
    </div>
  );
}

// ---- Match — their wish first, alignment, slim publisher row ------------

function resolveMineIntent(state: SideState): Intent | null {
  if (state.myIntentId) {
    const found = getIntentById(state.myIntentId);
    if (found) return found;
  }
  if (state.wishDraft?.kind || state.myIntentId) {
    return draftAsIntent(state.wishDraft ?? emptyWishDraft(), {
      profile: loadProfile(),
      hardFilters: state.hardFilters ?? EMPTY_WISH_HARD_FILTERS,
    });
  }
  return null;
}

function MatchView({ state, onStartChat, onSkip, onSave, onSeeNext, onSeePrev, canGoPrev }: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const mine = resolveMineIntent(state);
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
  const [openProfile, setOpenProfile] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const isSaved = useIsSaved(other?.id);

  if (!mine || !other) return null;

  const queueLen = state.rankedQueue?.length ?? 0;
  const queuePos = queueLen > 0 ? (state.queueCursor ?? 0) + 1 : 0;
  const hasQueue = queueLen > 0;
  const otherName = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const otherCity = lang === "zh-CN" ? other.ownerCity_zh : other.ownerCity;
  const isBrowse = state.wishLane === "browse" && !state.myIntentId;
  const compareSectionLabel = isBrowse
    ? t("intent.browse_criteria_label")
    : t("intent.published_label");

  const quality = state.matchQuality ?? "exact";
  const wishLines = formatWishContentLines(other, lang);
  const matchReason =
    state.matchReason?.trim() ||
    defaultMatchReason(lang, {
      crossCity: state.crossCityMatch,
      quality,
      placeOnline: resolvePlaceOnline(other),
    });

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg space-y-4">
        {/* 1. Publisher */}
        <button
          type="button"
          onClick={() => setOpenProfile(true)}
          aria-label={t("intent.open_profile", { name: otherName })}
          className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left hover:bg-muted/40 hover:border-foreground/25 transition-colors"
        >
          <img
            src={avatarUrl(other.ownerId)}
            alt=""
            className="w-11 h-11 rounded-full border border-border shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
              {t("intent.publisher_label")}
            </div>
            <div className="text-[15px] font-medium text-foreground truncate">{otherName}</div>
            {otherCity?.trim() ? (
              <div className="text-[12px] text-muted-foreground truncate">{otherCity}</div>
            ) : null}
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        </button>

        {/* 2. Wish content */}
        <section className="rounded-xl border border-border bg-card px-4 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
            {t("intent.wish_content_label")}
          </div>
          <WishContentBlock lines={wishLines} kind={other.kind} t={t} />
        </section>

        {/* 3. Match reason (prose) */}
        <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
            {t("intent.match_reason_label")}
          </div>
          <p className="mt-2 text-[13.5px] text-foreground leading-relaxed">{matchReason}</p>
        </section>

        {/* Compare mine (optional) */}
        <button
          type="button"
          onClick={() => setCompareOpen((v) => !v)}
          className="w-full text-left text-[12px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          {compareOpen ? t("intent.compare_mine_hide") : t("intent.compare_mine_show")}
        </button>
        {compareOpen && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
              {compareSectionLabel}
            </div>
            <div className="mt-2">
              <IntentCard intent={mine} side="me" lang={lang} />
            </div>
          </div>
        )}

        {/* Actions — matchmaker-style row */}
        <div className="border-t border-border pt-5">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={onStartChat}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-10 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t("intent.start_chat")}
            </button>
            {onSave && (
              <button
                type="button"
                onClick={onSave}
                aria-pressed={isSaved}
                className={[
                  "shrink-0 inline-flex items-center justify-center gap-1.5 min-h-10 px-4 rounded-md border text-[13px] font-medium transition-colors",
                  isSaved
                    ? "border-foreground/70 bg-secondary text-foreground"
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
            )}
            <button
              type="button"
              onClick={onSkip}
              className="shrink-0 inline-flex items-center justify-center min-h-10 px-3 rounded-md border border-red-500/45 text-[13px] font-medium text-red-600 hover:text-red-700 hover:bg-red-500/10 transition-colors"
            >
              {t("intent.not_interested")}
            </button>
            <button
              type="button"
              onClick={onSeePrev}
              disabled={!canGoPrev}
              className="shrink-0 inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t("intent.browse_prev")}
            </button>
            <button
              type="button"
              onClick={hasQueue ? onSeeNext : onSkip}
              disabled={hasQueue ? !onSeeNext : false}
              className="shrink-0 inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              {t("intent.browse_next")}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {hasQueue && (
            <p className="mt-2 text-center text-[11px] font-mono text-muted-foreground tabular-nums">
              {t("intent.queue_position", { current: queuePos, total: queueLen })}
            </p>
          )}
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

  if (!other) return null;

  const showComposerQuote =
    Boolean(state.composerWishQuoteId && attachWishQuote && state.composerWishQuoteId === other.id);

  function submit() {
    const v = text.trim();
    if (!v && !showComposerQuote) return;
    onSendChat(v, { attachWishCard: showComposerQuote });
    setText("");
    setAttachWishQuote(false);
  }

  const otherName = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const otherCity = lang === "zh-CN" ? other.ownerCity_zh : other.ownerCity;
  const bannerKind = mine?.kind ?? other.kind;

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
              src={avatarUrl(other.ownerId)}
              alt=""
              className="w-8 h-8 rounded-full border border-border"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground truncate">
                {otherName}
                {otherCity ? ` · ${otherCity}` : ""}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {mine
                  ? t("intent.aligned_slim", {
                      kind: t(`activity.kind.${bannerKind}`),
                      day: t(`activity.day.${mine.day}`),
                      window: t(`activity.window.${mine.window}`),
                    })
                  : t(`activity.kind.${other.kind}`)}
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {expanded ? t("intent.hide_alignment") : t("intent.show_alignment")}
            </span>
          </div>
          {expanded && mine && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 pointer-events-none">
              <IntentCard intent={mine} side="me" lang={lang} />
              <IntentCard intent={other} side="them" lang={lang} />
            </div>
          )}
          {expanded && !mine && (
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
          {showComposerQuote && (
            <WishQuoteCard
              intent={other}
              lang={lang}
              compact
              onRemove={() => setAttachWishQuote(false)}
            />
          )}
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
