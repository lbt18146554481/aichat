import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { SideBySideHints } from "./handoff";
import {
  getIntentById,
  publishMyIntent,
  type Intent,
  type MatchQuality,
} from "./intents";
import { chatCompletionJsonStream } from "./llm.server";
import { runSideExtract } from "./side-extract.server";
import { generateMatchReason } from "./side-match-reason.server";
import { log } from "./logger.server";
import { selfVoiceRule, agentCapabilityIntroRule, isAgentFirstReply } from "./agent-voice";
import { profileSummaryForPrompt } from "./profile-summary";
import {
  pickNextFromRecall,
  WISH_RECALL_LIMIT,
} from "./wish-recall";
import { recallWishCandidatesServer, prewarmWishRecallCache } from "./wish-recall.server";
import { runSideWishRank } from "./side-rank.server";
import {
  advanceSideWishQueue,
  carrierFromSideState,
  matchMetaForIntent,
  queueBrowseReply,
  queueExhaustedReply,
  sideWishQueueFingerprint,
} from "./side-queue";
import {
  type SideLang,
  type WishDraft,
  type WishHardFilters,
  type BuddyHardFilters,
  EMPTY_WISH_HARD_FILTERS,
  EMPTY_BUDDY_HARD_FILTERS,
  emptyWishDraft,
} from "./wish-types";
import { ownerSnapshotFromProfile } from "./owner-snapshot";
import {
  formatUserAskResolutionForLlm,
  parseAskUserInfoArgs,
  ACTIVITY_PLACE_FIELD_KEY,
  type PendingUserAsk,
  type UserAskResolution,
} from "./ask-user-info";
import { llmReplyLanguageRule, resolveReplyLang, type AppLang } from "./lang";
import { formatDateRangeLine, formatNowContext, intentDateRange, resolveDraftDates } from "./wish-date";
import { assessWishClarifyProgress, isBrowseClarifyComplete, wishClarifyPromptSection } from "./wish-clarify";
import { applySideBuddyColdStart, applySidePlaceColdStart } from "./cold-start-prefs";
import {
  assessWishPublishClarifyProgress,
  buildPublishConfirmRecap,
  isPublishFormAcknowledgement,
  publishClarifyHistory,
  publishFormNudgeReply,
  resolvePublishFormOpen,
} from "./wish-publish-clarify";
import { runPlaceExtract } from "./place-extract.server";
import { runBuddyPrefExtract } from "./buddy-pref-extract.server";
import {
  cityLabelsFromPlace,
  citiesFromPlaceFields,
  isPlaceAny,
  legacyFlagsFromSpec,
  normalizePlaceSpec,
  resolvePlaceRaw,
} from "./wish-place";
import { cityLabelsForId } from "./geo";
import { wishDescriptionsFromDraft } from "./wish-match-profile";
import {
  type WishLane,
  canSwitchWishLane,
  detectWishLaneSwitch,
  inferWishLaneFromText,
  isOfferMatchAffirmation,
  isOfferMatchDecline,
  isNonWishDraftSeed,
  isVagueExploreWishSeed,
  isWishLaneSelectionMessage,
} from "./wish-lane";
import { draftAsIntent } from "./wish-draft-intent";
import { runSideMatchIntroReply } from "./side-match-followup-llm.server";
import { executeSidePeopleMatch } from "./side-people-match.server";
import { EMPTY_HARD_FILTERS } from "./match-types";
import { applyMatchmakerColdStart } from "./cold-start-prefs";
import { sidePlaceHardFilters } from "./side-people-recall";
import {
  createSideToolState,
  executeSideTool,
  type SideToolState,
} from "./side-tools.server";

const LAZY_SIDE_TOOL_NAMES = new Set([
  "search_wishes",
  "preview_wish_matches",
  "show_my_wishes",
]);

export type SideTurnAction =
  | "start"
  | "message"
  | "confirm_publish"
  | "confirm_browse"
  | "confirm_match"
  | "skip_match"
  | "see_next"
  | "rematch"
  | "rematch_hang"
  | "resolve_user_ask";

export interface SideTurnInput {
  /** UI locale (i18n). Cards / canvas only — not LLM system or reply language. */
  lang: SideLang;
  /** User-writing language for LLM replies; resolved server-side if omitted. */
  replyLang?: AppLang;
  action: SideTurnAction;
  userMessage?: string;
  seed?: string;
  /** Remembered preference from prior Side sessions (opening / new activity). */
  preferredTrait?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  understanding: UserUnderstanding;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  wishDraft: WishDraft;
  pendingConfirm: string | null;
  pendingBrowseConfirm: string | null;
  pendingMatchConfirm: string | null;
  pendingOfferMatch: boolean;
  wishLane: WishLane;
  browseSearched: boolean;
  myIntentId: string | null;
  /** Session wish ids (for show_my_wishes); oldest → newest. */
  myIntentIds?: string[];
  matchIntentId: string | null;
  currentPersonId?: string | null;
  triedIntentIds: string[];
  triedOwnerIds: string[];
  rankedQueue?: string[];
  queueCursor?: number;
  queueFingerprint?: string | null;
  passedIntentIds?: string[];
  shownIntentIds?: string[];
  passedIds?: string[];
  shownIds?: string[];
  hangingInvite?: {
    summary: string;
    createdAt: number;
    nextRematchAt: number;
  } | null;
  matchHardFilters?: import("./match-types").MatchHardFilters;
  profile: Profile;
  handoffCount?: number;
  handoffSummary?: string;
  handoffHints?: SideBySideHints;
  /** Set by sideBySideTurnFn so publish persists to DB on the server. */
  userId?: string;
  /** Result of a previous ask_user_info card. */
  userAskResolution?: UserAskResolution | null;
}

export interface SideTurnOutput {
  reply: string;
  understanding: UserUnderstanding;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  wishDraft: WishDraft;
  pendingConfirm: string | null;
  pendingBrowseConfirm: string | null;
  pendingMatchConfirm: string | null;
  pendingOfferMatch: boolean;
  wishLane: WishLane;
  browseSearched: boolean;
  myIntentId: string | null;
  matchIntentId: string | null;
  currentPersonId?: string | null;
  personSummary?: string;
  whyTags?: string[];
  matchQuality?: MatchQuality;
  matchReason?: string;
  crossCityMatch: boolean;
  nearMissIds: string[];
  stage: "prompt" | "published" | "hanging" | "introducing";
  suggestions: string[];
  handoffTo: "matchmaker" | null;
  handoffSummary: string;
  transitionReply: string;
  recallEmpty: boolean;
  filtersRelaxed?: boolean;
  relaxHints?: string[];
  rankedQueue?: string[];
  queueReasons?: Record<string, string>;
  queueCursor?: number;
  queueFingerprint?: string | null;
  passedIntentIds?: string[];
  shownIntentIds?: string[];
  passedIds?: string[];
  shownIds?: string[];
  hangingInvite?: {
    summary: string;
    createdAt: number;
    nextRematchAt: number;
  } | null;
  matchHardFilters?: import("./match-types").MatchHardFilters;
  /** When publish fails place validation — client re-opens the form with this hint. */
  publishPlaceError?: string;
  /** User verbally acked an open publish form — do not append another assistant bubble. */
  suppressAssistantReply?: boolean;
  /**
   * Set only when the show_my_wishes tool ran this turn.
   * Not an LLM structured field — client sets canvasFocus from this flag.
   */
  showMyWishes?: boolean;
  /** Inline ask_user_info card waiting for the user. */
  pendingUserAsk?: PendingUserAsk | null;
}

/** Partial match state pushed so the canvas can open while the intro streams. */
export type SideMatchPreview = Pick<
  SideTurnOutput,
  | "browseSearched"
  | "matchIntentId"
  | "currentPersonId"
  | "personSummary"
  | "whyTags"
  | "matchQuality"
  | "matchReason"
  | "crossCityMatch"
  | "nearMissIds"
  | "recallEmpty"
  | "rankedQueue"
  | "queueReasons"
  | "queueCursor"
  | "queueFingerprint"
  | "passedIntentIds"
  | "shownIntentIds"
  | "passedIds"
  | "shownIds"
  | "hangingInvite"
  | "wishLane"
  | "pendingBrowseConfirm"
>;

