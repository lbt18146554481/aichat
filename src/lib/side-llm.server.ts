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
  rosterFromIntentIds,
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
  wishLaneChoicePromptSection,
  wishLanePickedPromptSection,
  wishLaneSwitchPromptSection,
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
  lang: SideLang;
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
    lang: input.lang,
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

function userContent(input: SideTurnInput): string {
  if (input.action === "start") {
    if (input.seed?.trim()) return input.seed.trim();
    const trait = input.preferredTrait?.trim();
    const fromHandoff =
      Boolean(input.handoffSummary?.trim()) || input.history.some((h) => h.role === "user");
    if (fromHandoff && isAgentFirstReply(input.history)) {
      return zh(input.lang)
        ? "[继续] 这是接手后第一次回复：先自然介绍你能帮用户找一起做事的搭子（可发布心愿或先看别人的），再回应用户已说的内容。"
        : "[continue] First reply after takeover: briefly introduce finding activity buddies (publish or browse), then respond to what they already said.";
    }
    if (trait) {
      return zh(input.lang)
        ? `[对话开始] 用户上次偏好搭子特质：「${trait}」。这是接手后第一次回复：先自然介绍你能帮用户找一起做事的搭子（发布心愿或先看别人的），可轻轻带一句偏好，再邀请开始。`
        : `[conversation start] User previously preferred trait: "${trait}". First reply: briefly introduce finding activity buddies (publish or browse), nod to the trait, invite them in.`;
    }
    return zh(input.lang)
      ? "[对话开始] 这是接手后第一次回复：先自然介绍你能帮用户找一起做事的搭子（可发布心愿或先看别人的），再邀请对方开始。"
      : "[conversation start] First reply: briefly introduce helping find activity buddies (publish or browse wishes), then invite them to begin.";
  }
  if (input.action === "confirm_publish") {
    return zh(input.lang)
      ? "[用户点击了表单「发布」按钮] 心愿已由用户亲手发布；reply 简短确认已挂上；禁止再说「请确认发布」或复述 confirmLine；confirmLine 必须为 null；不要 pickMatchIntentId；可轻问是否顺便找搭子。"
      : "[User tapped Publish on the form] Wish is live — brief ack only; no confirmLine; no pickMatchIntentId; may lightly ask if they want a buddy too.";
  }
  if (input.action === "confirm_browse") {
    return zh(input.lang)
      ? "[用户口头确认开始浏览] 简短确认，按当前条件去池子里找；confirmLine 必须为 null；不要 pickMatchIntentId（系统会匹配）。"
      : "[User verbally confirmed browse] Acknowledge briefly; confirmLine null; no pickMatchIntentId (server will match).";
  }
  if (input.action === "confirm_match") {
    return zh(input.lang) ? "[用户口头确认开始找搭子]" : "[User verbally confirmed start matching]";
  }
  if (input.action === "skip_match") {
    const traitNote = input.userMessage?.trim()
      ? zh(input.lang)
        ? `用户刚说想找这种人：「${input.userMessage.trim()}」。记住这一点，再换下一位。`
        : `User just said they prefer: "${input.userMessage.trim()}". Keep that in mind and pick someone else.`
      : zh(input.lang)
        ? "[用户点击：换下一位]"
        : "[User tapped: skip match]";
    return traitNote;
  }
  if (input.action === "see_next") {
    return zh(input.lang) ? "[用户点击：看下一位]" : "[User tapped: see next]";
  }
  if (input.action === "rematch") {
    return zh(input.lang) ? "[心愿条件已更新，重新匹配]" : "[Wish updated, rematch]";
  }
  if (input.action === "rematch_hang") {
    return zh(input.lang)
      ? "[挂起的邀约到期，重新找愿意一起做这件事的人]"
      : "[Hanging invite rematch — look again for someone for this activity]";
  }
  if (input.action === "resolve_user_ask") {
    const res = input.userAskResolution;
    if (res) {
      const note = formatUserAskResolutionForLlm(res, input.lang);
      if (
        res.fieldKey === ACTIVITY_PLACE_FIELD_KEY &&
        res.status === "confirmed" &&
        res.value?.trim()
      ) {
        return zh(input.lang)
          ? `${note}\n地点已齐。若用户正在浏览/搜活动，本轮 affirmMatch=true 立刻搜；askUserInfo=null。`
          : `${note}\nPlace is set. If browsing/searching activities, affirmMatch=true this turn; askUserInfo=null.`;
      }
      return note;
    }
    return zh(input.lang)
      ? "[ask_user_info 结果] status=cancelled value=\"\""
      : "[ask_user_info result] status=cancelled value=\"\"";
  }
  const base = input.userMessage?.trim() ?? "";
  if (input.userAskResolution) {
    const note = formatUserAskResolutionForLlm(input.userAskResolution, input.lang);
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
    /** When false, omit candidate roster from the prompt (clarify turns). */
    showCandidates?: boolean;
    afterToolResults?: boolean;
    /** User just sent a lane selection message this turn. */
    laneJustPicked?: boolean;
    /** Browse/publish clarify progress for prompt injection. */
    clarifyProgress?: ReturnType<typeof assessWishClarifyProgress> | null;
  },
): string {
  const isZh = zh(input.lang);
  const blocked = new Set([...input.triedIntentIds]);
  const showCandidates = opts.showCandidates ?? candidateIds.length > 0;
  const roster = !showCandidates
    ? ""
    : candidateIds.length > 0
      ? rosterFromIntentIds(candidateIds, input.lang, blocked)
      : isZh
        ? "（当前没有合适候选人）"
        : "(No candidates in pool)";

  const draftDates = formatDateRangeLine(
    intentDateRange({
      dateStart: input.wishDraft.dateStart,
      dateEnd: input.wishDraft.dateEnd,
    } as Intent),
    input.lang,
  );
  const draftTimes =
    input.wishDraft.timeStart && input.wishDraft.timeEnd
      ? `${input.wishDraft.timeStart}-${input.wishDraft.timeEnd}`
      : "any";
  const draftLine = isZh
    ? `草稿心愿：kind=${input.wishDraft.kind ?? "?"} when=${input.wishDraft.whenAny ? "any" : input.wishDraft.when ?? "?"} ${draftDates} time=${draftTimes} level=${input.wishDraft.levelAny ? "any" : input.wishDraft.level ?? "?"} text=${input.wishDraft.rawText}`
    : `Draft wish: kind=${input.wishDraft.kind ?? "?"} when=${input.wishDraft.whenAny ? "any" : input.wishDraft.when ?? "?"} ${draftDates} time=${draftTimes} level=${input.wishDraft.levelAny ? "any" : input.wishDraft.level ?? "?"} text=${input.wishDraft.rawText}`;

  const confirmRule =
    opts.wishLane === "publish"
      ? isZh
        ? `发布规则（confirmLine 是开表单的**唯一**开关；reply 写什么都不会自动开表单）：
- 信息已齐、本回合 reply 不再追问时：**同一轮**必须 confirmLine=一句完整复述（活动/时间/地点/搭子要求），系统才展示右侧表单。
- reply 只简短引导用户看右侧检查并点「发布」；**禁止**把复述只写在 reply 里而 confirmLine 留 null。
- **禁止** reply 提到「预填/表单/点发布」而 confirmLine 仍为 null——说了开表单就必须填 confirmLine。
- affirmPublish 永远 false；禁止在 reply 里说「已发布/记下了/挂上了」（除非 action 是 confirm_publish）。
已挂起表单预填：${opts.pendingConfirm ?? "无"}`
        : `Publish rule (confirmLine is the **only** switch for the form — reply alone never opens it):
- When info is complete and this reply asks no further questions: same turn MUST set confirmLine to a one-line recap; only then the form appears.
- reply only nudges the user to check the right pane and tap Publish — never put the recap only in reply with confirmLine null.
- If reply mentions prefill/form/publish button, confirmLine MUST be non-empty.
- affirmPublish always false; never say "published/saved" in reply unless action is confirm_publish.
Pending form prefill: ${opts.pendingConfirm ?? "none"}`
      : "";

  const browseConfirmRule =
    opts.wishLane === "browse"
      ? isZh
        ? `看心愿 / 搜搭子：搜索由你决定。本轮用户有搜池子/找搭子意图 → affirmMatch=true（或 needsTools + search_wishes），系统立刻搜。
「提供信息」和「搜索」拆开：几乎没说活动也能搜，未提及维度用资料冷启动 soft，空字段不参与得分。
不要 confirmLine，不要等「好的」。不是发布，禁止说「心愿记下/发布」。
affirmMatch=false：仅闲聊、选模式、或澄清偏好且本轮不要搜。`
        : `Browse / search: you decide when to search. Search intent this turn → affirmMatch=true (or search_wishes).
Split providing info from search: almost empty draft is OK; cold-start soft fills gaps; empty fields simply don't score.
No confirmLine wait. Not publish; never say wish saved.
affirmMatch=false only when chatting / lane-only / clarifying with no search this turn.`
      : "";

  const offerMatchRule =
    opts.pendingOfferMatch
      ? isZh
        ? `心愿刚发布：若用户已表示要找搭子，本轮 affirmMatch=true 立刻搜；否则可轻问一句要不要找，不要 confirmLine。信息不齐也能搜。`
        : `Wish just published: if they already want a buddy, affirmMatch=true and search now; else one light offer — no confirmLine. Sparse prefs OK.`
      : opts.published && opts.wishLane === "publish" && !opts.pendingOfferMatch
        ? isZh
          ? `已发布：用户明确要找搭子时 affirmMatch=true 立刻搜；不要在没有意图时自动搜。`
          : `Published: affirmMatch=true when they ask for a buddy; don't auto-search without intent.`
        : "";

  const personLaneRule = isZh
    ? `本会话只做「一起做事 / 活动搭子」。不要设置 handoffTo，也不要尝试切到认识新朋友。
若用户明确想认识喜欢某类事的人 / 找对象 / 看人：handoffTo 必须为 null；在 reply 里礼貌说明请回首页开一个「想认识人」的新对话；suggestions 可给「回首页开新对话」类第一人称短句。
若用户仍在描述这次活动的搭子条件（性别、水平等）→ 留在本会话继续。`
    : `This session is do-something / activity-buddy only. Never set handoffTo or switch to meet-someone.
If they clearly want to meet people who like X / dating / browse people: handoffTo must stay null; politely tell them to start a new “meet someone” chat from home; suggestions may include a first-person “start a new chat” phrase.
If they are still describing buddy filters for this activity → stay here.`;

  const firstReply = isAgentFirstReply(input.history);
  const capabilityIntro = firstReply ? agentCapabilityIntroRule("sidebyside", isZh) : "";

  const startHint =
    input.action === "start"
      ? isZh
        ? firstReply
          ? opts.wishLane === "unset"
            ? "这是接手后第一次回复：先自然介绍你能做什么（见「首句能力介绍」），再问用户想「发布自己的心愿」还是「先看看别人的心愿」；不要直接问活动细节。"
            : "这是接手后第一次回复：先自然介绍你能做什么（见「首句能力介绍」），再用一条开放问题请用户说出心愿和要求；不要拆成活动/时间/地点逐项问。"
          : opts.wishLane === "unset"
            ? "先问用户想「发布自己的心愿」还是「先看看别人的心愿」（见 lane 规则），不要直接问活动细节。"
            : "简短打招呼后，用一条开放问题请用户说出心愿和要求；不要拆成字段逐项问。"
        : firstReply
          ? opts.wishLane === "unset"
            ? "First reply after takeover: naturally introduce what you do (see capability intro), then ask publish vs browse — do not jump to activity details."
            : "First reply after takeover: introduce what you do, then one open question for wish + requirements — no field checklist yet."
          : opts.wishLane === "unset"
            ? "Ask publish vs browse first (see lane rules); do not jump to activity details."
            : "Brief greet, then one open question for wish + requirements — no field checklist yet."
      : "";

  const laneRule =
    opts.wishLane === "unset"
      ? wishLaneChoicePromptSection(input.lang)
      : wishLaneSwitchPromptSection(opts.wishLane, input.lang);

  const clarifyRule =
    opts.wishLane === "unset"
      ? ""
      : opts.wishLane === "publish"
        ? isZh
          ? `澄清节奏（publish）：用户主导，不要追问字段清单。有活动核即可 confirmLine 开表单；缺维可空。needsTools=false。`
          : `Publish clarify: user-led, don't chase field checklists. confirmLine when activity is clear enough; missing dims can stay empty. needsTools=false.`
        : isZh
          ? `澄清节奏（browse）：用户主导。本轮要搜就 affirmMatch=true（或 search_wishes），立刻交付；不要 confirmLine 等待确认。缺维冷启动 soft。`
          : `Browse clarify: user-led. If this turn is a search, affirmMatch=true (or search_wishes) and deliver now — no confirmLine wait. Missing dims cold-start soft.`;

  const lazyToolsRule = opts.afterToolResults
    ? ""
    : isZh
      ? `Lazy tools（needsTools 放 JSON 最前）：
- 默认 needsTools=false，正常写 reply。
- 本轮需求是搜池子/找搭子：优先 affirmMatch=true 让系统搜；或 needsTools=true + toolNames=["search_wishes"] / ["preview_wish_matches"]（reply 必须为 ""）。
- 用户要看本会话已发心愿：needsTools=true，toolNames=["show_my_wishes"]；reply 必须为 ""。
- 不要用 confirmLine 做「等确认再搜」；browse 的 confirmLine 应始终为 null（publish 开表单除外）。
- 系统会在工具跑完后另起一轮生成最终 reply（第一轮 reply 不会进历史）。
- 若本轮会搜池子：reply 可简短，系统会在搜完后用一条介绍替换为最终回复（像 Matchmaker 一拍）。`
      : `Lazy tools (needsTools first in JSON):
- Default needsTools=false with a normal reply.
- This turn is a pool search: prefer affirmMatch=true for server search; or needsTools=true with toolNames=["search_wishes"] / ["preview_wish_matches"] (reply must be "").
- Show session wishes: needsTools=true, toolNames=["show_my_wishes"]; reply "".
- Never use confirmLine to wait before searching; browse confirmLine must stay null (publish form excepted).
- The server runs tools then a second reply turn; the first reply is discarded.
- If this turn searches the pool: keep reply short — server replaces with one intro after recall (Matchmaker-style single beat).`;

  const afterToolsRule = opts.afterToolResults
    ? isZh
      ? "工具已跑完：根据【工具结果】写最终 reply。needsTools 必须为 false。可引用数量/是否为空，禁止编造 id。"
      : "Tools finished: write the final reply from [tool results]. needsTools must be false. Cite counts/empty honestly; no invented ids."
    : "";

  return [
    formatNowContext(input.lang),
    isZh
      ? `你在 Maitri 帮用户找一起做事的搭子。温暖、具体，2-5 句。用自然语言，不要像系统播报。
本会话只负责一起做事；若用户明确要找人/看人，提示回首页开新对话。
未选定 lane 时：只问发布还是浏览，不要澄清字段。
browse：本轮有搜池子意图 → affirmMatch=true（或 search_wishes）立刻搜；信息不齐也可搜（冷启动 soft）；禁止 confirmLine 等待。
publish：有活动核即可 confirmLine 开表单 → 用户点发布；禁止口头发布；发布后用户要找搭子则 affirmMatch=true 立刻搜。
必填信息 / 弹卡：见下方【必填信息】专块，不要另起一套追问清单。
已发布：${opts.published ? `id=${input.myIntentId}` : "否"}
${crossCityUsed ? "跨城候选——reply 里说明。" : "优先同城。"}
${recallEmpty ? "无候选人——pickMatchIntentId=null，明确说暂时没有。" : "有候选人。"}
handoffTo 必须始终为 null。
${selfVoiceRule(true)}`
      : `You help people find someone to do activities with on Maitri. Warm, concise, human — not a system announcer.
Do-something only; if they want to meet people, send them to a new home chat.
Before lane: only ask publish vs browse.
Browse: search intent this turn → affirmMatch=true (or search_wishes); sparse prefs OK with cold-start soft; no confirmLine wait.
Publish: confirmLine opens form when activity is clear → user taps Publish; after publish, affirmMatch=true when they want a buddy.
Required fields / askUserInfo: see the 【Required info】 block below — do not invent extra checklists.
Published: ${opts.published ? `id=${input.myIntentId}` : "no"}
${crossCityUsed ? "Cross-city — say so in reply." : "Same-city first."}
${recallEmpty ? "No candidates — pickMatchIntentId=null; say none yet." : "Candidates available."}
handoffTo must always be null.
${selfVoiceRule(false)}`,
    requiredInfoPromptSection(input.lang),
    startHint,
    capabilityIntro,
    input.preferredTrait?.trim()
      ? isZh
        ? `用户偏好搭子特质：${input.preferredTrait.trim()}`
        : `Preferred trait: ${input.preferredTrait.trim()}`
      : "",
    input.handoffSummary
      ? isZh
        ? `接手摘要：${input.handoffSummary}`
        : `Handoff: ${input.handoffSummary}`
      : "",
    input.handoffHints?.activity
      ? isZh
        ? `活动线索：${input.handoffHints.activity}`
        : `Activity hint: ${input.handoffHints.activity}`
      : "",
    profileSummaryForPrompt(input.profile, input.lang),
    lazyToolsRule,
    afterToolsRule,
    laneRule,
    opts.laneJustPicked && opts.wishLane !== "unset"
      ? wishLanePickedPromptSection(opts.wishLane, input.lang)
      : "",
    opts.clarifyProgress &&
      (opts.wishLane === "browse" || opts.wishLane === "publish") &&
      !opts.published
      ? wishClarifyPromptSection(
          opts.clarifyProgress,
          input.lang,
          opts.wishLane === "browse" ? "browse" : "publish",
        )
      : "",
    clarifyRule,
    draftLine,
    confirmRule,
    browseConfirmRule,
    offerMatchRule,
    personLaneRule,
    opts.published
      ? isZh
        ? `已发布心愿 id=${input.myIntentId}`
        : `Published wish id=${input.myIntentId}`
      : opts.wishLane === "browse"
        ? isZh
          ? "看心愿模式（未发布也可匹配）"
          : "Browse mode (match without publish)"
        : isZh
          ? "尚未发布心愿"
          : "Wish not published yet",
    roster
      ? isZh
        ? `候选人（Top ${WISH_RECALL_LIMIT}）：\n${roster}`
        : `Candidates (Top ${WISH_RECALL_LIMIT}):\n${roster}`
      : "",
    isZh
      ? `JSON（needsTools 放最前；confirmLine 紧跟其后；needsTools=true 时 reply 为 ""）：
澄清中：{"needsTools":false,"toolNames":[],"confirmLine":null,"askUserInfo":null,"reply":"...","suggestions":["短句1"],"affirmPublish":false,"affirmMatch":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}
browse 缺地点弹卡：{"needsTools":false,"toolNames":[],"confirmLine":null,"askUserInfo":{"fieldKey":"activity_place","prompt":"活动想在哪个城市或区域？也可写线上/地点不限","kind":"text","placeholder":"例如：上海"},"reply":"找活动还差一个地点。","suggestions":[],"affirmPublish":false,"affirmMatch":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}
publish 开表单（同一轮）：{"needsTools":false,"toolNames":[],"confirmLine":"这周末北京香山徒步，搭子最好是男生","askUserInfo":null,"reply":"信息齐了，请检查右侧表单并点发布。","suggestions":[],"affirmPublish":false,"affirmMatch":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}`
      : `JSON (needsTools first; confirmLine right after; reply="" when needsTools=true):
While clarifying: {"needsTools":false,"toolNames":[],"confirmLine":null,"askUserInfo":null,"reply":"...","suggestions":["..."],"affirmPublish":false,...}
Browse missing place card: {"needsTools":false,"toolNames":[],"confirmLine":null,"askUserInfo":{"fieldKey":"activity_place","prompt":"Where should the activity be? City/area, or online/anywhere","kind":"text"},"reply":"I still need a place before searching.","suggestions":[],"affirmMatch":false,...}
Publish — open form (same turn): {"needsTools":false,"toolNames":[],"confirmLine":"Weekend hike at Xiangshan, prefer male buddy","askUserInfo":null,"reply":"Looks good — check the form on the right and tap Publish.","suggestions":[],"affirmPublish":false,...}`,
    opts.pendingBrowseConfirm
      ? isZh
        ? "用户在确认是否按条件开始浏览池子：suggestions 给 2-4 条第一人称短句（确认开搜 / 再改条件等），随上下文生成，勿用固定模板。"
        : "User confirming browse search: 2-4 contextual first-person suggestions (confirm search / edit criteria) — no fixed templates."
      : opts.pendingConfirm
        ? isZh
          ? "发布表单**已在右侧展示**。用户口头说「好的/可以/OK」时：reply 只一句提醒点「发布」；confirmLine 必须为 null；不要重复复述心愿。"
          : "Publish form is **already on screen**. If user says ok/yes: one-line nudge to tap Publish; confirmLine must be null; do not recap the wish again."
        : opts.wishLane === "publish"
          ? isZh
            ? "reply 用简体中文。开表单轮：confirmLine 必填复述，reply 引导看右侧；澄清轮 confirmLine=null。suggestions 2-4 条第一人称短句（非你的提问）。"
            : "English reply. Form-open turn: confirmLine required with recap, reply nudges right pane; clarify turns confirmLine=null. suggestions = 2-4 first-person phrases."
          : isZh
            ? "reply 用简体中文。suggestions 必须给 2-4 条非空短句（第一人称、用户可直接当回复），根据当前对话自行生成，勿照抄固定话术；不要写成你对用户的提问。澄清「找活动 vs 找喜欢的人 / 先聊右边这位」时，给 3 条立场不同的第一人称短句。"
            : "Write reply and suggestions in English only. suggestions = 2-4 contextual first-person phrases the user might say next (no fixed templates; not your questions). When clarifying activity vs people-who-like-it vs chat-with-match, give 3 distinct first-person options.",
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
  const isZh = zh(input.lang);
  return {
    reply:
      reason === "no_key"
        ? isZh
          ? "暂时连不上对话服务，请确认 DEEPSEEK_API_KEY。"
          : "Can't reach chat — check DEEPSEEK_API_KEY."
        : isZh
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

/** Dedicated block: when required fields are missing, ask via card — never search. */
function requiredInfoPromptSection(lang: SideLang): string {
  if (lang === "zh-CN") {
    return `【必填信息】单独规则块——先对场景，再决定搜还是弹卡。

一、什么场景必须有什么信息
- browse 搜活动/找搭子：必须有活动地点。城市/区域算有；用户明确「线上」或「地点不限/anywhere」也算有；资料城市可当作已有（冷启动）。时间/搭子不齐也能搜。
- publish 开表单：有活动核即可；地点可在右侧表单补。
- 其它场景：无额外硬必填（不要为凑字段追问）。

二、本轮想搜但必填缺失时（必须弹卡，禁止搜）
1. reply 先说清楚缺什么（只提真正缺的那一项，例如「还差活动地点」）
2. 设 askUserInfo（等同调用 ask_user_info 工具）：fieldKey=activity_place（或对应缺失项），prompt 问该项，kind=text 或 select
3. affirmMatch 必须为 false；needsTools=false；confirmLine=null
4. 用户确认/取消/忽略卡片后下一轮再决定；取消或忽略 → 该项视为空

三、必填已齐且本轮有搜意图 → affirmMatch=true，askUserInfo=null。`;
  }
  return `[Required info] Dedicated rules — match the scenario, then search or show a card.

1) What each scenario requires
- Browse search: activity place required. City/area counts; explicit “online”/“anywhere” counts; profile city may count (cold-start). When/buddy may be sparse.
- Publish form: activity core is enough; place can be filled on the form.
- Otherwise: no extra hard requirements (don’t chase fields).

2) Want to search this turn but a required field is missing (must use card; do not search)
1. In reply, state what is missing (only that field)
2. Set askUserInfo (same as ask_user_info tool): fieldKey=activity_place (or the missing key), clear prompt, kind=text|select
3. affirmMatch must be false; needsTools=false; confirmLine=null
4. After confirm/cancel/skip, decide next turn; cancel/skip = empty for that field

3) Required fields present + search intent → affirmMatch=true, askUserInfo=null.`;
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
  const streamOpts = chatOpts.afterToolResults
    ? { temperature: 0.85, maxTokens: 1500 }
    : {
        temperature: 0.85,
        maxTokens: 1500,
        suppressReplyWhen: { field: "needsTools", equals: true },
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
      showCandidates: toolState.lastSearchIds.length > 0,
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
  log.info("side", "turn", {
    action: input.action,
    userPreview: content.slice(0, 80),
    published: Boolean(input.myIntentId),
    historyLen: input.history.length,
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
    showCandidates: preRecallNeeded,
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
      onDelta,
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