async function runSidePeopleMatchTurn(opts: {
  input: SideTurnInput;
  draft: WishDraft;
  understanding: UserUnderstanding;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  myIntentId: string | null;
  content: string;
  suggestions?: string[];
  onDelta?: (text: string) => void;
  hooks?: {
    onChatDone?: (opts: { reply: string; suggestions: string[] }) => void;
    onMatchReady?: (preview: SideMatchPreview) => void;
  };
}): Promise<SideTurnOutput> {
  const { input, draft, understanding, hardFilters, buddyHardFilters, myIntentId, content } = opts;
  const suggestions = opts.suggestions ?? [];
  let matchHard =
    input.matchHardFilters ?? applyMatchmakerColdStart(input.profile, { ...EMPTY_HARD_FILTERS });
  matchHard = sidePlaceHardFilters(draft, input.profile, matchHard);

  const peopleAction =
    input.action === "rematch_hang"
      ? "rematch_hang"
      : input.action === "see_next"
        ? "see_next"
        : input.action === "skip_match"
          ? "skip"
          : "search";

  const people = await executeSidePeopleMatch({
    lang: (input.replyLang ?? turnReplyLang(input, content)) as SideLang,
    profile: input.profile,
    understanding,
    wishDraft: draft,
    hardFilters: matchHard,
    history: [
      ...input.history,
      ...(content.trim() ? [{ role: "user" as const, content }] : []),
    ],
    blockedIds: [...(input.triedOwnerIds ?? []), ...(input.passedIds ?? [])],
    shownIds: input.shownIds ?? input.shownIntentIds ?? [],
    passedIds: input.passedIds ?? input.passedIntentIds ?? [],
    rankedQueue: input.rankedQueue ?? [],
    queueCursor: input.queueCursor ?? 0,
    action: peopleAction,
    onDelta: opts.onDelta,
  });

  if (people.currentPersonId) {
    opts.hooks?.onMatchReady?.({
      browseSearched: true,
      matchIntentId: null,
      currentPersonId: people.currentPersonId,
      personSummary: people.personSummary,
      whyTags: people.whyTags,
      crossCityMatch: false,
      nearMissIds: [],
      recallEmpty: false,
      rankedQueue: people.rankedQueue,
      queueReasons: people.queueReasons,
      queueCursor: people.queueCursor,
      queueFingerprint: null,
      passedIntentIds: people.passedIds,
      shownIntentIds: people.shownIds,
      passedIds: people.passedIds,
      shownIds: people.shownIds,
      hangingInvite: null,
      wishLane: "browse",
      pendingBrowseConfirm: null,
    });
    opts.hooks?.onChatDone?.({ reply: people.reply, suggestions });
  } else if (people.hangingInvite) {
    opts.hooks?.onMatchReady?.({
      browseSearched: true,
      matchIntentId: null,
      currentPersonId: null,
      personSummary: "",
      whyTags: [],
      crossCityMatch: false,
      nearMissIds: [],
      recallEmpty: true,
      rankedQueue: [],
      queueReasons: {},
      queueCursor: 0,
      queueFingerprint: null,
      passedIntentIds: people.passedIds,
      shownIntentIds: people.shownIds,
      passedIds: people.passedIds,
      shownIds: people.shownIds,
      hangingInvite: people.hangingInvite,
      wishLane: "browse",
      pendingBrowseConfirm: null,
    });
    opts.hooks?.onChatDone?.({ reply: people.reply, suggestions });
  }

  return {
    reply: people.reply,
    understanding,
    hardFilters,
    buddyHardFilters,
    wishDraft: draft,
    pendingConfirm: null,
    pendingBrowseConfirm: null,
    pendingMatchConfirm: null,
    pendingOfferMatch: false,
    wishLane: "browse",
    browseSearched: true,
    myIntentId,
    matchIntentId: null,
    currentPersonId: people.currentPersonId,
    personSummary: people.personSummary,
    whyTags: people.whyTags,
    crossCityMatch: false,
    nearMissIds: [],
    stage: people.stage === "hanging" ? "hanging" : people.currentPersonId ? "introducing" : "prompt",
    suggestions,
    handoffTo: null,
    handoffSummary: "",
    transitionReply: "",
    recallEmpty: people.recallEmpty,
    rankedQueue: people.rankedQueue,
    queueReasons: people.queueReasons,
    queueCursor: people.queueCursor,
    queueFingerprint: null,
    passedIds: people.passedIds,
    shownIds: people.shownIds,
    passedIntentIds: people.passedIds,
    shownIntentIds: people.shownIds,
    hangingInvite: people.hangingInvite,
    matchHardFilters: matchHard,
    pendingUserAsk: null,
  };
}

interface LlmSideChatJson {
  needsTools?: boolean;
  toolNames?: string[];
  reply?: string;
  confirmLine?: string | null;
  affirmPublish?: boolean;
  affirmMatch?: boolean;
  pickMatchIntentId?: string | null;
  handoffTo?: "matchmaker" | null;
  handoffSummary?: string;
  transitionReply?: string;
  suggestions?: string[];
  /** Same payload as ask_user_info tool — Side chat JSON surface. */
  askUserInfo?: Record<string, unknown> | null;
}

function zh(lang: SideLang): boolean {
  return lang === "zh-CN";
}

function turnReplyLang(input: SideTurnInput, content?: string): AppLang {
  if (input.replyLang) return input.replyLang;
  return resolveReplyLang({
    userMessage: content ?? input.userMessage,
    seed: input.seed,
    history: input.history,
  });
}

function withReplyLang(input: SideTurnInput, content?: string): SideTurnInput {
  return { ...input, replyLang: turnReplyLang(input, content) };
}

function userContent(input: SideTurnInput): string {
  if (input.action === "start") {
    if (input.seed?.trim()) return input.seed.trim();
    const trait = input.preferredTrait?.trim();
    const fromHandoff =
      Boolean(input.handoffSummary?.trim()) || input.history.some((h) => h.role === "user");
    if (fromHandoff && isAgentFirstReply(input.history)) {
      return "[继续] 回应用户已说的内容。";
    }
    if (trait) {
      return `[对话开始] 用户上次偏好搭子特质：「${trait}」。可轻带偏好，请对方说想一起做什么。`;
    }
    return "[对话开始] 可以请对方说想一起做什么。";
  }
  if (input.action === "confirm_publish") {
    return "[用户点击了表单「发布」按钮] 心愿已由用户亲手发布；reply 简短确认已挂上；禁止再说「请确认发布」或复述 confirmLine；confirmLine 必须为 null；不要 pickMatchIntentId；可轻问是否顺便找搭子。";
  }
  if (input.action === "confirm_browse") {
    return "[用户口头确认开始找搭子] 简短确认，按当前活动条件找愿意一起做的人；confirmLine 必须为 null；不要 pickMatchIntentId（系统会匹配）。禁止提心愿池。";
  }
  if (input.action === "confirm_match") {
    return "[用户口头确认开始找搭子]";
  }
  if (input.action === "skip_match") {
    const traitNote = input.userMessage?.trim()
      ? `用户刚说想找这种人：「${input.userMessage.trim()}」。记住这一点，再换下一位。`
      : "[用户点击：换下一位]";
    return traitNote;
  }
  if (input.action === "see_next") {
    return "[用户点击：看下一位]";
  }
  if (input.action === "rematch") {
    return "[心愿条件已更新，重新匹配]";
  }
  if (input.action === "rematch_hang") {
    return "[挂起的邀约到期，重新找愿意一起做这件事的人]";
  }
  if (input.action === "resolve_user_ask") {
    const res = input.userAskResolution;
    if (res) {
      const note = formatUserAskResolutionForLlm(res, "zh-CN");
      if (
        res.fieldKey === ACTIVITY_PLACE_FIELD_KEY &&
        res.status === "confirmed" &&
        res.value?.trim()
      ) {
        return `${note}\n地点已齐。若用户正在浏览/搜活动，本轮 affirmMatch=true 立刻搜；askUserInfo=null。`;
      }
      return note;
    }
    return "[ask_user_info 结果] status=cancelled value=\"\"";
  }
  const base = input.userMessage?.trim() ?? "";
  if (input.userAskResolution) {
    const note = formatUserAskResolutionForLlm(input.userAskResolution, "zh-CN");
    return base ? `${note}\n\n${base}` : note;
  }
  return base;
}

function isLightSideQueueAction(action: SideTurnAction): boolean {
  return action === "skip_match" || action === "see_next";
}

async function handleSideQueueBrowseAction(
  input: SideTurnInput,
  recallMine: Intent,
  lang: SideLang,
): Promise<SideTurnOutput | null> {
  if (!isLightSideQueueAction(input.action)) return null;
  if ((input.rankedQueue?.length ?? 0) === 0) return null;

  const mode = input.action === "skip_match" ? "pass" : "see";
  const advanced = advanceSideWishQueue(
    carrierFromSideState({
      rankedQueue: input.rankedQueue,
      queueCursor: input.queueCursor,
      passedIntentIds: input.passedIntentIds,
      shownIntentIds: input.shownIntentIds ?? input.triedIntentIds,
      matchIntentId: input.matchIntentId,
    }),
    mode,
  );

  if (advanced.exhausted) {
    return {
      reply: queueExhaustedReply(lang),
      understanding: input.understanding,
      hardFilters: input.hardFilters,
      buddyHardFilters: input.buddyHardFilters,
      wishDraft: input.wishDraft,
      pendingConfirm: input.pendingConfirm,
      pendingBrowseConfirm: input.pendingBrowseConfirm,
      pendingMatchConfirm: input.pendingMatchConfirm,
      pendingOfferMatch: input.pendingOfferMatch ?? false,
      wishLane: input.wishLane,
      browseSearched: input.browseSearched,
      myIntentId: input.myIntentId,
      matchIntentId: null,
      crossCityMatch: false,
      nearMissIds: [],
      stage: input.myIntentId ? "published" : "prompt",
      suggestions: [],
      handoffTo: null,
      handoffSummary: "",
      transitionReply: "",
      recallEmpty: true,
      rankedQueue: advanced.rankedQueue,
      queueCursor: advanced.queueCursor,
      queueFingerprint: input.queueFingerprint ?? null,
      passedIntentIds: advanced.passedIntentIds,
      shownIntentIds: advanced.shownIntentIds,
    };
  }

  const id = advanced.matchIntentId!;
  const meta = matchMetaForIntent(recallMine, id);
  const matchReason = await generateMatchReason({
    lang,
    mineId: recallMine.id,
    otherId: id,
    mine: recallMine,
  });

  return {
    reply: queueBrowseReply(lang, mode),
    understanding: input.understanding,
    hardFilters: input.hardFilters,
    buddyHardFilters: input.buddyHardFilters,
    wishDraft: input.wishDraft,
    pendingConfirm: input.pendingConfirm,
    pendingBrowseConfirm: input.pendingBrowseConfirm,
    pendingMatchConfirm: input.pendingMatchConfirm,
    pendingOfferMatch: input.pendingOfferMatch ?? false,
    wishLane: input.wishLane,
    browseSearched: input.browseSearched,
    myIntentId: input.myIntentId,
    matchIntentId: id,
    matchQuality: meta?.quality,
    matchReason,
    crossCityMatch: meta?.crossCity ?? false,
    nearMissIds: [],
    stage: input.myIntentId ? "published" : "prompt",
    suggestions: [],
    handoffTo: null,
    handoffSummary: "",
    transitionReply: "",
    recallEmpty: false,
    rankedQueue: advanced.rankedQueue,
    queueCursor: advanced.queueCursor,
    queueFingerprint: input.queueFingerprint ?? null,
    passedIntentIds: advanced.passedIntentIds,
    shownIntentIds: advanced.shownIntentIds,
  };
}

/** Sync placeMode / legacy flags; hardFilters.cities derived from structured place only. */
function enrichDraftLocation(
  draft: WishDraft,
  hardFilters: WishHardFilters,
  _profileCity: string,
  _userMessage: string,
): { draft: WishDraft; hardFilters: WishHardFilters } {
  const spec = normalizePlaceSpec(draft);
  const flags = legacyFlagsFromSpec(spec);
  let next: WishDraft = {
    ...draft,
    placeMode: flags.placeMode,
    placeOnline: flags.placeOnline,
    placeFlex: flags.placeFlex,
    place: flags.place ?? draft.place,
  };

  const cities = citiesFromPlaceFields(next);
  if (cities.length) {
    const labels = cityLabelsForId(cities[0]!);
    if (labels && !(next.city?.trim() || next.city_zh?.trim())) {
      next = { ...next, city: labels.city, city_zh: labels.city_zh };
    }
  } else if (flags.placeMode === "online" || flags.placeMode === "any" || isPlaceAny(flags.place?.city)) {
    // clear stale city labels that fight unrestricted place
    if (isPlaceAny(flags.place?.city) || flags.placeMode === "any" || flags.placeMode === "online") {
      /* keep city empty for online/any */
    }
  }

  return { draft: next, hardFilters: { ...hardFilters, cities } };
}

function draftCity(input: SideTurnInput, draft: WishDraft): { en: string; zh: string } {
  const profileCity = input.profile.city?.trim() || "";
  const en = draft.city?.trim() || profileCity;
  const zhc = draft.city_zh?.trim() || draft.city?.trim() || profileCity;
  return { en, zh: zhc };
}

function mergePlaceIntoDraft(
  input: SideTurnInput,
  draft: WishDraft,
  extracted: Awaited<ReturnType<typeof runPlaceExtract>>,
): WishDraft {
  const flags = legacyFlagsFromSpec({
    placeMode: extracted.placeMode,
    place: extracted.place,
  });
  if (flags.placeMode === "online") {
    return {
      ...draft,
      placeRaw: extracted.placeRaw,
      placeMode: "online",
      placeOnline: true,
      placeFlex: false,
      place: undefined,
      city: "",
      city_zh: "",
    };
  }
  const labels = cityLabelsFromPlace(extracted.place, extracted.placeRaw, input.lang);
  return {
    ...draft,
    placeRaw: extracted.placeRaw,
    placeMode: flags.placeMode,
    placeOnline: flags.placeOnline,
    placeFlex: flags.placeFlex,
    place: extracted.place ?? undefined,
    city: isPlaceAny(extracted.place?.city) ? "" : labels.city,
    city_zh: isPlaceAny(extracted.place?.city) ? "" : labels.city_zh,
  };
}

function publishPlaceErrorMessage(lang: SideLang): string {
  return zh(lang)
    ? "地址不合理，请填写可识别的地点，或写「不限」「线上」"
    : "We couldn't recognize this location. Enter a real place, type «anywhere», or «online».";
}

async function publishDraft(input: SideTurnInput, draft: WishDraft): Promise<Intent> {
  const placeRaw = resolvePlaceRaw(draft.placeRaw, draft.city, input.profile.city);
  const cityLabels = draft.placeOnline || draft.placeMode === "online"
    ? { city: "", city_zh: "" }
    : draft.placeFlex || draft.placeMode === "any" || isPlaceAny(draft.place?.city)
      ? (() => {
          const c = draftCity(input, draft);
          return { city: c.en, city_zh: c.zh };
        })()
      : cityLabelsFromPlace(draft.place ?? null, placeRaw, input.lang);
  const dates = resolveDraftDates(draft);
  const desc = wishDescriptionsFromDraft(draft);
  const intent = publishMyIntent({
    kind: draft.kind ?? "other",
    activityCore: draft.activityCore,
    activityStrength: draft.activityStrength,
    when: draft.whenAny ? undefined : draft.when,
    level: draft.levelAny ? undefined : draft.level,
    rawText: desc.activityDescRaw || input.userMessage || "",
    city: cityLabels.city,
    city_zh: cityLabels.city_zh,
    strictWhen: draft.strictWhen,
    strictLevel: draft.strictLevel,
    whenStrength: draft.whenStrength,
    levelStrength: draft.levelStrength,
    placeStrength: draft.placeStrength,
    buddyGenderStrength: draft.buddyGenderStrength,
    buddyAgeStrength: draft.buddyAgeStrength,
    allowCrossCity: draft.allowCrossCity ?? input.hardFilters.allowCrossCity,
    ownerSnapshot: ownerSnapshotFromProfile(input.profile),
    placeRaw,
    placeMode: draft.placeMode,
    placeOnline: draft.placeOnline ?? draft.placeMode === "online",
    placeFlex: draft.placeFlex ?? isPlaceAny(draft.place?.city),
    place: draft.place,
    activityDescRaw: desc.activityDescRaw,
    buddyPrefRaw: desc.buddyPrefRaw,
    otherReqRaw: desc.otherReqRaw,
    buddyMatchQuery: draft.buddyMatchQuery,
    skipRemotePersist: Boolean(input.userId),
    ...dates,
  });
  if (input.userId) {
    const { upsertIntentIndex } = await import("./intent-store.server");
    await upsertIntentIndex(intent, input.userId);
  }
  void import("./wish-recall-cache.server").then((m) => m.invalidateWishRecallCache());
  void import("./intent-store.server").then((m) => m.invalidateIntentPoolCache(intent.id));
  void prewarmWishRecallCache(intent, input.hardFilters, input.buddyHardFilters, input.understanding);
  return intent;
}

function browseClarifyComplete(input: SideTurnInput, draft: WishDraft, hardFilters: WishHardFilters, buddyHardFilters: BuddyHardFilters, understanding: UserUnderstanding): boolean {
  if (input.wishLane !== "browse") return false;
  return isBrowseClarifyComplete({
    draft,
    hardFilters,
    buddyHardFilters,
    understanding,
    profile: input.profile,
    history: input.history,
  });
}

/** Fill empty place/buddy dims from profile as flex soft priors. */
function applySideColdStartPrefs(
  profile: Profile,
  draft: WishDraft,
  buddy: BuddyHardFilters,
): { draft: WishDraft; buddyHardFilters: BuddyHardFilters } {
  let nextDraft = applySidePlaceColdStart(profile, draft);
  const cs = applySideBuddyColdStart(profile, buddy);
  if (cs.buddyGenderStrength && !nextDraft.buddyGenderStrength) {
    nextDraft = { ...nextDraft, buddyGenderStrength: cs.buddyGenderStrength };
  }
  if (cs.buddyAgeStrength && !nextDraft.buddyAgeStrength) {
    nextDraft = { ...nextDraft, buddyAgeStrength: cs.buddyAgeStrength };
  }
  return { draft: nextDraft, buddyHardFilters: cs.buddy };
}

/** Like Matchmaker holdChatStream — skip chat LLM when this action already means search/browse queue. */
function shouldHoldChatForMatch(input: SideTurnInput): boolean {
  const light: SideTurnAction[] = ["skip_match", "see_next", "rematch"];
  const offerAffirm = input.pendingOfferMatch && isOfferMatchAffirmation(input.userMessage ?? "");
  return (
    input.action === "confirm_browse" ||
    input.action === "confirm_match" ||
    light.includes(input.action) ||
    (offerAffirm && Boolean(input.myIntentId || draftSearchable(input.wishDraft)))
  );
}

function emptySideChatJson(partial?: Partial<LlmSideChatJson>): LlmSideChatJson {
  return {
    needsTools: false,
    toolNames: [],
    reply: "",
    confirmLine: null,
    askUserInfo: null,
    suggestions: [],
    affirmPublish: false,
    affirmMatch: true,
    pickMatchIntentId: null,
    handoffTo: null,
    handoffSummary: "",
    transitionReply: "",
    ...partial,
  };
}

function draftSearchable(draft: WishDraft): boolean {
  return (
    draft.kind != null ||
    Boolean(draft.activityCore?.trim()) ||
    (draft.rawText?.trim().length ?? 0) >= 2
  );
}

function resolveRecallMine(
  input: SideTurnInput,
  draft: WishDraft,
  myIntentId: string | null,
  hardFilters: WishHardFilters,
  /** When AI asks to search, allow empty draft (cold-start soft only). */
  allowEmptyForSearch = false,
): Intent | null {
  if (myIntentId) {
    return getIntentById(myIntentId);
  }
  if (draftSearchable(draft) || allowEmptyForSearch) {
    return draftAsIntent(draft, { profile: input.profile, hardFilters });
  }
  return null;
}

function buildChatSystem(
  input: SideTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  crossCityUsed: boolean,
  opts: {
    published: boolean;
    wishLane: WishLane;
    pendingConfirm: string | null;
    pendingBrowseConfirm: string | null;
    pendingMatchConfirm: string | null;
    pendingOfferMatch: boolean;
    readyToPublish: boolean;
    /** Unused — people-search planning no longer injects wish-pool roster. */
    showCandidates?: boolean;
    afterToolResults?: boolean;
    toolResultsBlock?: string;
    laneJustPicked?: boolean;
    /** Browse/publish clarify progress for prompt injection. */
    clarifyProgress?: ReturnType<typeof assessWishClarifyProgress> | null;
  },
): string {
  void candidateIds;
  void recallEmpty;
  void crossCityUsed;
  void opts.showCandidates;
  const replyLang = turnReplyLang(input);
  const isPublish = opts.wishLane === "publish";

  const draftDates = formatDateRangeLine(
    intentDateRange({
      dateStart: input.wishDraft.dateStart,
      dateEnd: input.wishDraft.dateEnd,
    } as Intent),
    "zh-CN",
  );
  const draftTimes =
    input.wishDraft.timeStart && input.wishDraft.timeEnd
      ? `${input.wishDraft.timeStart}-${input.wishDraft.timeEnd}`
      : "any";
  const profileCity = input.profile.city?.trim() || "";
  const placeKnown =
    Boolean(input.wishDraft.placeRaw?.trim()) ||
    Boolean(input.wishDraft.city_zh?.trim()) ||
    Boolean(input.wishDraft.city?.trim()) ||
    input.wishDraft.placeMode === "online" ||
    input.wishDraft.placeMode === "any" ||
    Boolean(input.wishDraft.placeOnline) ||
    Boolean(input.wishDraft.placeFlex) ||
    Boolean(profileCity);
  const placeStatus = placeKnown
    ? profileCity &&
      !input.wishDraft.placeRaw?.trim() &&
      !input.wishDraft.city?.trim() &&
      !input.wishDraft.city_zh?.trim()
      ? `地点=已有（资料城市「${profileCity}」，冷启动）`
      : `地点=已有`
    : "地点=缺失";
  const draftLine = `【本轮状态】lane=${opts.wishLane}；已发布=${opts.published ? input.myIntentId : "否"}；${placeStatus}；草稿 kind=${input.wishDraft.kind ?? "?"} when=${input.wishDraft.whenAny ? "any" : input.wishDraft.when ?? "?"} ${draftDates} time=${draftTimes} level=${input.wishDraft.levelAny ? "any" : input.wishDraft.level ?? "?"} text=${input.wishDraft.rawText || "（空）"}`;

  const core = `你在 Maitri 帮用户找一起做事的搭子。温暖、具体，2-5 句。
产品：对方说想一起做什么 → 一位一位介绍愿意一起做的人。用语自然，不提心愿池/发布/看别人的心愿。
${selfVoiceRule(true)}
handoffTo 保持 null。若对方要认识新朋友/找对象：reply 请回首页开「想认识人」新对话；suggestions 可给「回首页开新对话」。
${agentCapabilityIntroRule("sidebyside", true)}

【决策】（以【本轮状态】的地点=为准）
1. 闲聊 / 活动未明 → affirmMatch=false。
2. 本轮要找人 + 地点=缺失 → askUserInfo（fieldKey=activity_place，kind=text）；affirmMatch=false；reply 短提看本条下的填写卡。
3. 本轮要找人 + 地点=已有 → affirmMatch=true，reply=""，askUserInfo=null（资料城市也算已有）。
时间/搭子偏好可空。affirmPublish=false；找人时 confirmLine=null。`;

  const opening =
    input.action === "start" || opts.wishLane === "unset"
      ? `【开场】还可给 2-4 条第一人称活动例子作 suggestions。`
      : "";

  const laneNote =
    opts.wishLane === "browse"
      ? "【模式】找人（介绍搭子）。补充条件=完善邀约。"
      : opts.wishLane === "publish"
        ? "【模式】说清活动邀约（可开右侧表单）。直接找人走【决策】。"
        : "";

  const lanePicked =
    opts.laneJustPicked && opts.wishLane !== "unset"
      ? "用户刚表明方向：自然确认；要搜走【决策】。"
      : "";

  const publishAppendix = isPublish
    ? `【发布附录】开表单靠 confirmLine（一句复述）；reply 引导看右侧点发布。affirmPublish=false。
已挂起预填：${opts.pendingConfirm ?? "无"}
${
  opts.pendingConfirm
    ? "表单已在右侧：用户说好的/OK → reply 提醒点「发布」；confirmLine=null。"
    : "开表单轮给 confirmLine；澄清轮 confirmLine=null。"
}`
    : "";

  const clarifyHint =
    opts.clarifyProgress &&
    (opts.wishLane === "browse" || opts.wishLane === "publish") &&
    !opts.published
      ? wishClarifyPromptSection(
          opts.clarifyProgress,
          "zh-CN",
          opts.wishLane === "browse" ? "browse" : "publish",
        )
      : "";

  const lazyTools = opts.afterToolResults
    ? "工具已跑完：按【工具结果】写最终 reply；needsTools=false。"
    : `【工具】默认 needsTools=false。常用 affirmMatch / askUserInfo。要看本会话已发内容时：needsTools=true，toolNames=["show_my_wishes"]，reply=""。`;

  const offerNote =
    opts.pendingOfferMatch || (opts.published && isPublish)
      ? "明确要找搭子时走【决策】。"
      : "";

  const pendingBrowse = opts.pendingBrowseConfirm
    ? "用户在确认是否开始找：suggestions 可给确认开搜/再改条件等第一人称短句。"
    : "";

  const jsonBlock = `【JSON】needsTools、affirmMatch 靠前。affirmMatch=true 或 needsTools=true → reply=""。
搜人：{"needsTools":false,"affirmMatch":true,"toolNames":[],"confirmLine":null,"askUserInfo":null,"reply":"","suggestions":[],"affirmPublish":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}
缺地点：{"needsTools":false,"affirmMatch":false,"toolNames":[],"confirmLine":null,"askUserInfo":{"fieldKey":"activity_place","prompt":"活动想在哪个城市或区域？也可写线上/地点不限","kind":"text","placeholder":"例如：上海"},"reply":"找搭子还差一个地点，填一下下面的卡片就行。","suggestions":[],"affirmPublish":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}
闲聊：{"needsTools":false,"affirmMatch":false,"toolNames":[],"confirmLine":null,"askUserInfo":null,"reply":"...","suggestions":["短句1"],"affirmPublish":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}
suggestions：2-4 条第一人称短句（用户可直接发送）。
${llmReplyLanguageRule(replyLang)}`;

  return [
    formatNowContext("zh-CN"),
    core,
    draftLine,
    opening,
    laneNote,
    lanePicked,
    input.preferredTrait?.trim()
      ? `用户偏好搭子特质：${input.preferredTrait.trim()}`
      : "",
    input.handoffSummary ? `接手摘要：${input.handoffSummary}` : "",
    input.handoffHints?.activity ? `活动线索：${input.handoffHints.activity}` : "",
    profileSummaryForPrompt(input.profile, "zh-CN"),
    clarifyHint,
    publishAppendix,
    offerNote,
    pendingBrowse,
    lazyTools,
    jsonBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function replyMentionsEmptyPool(reply: string, lang: SideLang): boolean {
  const r = reply.toLowerCase();
  if (zh(lang)) {
    return /找不到|没有合适|暂时没有|还没有.*人|池子|放宽|没人|无匹配/.test(reply);
  }
  return /no (good )?match|nobody|no one|empty|loosen|relax|couldn't find|can't find|no match yet|don't have.*match/.test(
    r,
  );
}

function replyLooksLikeStartingSearch(reply: string, lang: SideLang): boolean {
  if (zh(lang)) {
    return /开始(帮)?你找|这就.*找|我去找|找找看|开始匹配|帮你找搭子|开始帮你|在心愿池里|池子里.*找|去池子|按.*条件.*找/.test(
      reply,
    );
  }
  return /start (looking|matching|searching)|i'?ll (look|find|search)|finding someone for you|search(ing)? the pool|check(ing)? the pool/i.test(
    reply,
  );
}

function explicitEmptyPoolReply(
  input: SideTurnInput,
  draft: WishDraft,
  mine: Intent,
): string {
  const raw = draft.rawText?.trim() || mine.rawText?.trim() || mine.rawText_zh?.trim();
  if (zh(input.lang)) {
    return raw
      ? `心愿已经记下了：${raw}。不过按现在的条件，暂时还没有合适的人。要不要放宽时间或活动类型，或稍后再来看看？`
      : `心愿已经记下了。不过按现在的条件，暂时还没有合适的人。要不要放宽时间或活动类型试试？`;
  }
  return raw
    ? `Your wish is saved: ${raw}. I don't have a good match with your current filters yet. Want to loosen when or activity type, or check back later?`
    : `Your wish is saved, but I don't have a good match yet. Want to loosen when or activity type?`;
}

function replyMentionsCrossCity(reply: string, lang: SideLang): boolean {
  const r = reply.toLowerCase();
  if (zh(lang)) {
    return /跨城|其他城市|别的城市|同城.*没有|另一座|外地/.test(reply);
  }
  return /another city|other city|cross[- ]?city|not in (your|the same) city|different city|elsewhere/.test(r);
}

function fallback(input: SideTurnInput, reason: "no_key" | "error"): SideTurnOutput {
  const replyLang = turnReplyLang(input);
  return {
    reply:
      reason === "no_key"
        ? replyLang === "zh-CN"
          ? "暂时连不上对话服务，请确认 DEEPSEEK_API_KEY。"
          : "Can't reach chat — check DEEPSEEK_API_KEY."
        : replyLang === "zh-CN"
          ? "刚才没连上对话服务，请稍后再试。"
          : "Couldn't reach the conversation service. Please try again.",
    understanding: input.understanding,
    hardFilters: input.hardFilters,
    buddyHardFilters: input.buddyHardFilters,
    wishDraft: input.wishDraft,
    pendingConfirm: input.pendingConfirm,
    pendingBrowseConfirm: input.pendingBrowseConfirm ?? null,
    pendingMatchConfirm: input.pendingMatchConfirm ?? null,
    pendingOfferMatch: input.pendingOfferMatch ?? false,
    wishLane: input.wishLane ?? "unset",
    browseSearched: input.browseSearched ?? false,
    myIntentId: input.myIntentId,
    matchIntentId: input.matchIntentId,
    crossCityMatch: false,
    nearMissIds: [],
    stage: input.myIntentId ? "published" : "prompt",
    suggestions: [],
    handoffTo: null,
    handoffSummary: "",
    transitionReply: "",
    recallEmpty: false,
    pendingUserAsk: null,
  };
}

function pickMatchId(
  chatId: string | null,
  candidateIds: string[],
  input: SideTurnInput,
  toolSuggested: string | null,
): string | null {
  const allowed = new Set(candidateIds);
  if (chatId && allowed.has(chatId)) return chatId;
  if (toolSuggested && allowed.has(toolSuggested)) return toolSuggested;

  const needsPick =
    input.action === "skip_match" ||
    input.action === "see_next" ||
    input.action === "rematch" ||
    Boolean(chatId) ||
    Boolean(toolSuggested);

  if (!needsPick || candidateIds.length === 0) return null;

  const exclude =
    input.action === "see_next" ? null : input.matchIntentId;
  for (const id of candidateIds) {
    if (id !== exclude) return id;
  }
  return candidateIds[0] ?? null;
}

function shouldPreRecall(
  input: SideTurnInput,
  draft: WishDraft,
  holdChatForMatch: boolean,
): boolean {
  if (holdChatForMatch) return true;
  if (input.myIntentId && input.action === "confirm_match") return true;
  if (["skip_match", "see_next", "rematch", "confirm_browse"].includes(input.action)) return true;
  return draftSearchable(draft) && Boolean(input.myIntentId);
}

function shouldRunSideExtract(
  _input: SideTurnInput,
  _chatParsed: LlmSideChatJson | null,
  action: SideTurnAction,
  _opts: {
    holdChatForMatch: boolean;
    userAffirmedSearch: boolean;
    wishLane: WishLane;
    content: string;
  },
): boolean {
  // Default: every turn with user content, like Matchmaker.
  // Skip only light queue / publish-button actions (no new prefs to merge).
  const light: SideTurnAction[] = ["skip_match", "see_next", "rematch"];
  if (light.includes(action)) return false;
  if (action === "confirm_publish") return false;
  return true;
}


async function ensureDraftForTools(
  input: SideTurnInput,
  content: string,
  draft: WishDraft,
  hardFilters: WishHardFilters,
  buddyHardFilters: BuddyHardFilters,
  understanding: UserUnderstanding,
): Promise<{
  draft: WishDraft;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  understanding: UserUnderstanding;
}> {
  if (draftSearchable(draft)) {
    return { draft, hardFilters, buddyHardFilters, understanding };
  }
  const extracted = await runSideExtract({
    lang: input.lang,
    history: input.history,
    userMessage: content,
    prevDraft: draft,
    prevHardFilters: hardFilters,
    prevBuddyHardFilters: buddyHardFilters,
    prevUnderstanding: understanding,
  });
  return {
    draft: extracted.draft,
    hardFilters: extracted.hardFilters,
    buddyHardFilters: extracted.buddyHardFilters,
    understanding: extracted.understanding,
  };
}

async function runLazySideTools(
  input: SideTurnInput,
  draft: WishDraft,
  hardFilters: WishHardFilters,
  buddyHardFilters: BuddyHardFilters,
  understanding: UserUnderstanding,
  toolNames: string[],
): Promise<{ state: SideToolState; results: Record<string, unknown> }> {
  const state = createSideToolState({
    lang: input.lang,
    hardFilters,
    buddyHardFilters,
    understanding,
    wishDraft: draft,
    pendingConfirm: input.pendingConfirm,
    myIntentId: input.myIntentId,
    myIntentIds: input.myIntentIds,
    matchIntentId: input.matchIntentId,
    triedIntentIds: input.triedIntentIds,
    triedOwnerIds: input.triedOwnerIds,
  });
  const names =
    toolNames.length > 0
      ? toolNames.filter((n) => LAZY_SIDE_TOOL_NAMES.has(n))
      : ["search_wishes"];
  const effective = names.length > 0 ? names : ["search_wishes"];
  const results: Record<string, unknown> = {};
  for (const name of effective) {
    results[name] = await executeSideTool(state, name, { limit: WISH_RECALL_LIMIT });
  }
  log.info("side", "lazy tools", { called: effective });
  return { state, results };
}

async function runSideChat(
  input: SideTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  crossCityUsed: boolean,
  content: string,
  chatOpts: {
    published: boolean;
    wishLane: WishLane;
    pendingConfirm: string | null;
    pendingBrowseConfirm: string | null;
    pendingMatchConfirm: string | null;
    pendingOfferMatch: boolean;
    readyToPublish: boolean;
    showCandidates?: boolean;
    afterToolResults?: boolean;
    toolResultsBlock?: string;
    laneJustPicked?: boolean;
    clarifyProgress?: ReturnType<typeof assessWishClarifyProgress> | null;
  },
  onDelta?: (text: string) => void,
): Promise<LlmSideChatJson | null> {
  const system = buildChatSystem(
    input,
    candidateIds,
    recallEmpty,
    crossCityUsed,
    chatOpts,
  );
  const userContentForLlm = chatOpts.toolResultsBlock
    ? `${content}\n\n${chatOpts.toolResultsBlock}`
    : content;
  let value: LlmSideChatJson | null = null;
  const streamOpts = {
    temperature: 0.85,
    maxTokens: 1500,
    // Planning turns: never stream provisional reply when tools or people-search will follow.
    suppressReplyWhen: [
      { field: "needsTools", equals: true },
      { field: "affirmMatch", equals: true },
    ],
  };
  for await (const ev of chatCompletionJsonStream<LlmSideChatJson>(
    [
      { role: "system", content: system },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userContentForLlm },
    ],
    streamOpts,
  )) {
    if (ev.type === "delta") onDelta?.(ev.text);
    else if (ev.type === "done") value = ev.value;
  }
  return value;
}

async function runSideChatWithLazyTools(
  input: SideTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  crossCityUsed: boolean,
  content: string,
  chatOpts: Parameters<typeof runSideChat>[5] extends infer T ? T : never,
  draft: WishDraft,
  hardFilters: WishHardFilters,
  buddyHardFilters: BuddyHardFilters,
  understanding: UserUnderstanding,
  onDelta?: (text: string) => void,
): Promise<{ parsed: LlmSideChatJson | null; toolState: SideToolState }> {
  let toolState = createSideToolState({
    lang: input.lang,
    hardFilters,
    buddyHardFilters,
    understanding,
    wishDraft: draft,
    pendingConfirm: input.pendingConfirm,
    myIntentId: input.myIntentId,
    myIntentIds: input.myIntentIds,
    matchIntentId: input.matchIntentId,
    triedIntentIds: input.triedIntentIds,
    triedOwnerIds: input.triedOwnerIds,
  });

  const plan = await runSideChat(
    input,
    candidateIds,
    recallEmpty,
    crossCityUsed,
    content,
    { ...chatOpts, showCandidates: chatOpts.showCandidates ?? false },
    onDelta,
  );

  if (!plan?.needsTools) {
    return { parsed: plan, toolState };
  }

  const toolNames = (plan.toolNames ?? []).filter((n) => typeof n === "string");
  const ensured = await ensureDraftForTools(
    input,
    content,
    draft,
    hardFilters,
    buddyHardFilters,
    understanding,
  );
  const lazy = await runLazySideTools(
    input,
    ensured.draft,
    ensured.hardFilters,
    ensured.buddyHardFilters,
    ensured.understanding,
    toolNames,
  );
  toolState = lazy.state;

  const toolBlock = zh(input.lang)
    ? `[工具结果]\n${JSON.stringify(lazy.results)}`
    : `[Tool results]\n${JSON.stringify(lazy.results)}`;

  const parsed = await runSideChat(
    input,
    toolState.lastSearchIds.length > 0 ? toolState.lastSearchIds : candidateIds,
    recallEmpty,
    crossCityUsed,
    content,
    {
      ...chatOpts,
      showCandidates: false,
      afterToolResults: true,
      toolResultsBlock: toolBlock,
    },
    onDelta,
  );
  return { parsed: parsed ? { ...parsed, needsTools: false } : parsed, toolState };
}

export async function runSideTurn(
  input: SideTurnInput,
  onDelta?: (text: string) => void,
  hooks?: {
    /** Chat finished — UI can stop waiting before extract/publish/match. */
    onChatDone?: (opts: { reply: string; suggestions: string[] }) => void;
    /** Recall finished — UI can open the result canvas while intro streams. */
    onMatchReady?: (preview: SideMatchPreview) => void;
  },
): Promise<SideTurnOutput> {
  const content = userContent(input);
  input = withReplyLang(input, content);
  log.info("side", "turn", {
    action: input.action,
    userPreview: content.slice(0, 80),
    published: Boolean(input.myIntentId),
    historyLen: input.history.length,
    replyLang: input.replyLang,
    uiLang: input.lang,
  });

  const earlyPeopleActions: SideTurnAction[] = [
    "rematch_hang",
    "see_next",
    "skip_match",
    "rematch",
    "confirm_match",
  ];
  if (earlyPeopleActions.includes(input.action)) {
    return runSidePeopleMatchTurn({
      input,
      draft: input.wishDraft,
      understanding: input.understanding,
      hardFilters: input.hardFilters,
      buddyHardFilters: input.buddyHardFilters,
      myIntentId: input.myIntentId,
      content,
      onDelta,
      hooks,
    });
  }

  const lightActions: SideTurnAction[] = ["skip_match", "see_next", "rematch"];
  let wishLane: WishLane = input.wishLane ?? "unset";
  let browseSearched = input.browseSearched ?? false;
  let pendingOfferMatch = input.pendingOfferMatch ?? false;
  let pendingBrowseConfirm = input.pendingBrowseConfirm ?? null;

  if (wishLane === "unset" && isWishLaneSelectionMessage(content)) {
    const inferred = inferWishLaneFromText(content);
    if (inferred) wishLane = inferred;
  }

  const publishVerbalAck =
    !input.myIntentId &&
    input.action === "message" &&
    isPublishFormAcknowledgement(content) &&
    ((input.wishLane ?? "unset") === "publish" || Boolean(input.pendingConfirm?.trim()));

  if (publishVerbalAck) {
    const ackLane: WishLane =
      input.wishLane === "unset" || !input.wishLane ? "publish" : input.wishLane;
    if (input.pendingConfirm?.trim()) {
      return {
        reply: "",
        suppressAssistantReply: true,
        understanding: input.understanding,
        hardFilters: input.hardFilters,
        buddyHardFilters: input.buddyHardFilters,
        wishDraft: input.wishDraft,
        pendingConfirm: input.pendingConfirm.trim(),
        pendingBrowseConfirm: null,
        pendingMatchConfirm: null,
        pendingOfferMatch: false,
        wishLane: ackLane,
        browseSearched,
        myIntentId: input.myIntentId,
        matchIntentId: input.matchIntentId,
        crossCityMatch: false,
        nearMissIds: [],
        stage: "prompt",
        suggestions: [],
        handoffTo: null,
        handoffSummary: "",
        transitionReply: "",
        recallEmpty: false,
        rankedQueue: input.rankedQueue ?? [],
        queueCursor: input.queueCursor ?? 0,
        queueFingerprint: input.queueFingerprint ?? null,
        passedIntentIds: input.passedIntentIds ?? [],
        shownIntentIds: input.shownIntentIds ?? input.triedIntentIds ?? [],
      };
    }
    return {
      reply: publishFormNudgeReply(input.lang),
      understanding: input.understanding,
      hardFilters: input.hardFilters,
      buddyHardFilters: input.buddyHardFilters,
      wishDraft: input.wishDraft,
      pendingConfirm: null,
      pendingBrowseConfirm: null,
      pendingMatchConfirm: null,
      pendingOfferMatch: false,
      wishLane: ackLane,
      browseSearched,
      myIntentId: input.myIntentId,
      matchIntentId: input.matchIntentId,
      crossCityMatch: false,
      nearMissIds: [],
      stage: "prompt",
      suggestions: [],
      handoffTo: null,
      handoffSummary: "",
      transitionReply: "",
      recallEmpty: false,
      rankedQueue: input.rankedQueue ?? [],
      queueCursor: input.queueCursor ?? 0,
      queueFingerprint: input.queueFingerprint ?? null,
      passedIntentIds: input.passedIntentIds ?? [],
      shownIntentIds: input.shownIntentIds ?? input.triedIntentIds ?? [],
    };
  }

  let draft = { ...input.wishDraft };
  // Card answer for activity place → seed draft before extract / cold-start.
  if (
    input.userAskResolution?.fieldKey === ACTIVITY_PLACE_FIELD_KEY &&
    input.userAskResolution.status === "confirmed" &&
    input.userAskResolution.value?.trim()
  ) {
    const placeAnswer = input.userAskResolution.value.trim();
    draft = {
      ...draft,
      placeRaw: placeAnswer,
      rawText: draft.rawText?.trim()
        ? draft.rawText
        : placeAnswer,
    };
  }
  // Scrub greeting / lane-chip pollution left in old sessions — draft is extract/tool owned.
  if (
    isNonWishDraftSeed(draft.rawText) &&
    !draft.kind &&
    !draft.activityCore?.trim()
  ) {
    draft = { ...draft, rawText: "" };
  }
  if (
    isWishLaneSelectionMessage(content) &&
    wishLane !== "unset" &&
    isVagueExploreWishSeed(draft.rawText)
  ) {
    draft = { ...draft, rawText: "", kind: null };
  }
  let hardFilters = input.hardFilters;
  let buddyHardFilters = input.buddyHardFilters;
  {
    const cold = applySideColdStartPrefs(input.profile, draft, buddyHardFilters);
    draft = cold.draft;
    buddyHardFilters = cold.buddyHardFilters;
  }
  let understanding = input.understanding;
  let readyToPublish = false;
  let pendingConfirm = input.pendingConfirm;
  let pendingMatchConfirm = input.pendingMatchConfirm ?? null;
  let toolState = createSideToolState({
    lang: input.lang,
    hardFilters,
    buddyHardFilters,
    understanding,
    wishDraft: draft,
    pendingConfirm,
    myIntentId: input.myIntentId,
    myIntentIds: input.myIntentIds,
    matchIntentId: input.matchIntentId,
    triedIntentIds: input.triedIntentIds,
    triedOwnerIds: input.triedOwnerIds,
  });

  if (input.action === "confirm_publish") {
    const placeRaw = resolvePlaceRaw(draft.placeRaw, draft.city, input.profile.city);
    const extracted = await runPlaceExtract({
      lang: input.lang,
      placeRaw,
      profileCity: input.profile.city,
      rawText: draft.rawText,
      history: input.history,
    });
    draft = mergePlaceIntoDraft(input, draft, extracted);
    if (!extracted.publishable) {
      const confirmLine =
        pendingConfirm?.trim() || buildPublishConfirmRecap(input.lang, draft, hardFilters);
      return {
        reply: zh(input.lang)
          ? "地点没认出来，请在表单里改一下再发布。"
          : "I couldn't parse that location — fix it in the form and try again.",
        publishPlaceError: publishPlaceErrorMessage(input.lang),
        understanding,
        hardFilters,
        buddyHardFilters,
        wishDraft: draft,
        pendingConfirm: confirmLine,
        pendingBrowseConfirm: null,
        pendingMatchConfirm: null,
        pendingOfferMatch: false,
        wishLane: wishLane === "unset" ? "publish" : wishLane,
        browseSearched,
        myIntentId: input.myIntentId,
        matchIntentId: input.matchIntentId,
        crossCityMatch: false,
        nearMissIds: [],
        stage: input.myIntentId ? "published" : "prompt",
        suggestions: [],
        handoffTo: null,
        handoffSummary: "",
        transitionReply: "",
        recallEmpty: false,
        rankedQueue: input.rankedQueue ?? [],
        queueCursor: input.queueCursor ?? 0,
        queueFingerprint: input.queueFingerprint ?? null,
        passedIntentIds: input.passedIntentIds ?? [],
        shownIntentIds: input.shownIntentIds ?? input.triedIntentIds ?? [],
      };
    }
  }

  if (input.action === "confirm_publish" || input.action === "confirm_browse") {
    const desc = wishDescriptionsFromDraft(draft);
    const buddyQuery = await runBuddyPrefExtract({
      lang: input.lang,
      buddyPrefRaw: desc.buddyPrefRaw,
      activityDescRaw: desc.activityDescRaw,
      history: input.history,
    });
    draft = {
      ...draft,
      activityDescRaw: desc.activityDescRaw,
      rawText: desc.activityDescRaw,
      buddyPrefRaw: desc.buddyPrefRaw,
      otherReqRaw: desc.otherReqRaw,
      buddyMatchQuery: buddyQuery,
    };
  }

  let myIntentId = input.myIntentId;
  let publishedThisTurn = false;

  if (input.action === "confirm_publish") {
    const effectiveKind = draft.kind ?? input.wishDraft.kind;
    if (!effectiveKind) {
      return {
        reply: zh(input.lang)
          ? "请先选择活动类型再发布。"
          : "Pick an activity type before publishing.",
        understanding,
        hardFilters,
        buddyHardFilters,
        wishDraft: draft,
        pendingConfirm: pendingConfirm ?? buildPublishConfirmRecap(input.lang, draft, hardFilters),
        pendingBrowseConfirm: null,
        pendingMatchConfirm: null,
        pendingOfferMatch: false,
        wishLane: wishLane === "unset" ? "publish" : wishLane,
        browseSearched,
        myIntentId: input.myIntentId,
        matchIntentId: input.matchIntentId,
        crossCityMatch: false,
        nearMissIds: [],
        stage: input.myIntentId ? "published" : "prompt",
        suggestions: [],
        handoffTo: null,
        handoffSummary: "",
        transitionReply: "",
        recallEmpty: false,
        rankedQueue: input.rankedQueue ?? [],
        queueCursor: input.queueCursor ?? 0,
        queueFingerprint: input.queueFingerprint ?? null,
        passedIntentIds: input.passedIntentIds ?? [],
        shownIntentIds: input.shownIntentIds ?? input.triedIntentIds ?? [],
      };
    }
    const toPublish = effectiveKind && !draft.kind ? { ...draft, kind: effectiveKind } : draft;
    try {
      const published = await publishDraft({ ...input, wishDraft: toPublish }, toPublish);
      myIntentId = published.id;
      pendingConfirm = null;
      pendingBrowseConfirm = null;
      draft = { ...toPublish, kind: effectiveKind ?? toPublish.kind };
      pendingOfferMatch = true;
      publishedThisTurn = true;
    } catch (err) {
      log.error("side", "publishDraft failed", err);
      const confirmLine =
        pendingConfirm?.trim() || buildPublishConfirmRecap(input.lang, draft, hardFilters);
      return {
        reply: zh(input.lang)
          ? "发布没保存成功，请检查一下右侧表单再试一次。"
          : "Couldn't save your wish — check the form on the right and try again.",
        publishPlaceError: publishPlaceErrorMessage(input.lang),
        understanding,
        hardFilters,
        buddyHardFilters,
        wishDraft: draft,
        pendingConfirm: confirmLine,
        pendingBrowseConfirm: null,
        pendingMatchConfirm: null,
        pendingOfferMatch: false,
        wishLane: wishLane === "unset" ? "publish" : wishLane,
        browseSearched,
        myIntentId: input.myIntentId,
        matchIntentId: input.matchIntentId,
        crossCityMatch: false,
        nearMissIds: [],
        stage: input.myIntentId ? "published" : "prompt",
        suggestions: [],
        handoffTo: null,
        handoffSummary: "",
        transitionReply: "",
        recallEmpty: false,
        rankedQueue: input.rankedQueue ?? [],
        queueCursor: input.queueCursor ?? 0,
        queueFingerprint: input.queueFingerprint ?? null,
        passedIntentIds: input.passedIntentIds ?? [],
        shownIntentIds: input.shownIntentIds ?? input.triedIntentIds ?? [],
      };
    }
  }

  if (wishLane === "unset") {
    const inferred = inferWishLaneFromText(content);
    if (inferred) wishLane = inferred;
  } else if (
    canSwitchWishLane({
      wishLane,
      stage: myIntentId ? "published" : "prompt",
      myIntentId,
    })
  ) {
    const switched = detectWishLaneSwitch(content, wishLane);
    if (switched && switched !== wishLane) {
      wishLane = switched;
      pendingConfirm = null;
      pendingBrowseConfirm = null;
      pendingMatchConfirm = null;
    }
  }

  const holdChatForMatch = shouldHoldChatForMatch({
    ...input,
    wishLane,
    pendingOfferMatch,
    wishDraft: draft,
    pendingBrowseConfirm,
  });

  let extracted: Awaited<ReturnType<typeof runSideExtract>> | null = null;
  let chatParsed: LlmSideChatJson | null = null;

  const workingInput: SideTurnInput = {
    ...input,
    hardFilters,
    buddyHardFilters,
    wishDraft: draft,
    pendingConfirm,
    pendingBrowseConfirm,
    pendingMatchConfirm,
    pendingOfferMatch,
    wishLane,
    browseSearched,
    myIntentId,
  };

  const preRecallNeeded = shouldPreRecall(input, draft, holdChatForMatch);
  const preMine =
    preRecallNeeded
      ? resolveRecallMine(workingInput, draft, workingInput.myIntentId, hardFilters) ??
        (workingInput.myIntentId ? getIntentById(workingInput.myIntentId) : null)
      : null;
  const preRecall = preMine
    ? await recallWishCandidatesServer(
        {
          mine: preMine,
          hardFilters,
          buddyHardFilters,
          understanding,
          exclude: input.triedIntentIds,
          excludeOwnerIds: input.triedOwnerIds,
          shownIds: input.triedIntentIds,
          passedIds: input.triedIntentIds,
          browseStrict: wishLane === "browse",
          seekerProfile: input.profile,
        },
        input.lang,
      )
    : null;

  const laneJustPicked =
    isWishLaneSelectionMessage(content) && wishLane !== "unset";
  const clarifyProgress =
    (wishLane === "browse" || wishLane === "publish") && !myIntentId
      ? assessWishClarifyProgress({
          draft,
          hardFilters,
          buddyHardFilters,
          understanding,
          profile: input.profile,
          history: [
            ...input.history,
            ...(content.trim() ? [{ role: "user" as const, content }] : []),
          ],
        })
      : null;
  const chatOpts = {
    published: Boolean(myIntentId),
    wishLane,
    pendingConfirm: holdChatForMatch ? null : pendingConfirm,
    pendingBrowseConfirm: input.pendingBrowseConfirm ?? pendingBrowseConfirm,
    pendingMatchConfirm,
    pendingOfferMatch,
    readyToPublish: false,
    showCandidates: false,
    laneJustPicked,
    clarifyProgress,
  };

  const candidateIds = preRecall?.candidates.map((c) => c.id) ?? [];

  if (holdChatForMatch) {
    // Matchmaker-style: no chat stream before rank — intro is the only reply.
    chatParsed = emptySideChatJson({
      affirmMatch: input.action !== "see_next" && input.action !== "skip_match",
    });
    toolState = createSideToolState({
      lang: input.lang,
      hardFilters,
      buddyHardFilters,
      understanding,
      wishDraft: draft,
      pendingConfirm,
      myIntentId: input.myIntentId,
      myIntentIds: input.myIntentIds,
      matchIntentId: input.matchIntentId,
      triedIntentIds: input.triedIntentIds,
      triedOwnerIds: input.triedOwnerIds,
    });
  } else {
    // Planning chat must not stream: if the model sets affirmMatch (or needsTools),
    // a provisional reply would flash then get replaced by the people-intro stream.
    // Visible text comes from onChatDone (clarify) or runSidePeopleMatchTurn (search).
    const chatResult = await runSideChatWithLazyTools(
      workingInput,
      candidateIds,
      (preRecall?.candidates.length ?? 0) === 0 ? true : candidateIds.length === 0,
      preRecall?.crossCityUsed ?? false,
      content,
      chatOpts,
      draft,
      hardFilters,
      buddyHardFilters,
      understanding,
      undefined,
    );
    chatParsed = chatResult.parsed;
    toolState = chatResult.toolState;
  }

  const chatReply = (chatParsed?.reply ?? "").trim();
  const chatSuggestions = (chatParsed?.suggestions ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const deferChatReady =
    Boolean(chatParsed?.affirmMatch) ||
    holdChatForMatch ||
    input.action === "confirm_browse" ||
    input.action === "confirm_match";
  if (chatReply && !deferChatReady) {
    hooks?.onChatDone?.({ reply: chatReply, suggestions: chatSuggestions });
  }

  const userAffirmedSearchPre =
    input.action === "confirm_browse" ||
    input.action === "confirm_match" ||
    Boolean(chatParsed?.affirmMatch);

  const runExtract = shouldRunSideExtract(input, chatParsed, input.action, {
    holdChatForMatch,
    userAffirmedSearch: userAffirmedSearchPre,
    wishLane,
    content,
  });

  if (runExtract) {
    extracted = await runSideExtract({
      lang: input.lang,
      history: input.history,
      userMessage: content,
      prevDraft: draft,
      prevHardFilters: hardFilters,
      prevBuddyHardFilters: buddyHardFilters,
      prevUnderstanding: understanding,
    });
    if (extracted) {
      draft = extracted.draft;
      hardFilters = extracted.hardFilters;
      buddyHardFilters = extracted.buddyHardFilters;
      understanding = extracted.understanding;
      readyToPublish = extracted.readyToPublish;
      const enriched = enrichDraftLocation(
        draft,
        hardFilters,
        input.profile.city ?? "",
        content,
      );
      draft = enriched.draft;
      hardFilters = enriched.hardFilters;
      const cold = applySideColdStartPrefs(input.profile, draft, buddyHardFilters);
      draft = cold.draft;
      buddyHardFilters = cold.buddyHardFilters;
    }
  }

  if (!chatParsed) {
    const cfg = await import("./config.server").then((m) => m.getServerConfig());
    const fb = fallback(input, cfg.deepseekApiKey ? "error" : "no_key");
    return {
      ...fb,
      understanding,
      hardFilters,
      buddyHardFilters,
      wishDraft: draft,
      pendingConfirm,
      pendingBrowseConfirm,
      pendingMatchConfirm,
      pendingOfferMatch,
      wishLane,
      browseSearched,
    };
  }

  let matchIntentId = input.matchIntentId;
  let matchQuality: MatchQuality | undefined;
  let crossCityMatch = false;
  let nearMissIds: string[] = [];
  let recallEmpty = false;
  let matchReason: string | undefined;

  // New wish becomes active — clear prior match until user asks again.
  if (publishedThisTurn) {
    matchIntentId = null;
  }

  const browseReady = browseClarifyComplete(
    { ...input, wishLane, wishDraft: draft },
    draft,
    hardFilters,
    buddyHardFilters,
    understanding,
  );

  const pendingUserAsk =
    (chatParsed?.askUserInfo && typeof chatParsed.askUserInfo === "object"
      ? parseAskUserInfoArgs(chatParsed.askUserInfo as Record<string, unknown>)
      : null) ?? toolState.pendingUserAsk;

  const placeJustConfirmed =
    input.action === "resolve_user_ask" &&
    input.userAskResolution?.fieldKey === ACTIVITY_PLACE_FIELD_KEY &&
    input.userAskResolution.status === "confirmed" &&
    Boolean(input.userAskResolution.value?.trim());

  const llmWantsSearch =
    !pendingUserAsk &&
    (Boolean(chatParsed?.affirmMatch) ||
      Boolean(toolState.lastSearchIds.length > 0) ||
      placeJustConfirmed);

  // ---- People matching after chat affirms search ---------------------------
  const wantsPeopleSearch =
    !pendingUserAsk &&
    (Boolean(chatParsed?.affirmMatch) ||
      Boolean(toolState.lastSearchIds.length > 0) ||
      placeJustConfirmed);

  if (wantsPeopleSearch) {
    return runSidePeopleMatchTurn({
      input,
      draft,
      understanding,
      hardFilters,
      buddyHardFilters,
      myIntentId,
      content,
      suggestions: chatSuggestions,
      onDelta,
      hooks,
    });
  }

  const userAffirmedBrowse =
    !pendingUserAsk &&
    (input.action === "confirm_browse" ||
      (wishLane === "browse" && llmWantsSearch) ||
      (wishLane === "browse" && placeJustConfirmed));
  const userAffirmedMatch =
    !pendingUserAsk &&
    wishLane !== "browse" &&
    Boolean(myIntentId) &&
    (input.action === "confirm_match" || Boolean(chatParsed?.affirmMatch) || llmWantsSearch);

  /** Affirm said yes — place gaps use cold-start soft; required-info cards come from LLM askUserInfo. */
  let browseSearchReady = userAffirmedBrowse;

  if (userAffirmedBrowse && wishLane === "browse" && !input.matchIntentId) {
    const placeCue = [draft.placeRaw, draft.city_zh, draft.city, draft.rawText, content]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join("\n");
    const extracted = await runPlaceExtract({
      lang: input.lang,
      placeRaw: placeCue,
      profileCity: input.profile.city,
      rawText: draft.rawText,
      history: [
        ...input.history,
        ...(content.trim() ? [{ role: "user" as const, content }] : []),
      ],
    });
    draft = mergePlaceIntoDraft(input, draft, extracted);
    const synced = enrichDraftLocation(draft, hardFilters, "", content);
    draft = synced.draft;
    hardFilters = synced.hardFilters;
    const cold = applySideColdStartPrefs(input.profile, draft, buddyHardFilters);
    draft = cold.draft;
    buddyHardFilters = cold.buddyHardFilters;
  }

  if (
    wishLane === "publish" &&
    !myIntentId &&
    input.action !== "confirm_publish" &&
    input.action !== "confirm_browse" &&
    !(input.pendingConfirm && isPublishFormAcknowledgement(input.userMessage ?? content))
  ) {
    const chatReplyTrim = (chatParsed?.reply ?? "").trim();
    const publishProgress = assessWishPublishClarifyProgress({
      draft,
      hardFilters,
      understanding,
      profile: input.profile,
      history: publishClarifyHistory(input.history, input.userMessage ?? content),
    });
    const resolved = resolvePublishFormOpen({
      confirmLine: chatParsed?.confirmLine,
      existing: pendingConfirm,
      reply: chatReplyTrim,
      lang: input.lang,
      draft,
      hardFilters,
      readyToPublish,
      publishProgress,
    });
    if (resolved) {
      pendingConfirm = resolved;
    }
  }
  // Browse: never park pendingBrowseConfirm — search signals fire immediately above.
  if (wishLane === "browse") {
    pendingBrowseConfirm = null;
  }

  const browseProgress = assessWishClarifyProgress({
    draft,
    hardFilters,
    buddyHardFilters,
    understanding,
    profile: input.profile,
    history: [
      ...input.history,
      ...(content.trim() ? [{ role: "user" as const, content }] : []),
    ],
  });
  void browseProgress;

  const recallMine = resolveRecallMine(
    { ...input, wishDraft: draft, hardFilters },
    draft,
    myIntentId,
    hardFilters,
    /* allowEmptyForSearch */ llmWantsSearch || input.action === "confirm_browse",
  );

  if (recallMine && isLightSideQueueAction(input.action)) {
    const queued = await handleSideQueueBrowseAction(input, recallMine, input.lang);
    if (queued) return queued;
  }

  if (browseSearchReady) {
    pendingBrowseConfirm = null;
  }

  if (pendingOfferMatch && isOfferMatchDecline(input.userMessage ?? "")) {
    pendingOfferMatch = false;
  }

  if (input.action === "confirm_publish" && myIntentId) {
    pendingConfirm = null;
  }
  if (input.action === "confirm_browse" && browseSearchReady) {
    pendingBrowseConfirm = null;
  }

  const userWantsMatch =
    !publishedThisTurn &&
    (wishLane === "browse"
      ? browseSearchReady
      : wishLane === "publish"
        ? input.action === "confirm_match" ||
          (pendingOfferMatch &&
            (isOfferMatchAffirmation(input.userMessage ?? "") ||
              Boolean(chatParsed?.affirmMatch))) ||
          (Boolean(myIntentId) && userAffirmedMatch)
        : browseSearchReady ||
          input.action === "confirm_browse" ||
          userAffirmedMatch) ||
    (lightActions.includes(input.action) && Boolean(myIntentId || input.matchIntentId));

  const shouldPick =
    Boolean(recallMine) &&
    !publishedThisTurn &&
    (userWantsMatch || Boolean(matchIntentId));

  log.info("side", "match-gate", {
    wishLane,
    action: input.action,
    shouldPick,
    userWantsMatch,
    userAffirmedBrowse,
    browseSearchReady,
    userAffirmedMatch,
    browseReady,
    affirmMatchFlag: Boolean(chatParsed?.affirmMatch),
    hasRecallMine: Boolean(recallMine),
    recallMineOwnerId: recallMine?.ownerId ?? null,
    recallMineKind: recallMine?.kind ?? null,
    recallMineCity: recallMine
      ? recallMine.city_zh || recallMine.city || recallMine.ownerCity_zh || recallMine.ownerCity || ""
      : null,
    draftRaw: (draft.rawText || "").slice(0, 80),
    pendingBrowseConfirm: Boolean(pendingBrowseConfirm || input.pendingBrowseConfirm),
    myIntentId: myIntentId ?? null,
    matchIntentIdIn: input.matchIntentId ?? null,
  });

  let rankedQueue = input.rankedQueue ?? [];
  let queueCursor = input.queueCursor ?? 0;
  let queueFingerprint = input.queueFingerprint ?? null;
  let passedIntentIds = input.passedIntentIds ?? [];
  let shownIntentIds = input.shownIntentIds ?? input.triedIntentIds ?? [];

  if (publishedThisTurn) {
    rankedQueue = [];
    queueCursor = 0;
    queueFingerprint = null;
    passedIntentIds = [];
    shownIntentIds = [];
  }

  const browseStrict = wishLane === "browse";
  const queueFp = recallMine
    ? sideWishQueueFingerprint(
        recallMine.id,
        hardFilters,
        buddyHardFilters,
        understanding,
        browseStrict,
      )
    : null;

  if (queueFp && queueFingerprint && queueFingerprint !== queueFp) {
    rankedQueue = [];
    queueCursor = 0;
    queueFingerprint = null;
    passedIntentIds = [];
  }

  let recall = recallMine
    ? await recallWishCandidatesServer(
        {
          mine: recallMine,
          hardFilters,
          buddyHardFilters,
          understanding,
          exclude: [...(input.triedIntentIds ?? []), ...passedIntentIds],
          excludeOwnerIds: input.triedOwnerIds,
          shownIds: shownIntentIds,
          passedIds: passedIntentIds,
          browseStrict,
          seekerProfile: input.profile,
        },
        input.lang,
      )
    : null;

  let filtersRelaxed = recall?.filtersRelaxed ?? false;
  let relaxHints = recall?.relaxHints ?? [];

  const shouldRebuildQueue =
    Boolean(recallMine && recall && shouldPick) &&
    (input.action === "rematch" || rankedQueue.length === 0);

  if (shouldRebuildQueue && recall!.candidates.length > 0) {
    const rank = await runSideWishRank({
      lang: input.lang,
      mine: recallMine!,
      candidates: recall!.candidates,
      understanding,
    });
    rankedQueue = rank.rankedIds;
    queueCursor = 0;
    queueFingerprint = queueFp;
    passedIntentIds = [];
    shownIntentIds = [];
  }

  if (recallMine && recall && shouldPick) {
    if (wishLane === "browse" || userWantsMatch) {
      browseSearched = true;
    }
    if (pendingOfferMatch && userWantsMatch) {
      pendingOfferMatch = false;
    }
    nearMissIds = recall.nearMissIds;
    recallEmpty = recall.candidates.length === 0;
    crossCityMatch = recall.crossCityUsed;

    const ids =
      toolState.lastSearchIds.length > 0
        ? toolState.lastSearchIds.filter((id) => recall!.candidates.some((c) => c.id === id))
        : recall.candidates.map((c) => c.id);
    const candidateIdsForPick = ids.length > 0 ? ids : recall.candidates.map((c) => c.id);
    let picked: string | null = null;

    if (rankedQueue.length > 0) {
      const idx = Math.min(queueCursor, rankedQueue.length - 1);
      picked = rankedQueue[idx] ?? rankedQueue[0] ?? null;
      queueCursor = idx;
      if (picked) {
        shownIntentIds = shownIntentIds.includes(picked) ? shownIntentIds : [...shownIntentIds, picked];
      }
    } else {
      picked = pickMatchId(
        chatParsed.pickMatchIntentId ?? null,
        candidateIdsForPick,
        input,
        toolState.suggestedMatchId,
      );

      if (!picked && (input.action === "skip_match" || input.action === "see_next" || input.action === "rematch")) {
        const next = pickNextFromRecall(recall, input.action === "see_next" ? null : input.matchIntentId);
        picked = next?.id ?? null;
        if (next) matchQuality = next.quality;
        crossCityMatch = next?.crossCity ?? crossCityMatch;
      }
    }

    if (picked) {
      const row = recall.candidates.find((c) => c.id === picked);
      matchQuality = row?.quality ?? matchMetaForIntent(recallMine, picked)?.quality;
      crossCityMatch = row?.crossCity ?? matchMetaForIntent(recallMine, picked)?.crossCity ?? crossCityMatch;
    }

    if (recallEmpty) {
      matchIntentId = null;
    } else if (picked) {
      matchIntentId = picked;
      matchReason = await generateMatchReason({
        lang: input.lang,
        mineId: recallMine.id,
        otherId: picked,
        mine: recallMine,
      });
    }

    log.info("side", "match-result", {
      wishLane,
      browseSearched,
      recallEmpty,
      candidateCount: recall.candidates.length,
      filteredCount: recall.filteredCount,
      filtersRelaxed: filtersRelaxed,
      relaxHints,
      crossCityMatch,
      picked: matchIntentId,
      topIds: recall.candidates.slice(0, 5).map((c) => c.id),
      nearMissIds: nearMissIds.slice(0, 3),
    });
  } else if (wishLane === "browse" || userWantsMatch) {
    log.info("side", "match-skipped", {
      wishLane,
      shouldPick,
      hasRecallMine: Boolean(recallMine),
      hasRecall: Boolean(recall),
      reason: !recallMine
        ? "no_recall_mine"
        : !recall
          ? "no_recall_result"
          : !shouldPick
            ? "gate_closed"
            : "unknown",
    });
  }

  const mine = recallMine;

  let reply = (chatParsed.reply ?? "").trim();
  let suppressAssistantReply = false;
  if (
    input.pendingConfirm &&
    !myIntentId &&
    isPublishFormAcknowledgement(input.userMessage ?? content)
  ) {
    pendingConfirm = input.pendingConfirm;
    suppressAssistantReply = true;
    reply = "";
  } else if (!reply) {
    const cfg = await import("./config.server").then((m) => m.getServerConfig());
    return fallback(input, cfg.deepseekApiKey ? "error" : "no_key");
  }

  // Browse deliver-now: never force a pendingBrowseConfirm wait card.
  pendingBrowseConfirm = wishLane === "browse" ? null : pendingBrowseConfirm;

  let handoffTo: "matchmaker" | null = null;

  const freshMatchSearch =
    userWantsMatch &&
    shouldPick &&
    Boolean(recallMine) &&
    !handoffTo &&
    !isLightSideQueueAction(input.action) &&
    (shouldRebuildQueue || !input.matchIntentId || input.action === "rematch");

  if (freshMatchSearch) {
    hooks?.onMatchReady?.({
      browseSearched,
      matchIntentId,
      matchQuality,
      matchReason,
      crossCityMatch,
      nearMissIds,
      recallEmpty,
      rankedQueue,
      queueCursor,
      queueFingerprint,
      passedIntentIds,
      shownIntentIds,
      wishLane,
      pendingBrowseConfirm,
    });
    // Single beat: stream intro as the only assistant reply (Matchmaker polish).
    reply = await runSideMatchIntroReply({
      lang: input.lang,
      wishLane,
      mine: recallMine!,
      otherId: matchIntentId,
      recallEmpty,
      matchReason,
      matchQuality,
      crossCityMatch,
      relaxHints,
      onDelta,
    });
    hooks?.onChatDone?.({ reply, suggestions: [] });
  } else if (recallEmpty && recallMine && !handoffTo) {
    matchIntentId = null;
    const mentionsEmpty = replyMentionsEmptyPool(reply, input.lang);
    const looksOptimistic = replyLooksLikeStartingSearch(reply, input.lang);
    if (looksOptimistic && !mentionsEmpty) {
      reply = explicitEmptyPoolReply(input, draft, recallMine);
    } else if (!mentionsEmpty) {
      reply = zh(input.lang)
        ? `${reply} 按你现在的条件，暂时还没有合适的人——要不要放宽时间、水平，或换个活动试试？`
        : `${reply} With your current filters I don't have a good match yet — want to loosen when, level, or try another activity?`;
    }
  }

  // Deferred chat ready (affirmMatch) but this turn did not polish an intro — commit chat now.
  if (deferChatReady && !freshMatchSearch && chatReply) {
    hooks?.onChatDone?.({ reply: chatReply, suggestions: chatSuggestions });
  }

  if (!freshMatchSearch && crossCityMatch && matchIntentId && !handoffTo) {
    if (!replyMentionsCrossCity(reply, input.lang)) {
      const extra = zh(input.lang)
        ? "同城暂时没有，这位来自其他城市。"
        : "No same-city match — this person is in another city.";
      reply = `${reply} ${extra}`;
    }
  }

  if (pendingConfirm?.trim() && wishLane === "unset") {
    wishLane = "publish";
  }

  if (pendingUserAsk) {
    pendingConfirm = null;
    pendingBrowseConfirm = null;
    pendingMatchConfirm = null;
  }

  return {
    reply,
    understanding,
    hardFilters,
    buddyHardFilters,
    wishDraft: draft,
    pendingConfirm,
    pendingBrowseConfirm,
    pendingMatchConfirm,
    pendingOfferMatch,
    wishLane,
    browseSearched,
    myIntentId,
    matchIntentId,
    matchQuality,
    matchReason,
    crossCityMatch,
    nearMissIds,
    stage: myIntentId ? "published" : "prompt",
    suggestions: (chatParsed?.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
    handoffTo,
    handoffSummary: (chatParsed?.handoffSummary ?? "").trim(),
    transitionReply: (chatParsed?.transitionReply ?? "").trim(),
    recallEmpty,
    filtersRelaxed,
    relaxHints,
    rankedQueue,
    queueCursor,
    queueFingerprint,
    passedIntentIds,
    shownIntentIds,
    suppressAssistantReply: suppressAssistantReply || undefined,
    showMyWishes: toolState.showMyWishes || undefined,
    pendingUserAsk,
  };
}

export type SideStreamEvent =
  | { type: "delta"; text: string }
  | { type: "ready"; reply: string; suggestions: string[] }
  | { type: "matchReady"; preview: SideMatchPreview }
  | { type: "done"; result: SideTurnOutput };

export function sideTurnReadable(input: SideTurnInput): ReadableStream<SideStreamEvent> {
  return new ReadableStream<SideStreamEvent>({
    async start(controller) {
      try {
        const result = await runSideTurn(
          input,
          (text) => {
            controller.enqueue({ type: "delta", text });
          },
          {
            onChatDone: ({ reply, suggestions }) => {
              controller.enqueue({ type: "ready", reply, suggestions });
            },
            onMatchReady: (preview) => {
              controller.enqueue({ type: "matchReady", preview });
            },
          },
        );
        controller.enqueue({ type: "done", result });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export { EMPTY_WISH_HARD_FILTERS, emptyWishDraft };
