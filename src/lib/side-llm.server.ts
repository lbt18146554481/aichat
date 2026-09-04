import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { SideBySideHints } from "./handoff";
import {
  getIntentById,
  publishMyIntent,
  revokeMyIntent,
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
import { formatDateRangeLine, formatNowContext, intentDateRange, resolveDraftDates } from "./wish-date";
import { assessWishClarifyProgress, isBrowseClarifyComplete } from "./wish-clarify";
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
  resolvePlaceRaw,
} from "./wish-place";
import { wishDescriptionsFromDraft } from "./wish-match-profile";
import {
  type WishLane,
  canSwitchWishLane,
  detectWishLaneSwitch,
  inferWishLaneFromText,
  isOfferMatchAffirmation,
  isOfferMatchDecline,
  isVagueExploreWishSeed,
  isWishLaneSelectionMessage,
  wishLaneChoicePromptSection,
  wishLanePickedPromptSection,
  wishLaneSwitchPromptSection,
} from "./wish-lane";
import { draftAsIntent } from "./wish-draft-intent";
import {
  explicitActivityBuddySignal,
  explicitMeetSomeoneSignal,
  userChoseMeetSomeoneAfterDisambig,
} from "./meet-someone-detect";
import {
  runSideMatchFollowUp,
  sideMatchAckFallback,
} from "./side-match-followup-llm.server";
import {
  createSideToolState,
  executeSideTool,
  type SideToolState,
} from "./side-tools.server";

const LAZY_SIDE_TOOL_NAMES = new Set(["search_wishes", "preview_wish_matches"]);

export type SideTurnAction =
  | "start"
  | "message"
  | "confirm_publish"
  | "confirm_browse"
  | "confirm_match"
  | "skip_match"
  | "see_next"
  | "rematch";

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
  matchIntentId: string | null;
  triedIntentIds: string[];
  triedOwnerIds: string[];
  rankedQueue?: string[];
  queueCursor?: number;
  queueFingerprint?: string | null;
  passedIntentIds?: string[];
  shownIntentIds?: string[];
  profile: Profile;
  handoffCount?: number;
  handoffSummary?: string;
  handoffHints?: SideBySideHints;
  /** Set by sideBySideTurnFn so publish persists to DB on the server. */
  userId?: string;
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
  matchQuality?: MatchQuality;
  matchReason?: string;
  crossCityMatch: boolean;
  nearMissIds: string[];
  stage: "prompt" | "published";
  suggestions: string[];
  handoffTo: "matchmaker" | null;
  handoffSummary: string;
  transitionReply: string;
  recallEmpty: boolean;
  filtersRelaxed?: boolean;
  relaxHints?: string[];
  /** Second assistant message after server-side matching (two-beat flow). */
  followUpReply?: string;
  rankedQueue?: string[];
  queueCursor?: number;
  queueFingerprint?: string | null;
  passedIntentIds?: string[];
  shownIntentIds?: string[];
  /** When publish fails place validation — client re-opens the form with this hint. */
  publishPlaceError?: string;
  /** User verbally acked an open publish form — do not append another assistant bubble. */
  suppressAssistantReply?: boolean;
}

/** Partial match state pushed to the client before the follow-up LLM beat. */
export type SideMatchPreview = Pick<
  SideTurnOutput,
  | "browseSearched"
  | "matchIntentId"
  | "matchQuality"
  | "matchReason"
  | "crossCityMatch"
  | "nearMissIds"
  | "recallEmpty"
  | "rankedQueue"
  | "queueCursor"
  | "queueFingerprint"
  | "passedIntentIds"
  | "shownIntentIds"
  | "wishLane"
  | "pendingBrowseConfirm"
>;

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
  return input.userMessage?.trim() ?? "";
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

function isMatchAffirmation(text: string, action: SideTurnAction): boolean {
  if (action === "confirm_match") return true;
  const t = text.trim();
  if (!t) return false;
  if (/^(是的|对|好|好的|确认|可以|行|嗯|ok|okay|yes|yep|sure|go ahead)/i.test(t)) return true;
  return /没有了|就这些|开始(吧|找)|没有别的|可以找了|就这样|你找吧|找吧|帮我找|that's all|no more|start matching|find someone/i.test(
    t,
  );
}

function isBrowseAffirmation(text: string, action: SideTurnAction): boolean {
  if (action === "confirm_browse") return true;
  const t = text.trim();
  if (!t) return false;
  if (/^(是的|对|好|好的|确认|可以|行|嗯|开始|看看|ok|okay|yes|sure|go ahead)/i.test(t)) return true;
  return /开始看|就这样找|可以找了|按这个找|搜吧|找吧/i.test(t);
}

function forcedMatchConfirmLine(
  input: SideTurnInput,
  draft: WishDraft,
  mine: Intent | null,
): string {
  const raw = draft.rawText?.trim() || mine?.rawText?.trim() || "";
  if (zh(input.lang)) {
    return `好的，心愿记下了${raw ? `：${raw}` : ""}。还要补充时间、水平或搭子偏好吗？没有的话我就开始帮你找搭子了。`;
  }
  return `Got it${raw ? `: ${raw}` : ""}. Anything else — when, level, or buddy prefs? If not, I'll start looking.`;
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
  if (extracted.placeOnline) {
    return {
      ...draft,
      placeRaw: extracted.placeRaw,
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
    placeOnline: false,
    placeFlex: extracted.placeFlex,
    place: extracted.place ?? undefined,
    city: labels.city,
    city_zh: labels.city_zh,
  };
}

function publishPlaceErrorMessage(lang: SideLang): string {
  return zh(lang)
    ? "地址不合理，请填写可识别的地点，或写「不限」「线上」"
    : "We couldn't recognize this location. Enter a real place, type «anywhere», or «online».";
}

async function publishDraft(input: SideTurnInput, draft: WishDraft): Promise<Intent> {
  if (input.myIntentId) revokeMyIntent(input.myIntentId);
  const placeRaw = resolvePlaceRaw(draft.placeRaw, draft.city, input.profile.city);
  const cityLabels = draft.placeOnline
    ? { city: "", city_zh: "" }
    : draft.placeFlex
      ? (() => {
          const c = draftCity(input, draft);
          return { city: c.en, city_zh: c.zh };
        })()
      : cityLabelsFromPlace(draft.place ?? null, placeRaw, input.lang);
  const dates = resolveDraftDates(draft);
  const desc = wishDescriptionsFromDraft(draft);
  const intent = publishMyIntent({
    kind: draft.kind ?? "other",
    when: draft.whenAny ? undefined : draft.when,
    level: draft.levelAny ? undefined : draft.level,
    rawText: desc.activityDescRaw || input.userMessage || "",
    city: cityLabels.city,
    city_zh: cityLabels.city_zh,
    strictWhen: draft.strictWhen,
    strictLevel: draft.strictLevel,
    allowCrossCity: draft.allowCrossCity ?? input.hardFilters.allowCrossCity,
    ownerSnapshot: ownerSnapshotFromProfile(input.profile),
    placeRaw,
    placeOnline: draft.placeOnline ?? false,
    placeFlex: draft.placeFlex,
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

function shouldUseMatchTwoPhase(input: SideTurnInput, wishLane: WishLane, browseReady: boolean): boolean {
  const light: SideTurnAction[] = ["skip_match", "see_next", "rematch"];
  const browseAffirm =
    input.action === "confirm_browse" ||
    (input.pendingBrowseConfirm &&
      isBrowseAffirmation(input.userMessage ?? "", input.action)) ||
    (browseReady && isBrowseAffirmation(input.userMessage ?? "", input.action));
  const offerAffirm = input.pendingOfferMatch && isOfferMatchAffirmation(input.userMessage ?? "");
  const matchAffirm = isMatchAffirmation(input.userMessage ?? "", input.action);
  return (
    input.action === "confirm_browse" ||
    input.action === "confirm_match" ||
    light.includes(input.action) ||
    (wishLane === "browse" && browseAffirm && draftSearchable(input.wishDraft)) ||
    (offerAffirm && Boolean(input.myIntentId || draftSearchable(input.wishDraft))) ||
    (matchAffirm && Boolean(input.myIntentId) && wishLane === "publish")
  );
}

function draftSearchable(draft: WishDraft): boolean {
  return draft.kind != null || (draft.rawText?.trim().length ?? 0) >= 2;
}

function resolveRecallMine(
  input: SideTurnInput,
  draft: WishDraft,
  myIntentId: string | null,
  hardFilters: WishHardFilters,
): Intent | null {
  if (myIntentId) {
    return getIntentById(myIntentId);
  }
  if (draftSearchable(draft)) {
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
    matchAckOnly?: boolean;
    /** When false, omit candidate roster from the prompt (clarify turns). */
    showCandidates?: boolean;
    afterToolResults?: boolean;
    /** User just sent a lane selection message this turn. */
    laneJustPicked?: boolean;
  },
): string {
  const isZh = zh(input.lang);
  const blocked = new Set([...input.triedIntentIds]);
  const showCandidates = opts.showCandidates ?? candidateIds.length > 0;
  const roster = !showCandidates
    ? ""
    : opts.matchAckOnly
      ? isZh
        ? "（匹配进行中：本回合不要引用任何候选人）"
        : "(Matching in progress — do not reference candidates this turn)"
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
        ? `看心愿规则：收集完搜索条件后，用 confirmLine 复述条件并问是否按此在池子里找（不是发布，禁止说「心愿记下/发布」）。用户用自然语言确认（如「好的」「开始找吧」）后系统才搜索；不要用按钮文案；affirmMatch=true 表示用户已口头确认、可以开始搜。
已挂起浏览确认：${opts.pendingBrowseConfirm ?? "无"}`
        : `Browse rule: after criteria collected, confirmLine recap search filters (not publish; never say wish saved/published). Search starts only after the user verbally confirms (e.g. "yes" / "start looking"); affirmMatch=true means verbal OK to search.
Pending browse confirm: ${opts.pendingBrowseConfirm ?? "none"}`
      : "";

  const offerMatchRule =
    opts.pendingOfferMatch
      ? isZh
        ? `心愿刚发布：reply 末尾自然轻问一句「要不要顺便帮你找找搭子？」——不要 confirmLine，不要 affirmMatch。用户用自然语言说好（如「好」「帮我找」）再匹配，不要提按钮。`
        : `Wish just published: end reply with a light "Want me to find a buddy too?" — no confirmLine; match only after verbal yes (e.g. "sure" / "find someone"), not buttons.`
      : opts.published && opts.wishLane === "publish" && !opts.pendingOfferMatch
        ? isZh
          ? `已发布：不要自动开始匹配；除非用户明确说要找搭子。`
          : `Published: do not auto-match unless user asks to find a buddy.`
        : "";

  const matchConfirmRule = "";

  const personLaneRule =
    (input.handoffCount ?? 0) >= 2
      ? ""
      : isZh
        ? `目的随时可能切换（最高优先级之一）：
你当前在「找一起做的事 / 活动搭子」流程，但用户**随时**可能改去「找喜欢某类事的人」。核心区分是**找活动**还是**找人**——不要都当成「找人」：
- **找活动**（留在这里）：约跑步、找跑步搭子、周末一起跑、看心愿池里有没有跑步活动——**活动本身是目的**，性别/水平等是搭子条件。
- **找人**（handoff）：想认识喜欢跑步的人、找对象、介绍某个人——**人是目的**，跑步只是偏好/话题。

三种不同目的——不要混为一谈：
A) **找喜欢这类事的人**：认识爱跑步的女生、想被介绍某个爱跑步的人、交友/看人 → 用户明确选 A 后 handoffTo="matchmaker"（reply 与 transitionReply 留空 ""）。
B) **找一起做的事 / 活动搭子**：约跑步、找搭子、周末一起跑、搭子最好女生（仍在描述这次活动）→ handoffTo=null，用工具更新心愿草稿，不要 handoff。
C) **对右侧这位搭子候选有别的想法**：想深聊、想认识 TA 这个人（而不只是约这次活动）→ 先澄清是继续约活动（B），还是改去找喜欢的人（A）。

常见信号：
- A：认识喜欢…的人、想认识爱跑步的人、介绍人、找对象、还是看人吧
- B：一起跑步、找搭子、约跑步、这周末跑、搭子最好女生、水平差不多
- 模糊：「想找女生一起跑步」——可能 B（找跑步这件事），也可能 A（找喜欢跑步的女生）

**一旦 A / B / C 分不清**：
- handoffTo 必须为 null
- affirmPublish=false；不要 pickMatchIntentId；不要发布心愿；不要换下一个搭子
- 在 reply 里用一句自然的话问清楚，例如：
  「你是想找一起跑步这件事（约跑步、找跑步搭子），还是想找喜欢跑步的人（以认识这类人为目的）？」
- suggestions 给 3 条第一人称短句，分别对应 A / B / C 三种目的（措辞随上下文变化，勿照抄固定例句）
- 禁止用「搭子 vs 认识新朋友」这种都在「找人」层面的问法；必须点明**活动 vs 喜欢这类事的人**
- 不要提 Matchmaker、转接、换模块等产品名

**已澄清之后**：
- 明确选 A → handoffTo="matchmaker"，reply 与 transitionReply 留空 ""，不要继续问时间地点或搜心愿池
- 明确选 B → handoffTo=null，继续澄清/发布心愿或匹配搭子
- 用户已说「认识喜欢…的人 / 想通过 X 认识新朋友」等 → 视为 A，立即 handoffTo="matchmaker"，禁止继续 Side by Side 流程

${input.matchIntentId ? "注意：右侧已有一位搭子候选人——用户若突然提认识喜欢…的人/介绍/找对象，优先按上文澄清目的，不要继续介绍搭子或 pick 下一位。" : ""}`
        : `Intent can switch anytime (high priority):
You are in "find an activity / activity buddy", but the user may switch to "find people who like something" at any turn. Core axis: **activity** vs **people who like it** — not both as "finding people":
- **Activity** (stay): schedule a run, find a running buddy, browse running wishes — the **activity is the goal**; gender/level are buddy filters.
- **People** (handoff): meet someone who likes running, be introduced to a person — **the person is the goal**; running is just a preference.

Three goals — do not conflate:
A) **People who like it**: meet someone who loves running, dating, be introduced → after clear A, handoffTo="matchmaker" (reply="" and transitionReply="").
B) **Do the activity together**: run together, find a buddy, buddy should be female, this weekend → handoffTo=null, update wish draft.
C) **Something else about the person on the right**: know them as a person vs just this activity → clarify B vs A first.

If unclear: handoffTo=null; ask e.g. "Do you want to find a run together (buddy for the activity), or meet people who like running?" — NOT "buddy vs meet someone new" (both sound like finding people).
Suggestions e.g. "Find someone to run with" / "Meet people who like running" / "Chat about the person on the right".
After clarify: A → handoffTo="matchmaker"; B → stay side-by-side.

${input.matchIntentId ? "Note: a buddy candidate is on the right — if they mention meeting people who like X, clarify lane first." : ""}`;

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
          ? `澄清节奏（publish）：还缺什么就用 reply 自然追问。四条（活动、时间、地点或地点不限、搭子/补充）都齐且本回合不再追问时 → **必须** confirmLine 非空（开表单）+ reply 引导看右侧；还在追问时 confirmLine 必须为 null。needsTools=false。`
          : `Publish clarify: ask in reply for gaps. When all four fields are complete and you stop asking → confirmLine MUST be non-empty (opens form) + reply nudges right pane; while still asking, confirmLine=null. needsTools=false.`
        : isZh
          ? `澄清节奏（browse）：还缺什么就用 reply 自然追问。条件齐且不再追问时用 confirmLine 复述搜索条件；还在追问时 confirmLine 必须为 null。needsTools=false。`
          : `Browse clarify: ask in reply for gaps. When criteria complete, confirmLine recaps search filters; while asking, confirmLine=null. needsTools=false.`;

  const lazyToolsRule =
    opts.matchAckOnly || opts.afterToolResults
      ? ""
      : isZh
        ? `Lazy tools（needsTools 放 JSON 最前）：
- 默认 needsTools=false，正常写 reply。
- 仅当用户明确要求「先看看池子里有没有/有多少人/帮我搜一下」且条件已足够具体时，needsTools=true，toolNames 取 ["preview_wish_matches"] 或 ["search_wishes"]；此时 reply 必须为 ""。
- 禁止在澄清未齐、未 confirmLine、用户未口头同意开搜时 needsTools=true。
- 系统会在工具跑完后另起一轮生成最终 reply（第一轮 reply 不会进历史）。`
        : `Lazy tools (needsTools first in JSON):
- Default needsTools=false with a normal reply.
- needsTools=true only when the user explicitly asks to preview/search the pool and filters are specific enough; toolNames=["preview_wish_matches"] or ["search_wishes"]; reply must be "".
- Never needsTools while still clarifying or before verbal search consent.
- The server runs tools then a second reply turn; the first reply is discarded.`;

  const afterToolsRule = opts.afterToolResults
    ? isZh
      ? "工具已跑完：根据【工具结果】写最终 reply。needsTools 必须为 false。可引用数量/是否为空，禁止编造 id。"
      : "Tools finished: write the final reply from [tool results]. needsTools must be false. Cite counts/empty honestly; no invented ids."
    : "";

  const matchAckRule = opts.matchAckOnly
    ? isZh
      ? `匹配两拍模式（本回合仅第一拍）：
- reply 只 1-3 句：明确告诉用户「条件/心愿记下了，我现在去池子里找」（禁止说找到/没找到/具体人选）
- 禁止介绍任何具体搭子、禁止匹配理由、禁止预告结果
- pickMatchIntentId 必须为 null；affirmMatch 可为 true
- 匹配结果由系统下一拍自动发第二条消息，本回合勿写结果`
      : `Two-beat matching (beat 1 only):
- reply 1-3 sentences: clearly say filters/wish saved and you're checking the pool now (never found/not found/names)
- do NOT introduce anyone or give match reasons
- pickMatchIntentId must be null; affirmMatch may be true
- results go in a second message next beat — do not preview them`
    : "";

  return [
    formatNowContext(input.lang),
    isZh
      ? `你在 Maitri 帮用户找一起做事的搭子。温暖、具体，2-5 句。用自然语言，不要像系统播报。
用户也可能随时改去「找喜欢某类事的人」——见下方「目的随时可能切换」规则；有模糊信号时，优先澄清「找活动 vs 找喜欢的人」，不要惯性继续推搭子或发布心愿。
未选定 lane 时：只问发布还是浏览，不要澄清字段。
browse lane：先开放问心愿+要求 → 用户说完后只补问缺失项（活动→时间地点→搭子偏好）→ confirmLine 复述 → 用户口头确认后系统才搜心愿池；澄清未齐时禁止说「我去搜/稍等/在现有的人里找」。
publish lane：先开放问心愿+要求 → 补问缺失项 → confirmLine 仅预填表单 → 用户亲手点发布；禁止口头确认就发布；发布后轻问是否找搭子（用户口头说好再匹配）。
已发布：${opts.published ? `id=${input.myIntentId}` : "否"}
${crossCityUsed ? "跨城候选——reply 里说明。" : "优先同城。"}
${recallEmpty ? "无候选人——pickMatchIntentId=null，明确说暂时没有。" : "有候选人。"}
${(input.handoffCount ?? 0) >= 2 ? "不要再 handoffTo。" : "若用户已明确要找「喜欢某类事的人」（而非找活动/搭子），handoffTo=\"matchmaker\"；不确定时先澄清活动 vs 人，见下方规则。"}
${selfVoiceRule(true)}`
      : `You help people find someone to do activities with on Maitri. Warm, concise, human — not a system announcer.
They may switch anytime to "meet someone new" — see lane-switch rules below; when meet-someone signals appear, clarify first; do not keep pushing buddies or publishing by inertia.
Before lane chosen: only ask publish vs browse.
Browse lane: open question for wish + requirements first → after user answers, follow up only on gaps (activity → time/place → buddy) → confirmLine → pool search only after verbal confirm; while clarifying NEVER say you're searching / wait / looking through people.
Publish lane: open question → fill gaps → confirmLine prefill form only → user taps Publish; never publish from chat text; after publish lightly offer buddy search (verbal yes to match).
Published: ${opts.published ? `id=${input.myIntentId}` : "no"}
${crossCityUsed ? "Cross-city — say so in reply." : "Same-city first."}
${recallEmpty ? "No candidates — pickMatchIntentId=null; say none yet." : "Candidates available."}
${(input.handoffCount ?? 0) >= 2 ? "No more handoffTo." : "handoffTo=\"matchmaker\" only when they clearly want meet-someone-new; if unsure, clarify first (see rules below)."}
${selfVoiceRule(false)}`,
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
    matchAckRule,
    lazyToolsRule,
    afterToolsRule,
    laneRule,
    opts.laneJustPicked && opts.wishLane !== "unset"
      ? wishLanePickedPromptSection(opts.wishLane, input.lang)
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
澄清中：{"needsTools":false,"toolNames":[],"confirmLine":null,"reply":"...","suggestions":["短句1"],"affirmPublish":false,"affirmMatch":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}
publish 开表单（同一轮）：{"needsTools":false,"toolNames":[],"confirmLine":"这周末北京香山徒步，搭子最好是男生","reply":"信息齐了，请检查右侧表单并点发布。","suggestions":[],"affirmPublish":false,"affirmMatch":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":""}`
      : `JSON (needsTools first; confirmLine right after; reply="" when needsTools=true):
While clarifying: {"needsTools":false,"toolNames":[],"confirmLine":null,"reply":"...","suggestions":["..."],"affirmPublish":false,...}
Publish — open form (same turn): {"needsTools":false,"toolNames":[],"confirmLine":"Weekend hike at Xiangshan, prefer male buddy","reply":"Looks good — check the form on the right and tap Publish.","suggestions":[],"affirmPublish":false,...}`,
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
    return /开始(帮)?你找|这就.*找|我去找|找找看|开始匹配|帮你找搭子|开始帮你/.test(reply);
  }
  return /start (looking|matching|searching)|i'?ll (look|find|search)|finding someone for you/i.test(
    reply,
  );
}

function replyLooksLikeMatchIntro(reply: string, lang: SideLang): boolean {
  if (zh(lang)) {
    return /有一位|这位.*想|右边.*卡片|搭子候选|匹配到|找到了|推荐.*搭子|详情在右边/.test(reply);
  }
  return /found someone|on the right|matched with|introducing|meet \w+/i.test(reply);
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
  useMatchTwoPhase: boolean,
): boolean {
  if (useMatchTwoPhase) return true;
  if (input.myIntentId && input.action === "confirm_match") return true;
  if (["skip_match", "see_next", "rematch", "confirm_browse"].includes(input.action)) return true;
  return draftSearchable(draft) && Boolean(input.myIntentId);
}

function shouldRunSideExtract(
  input: SideTurnInput,
  chatParsed: LlmSideChatJson | null,
  action: SideTurnAction,
  opts: {
    useMatchTwoPhase: boolean;
    userAffirmedSearch: boolean;
    wishLane: WishLane;
    content: string;
  },
): boolean {
  const light: SideTurnAction[] = ["skip_match", "see_next", "rematch"];
  if (light.includes(action)) return false;
  if (action === "confirm_publish") return false;
  if (chatParsed?.confirmLine?.trim()) return true;
  if (opts.useMatchTwoPhase && opts.userAffirmedSearch) return true;
  if (action === "confirm_browse" || action === "confirm_match") return true;
  if (
    opts.wishLane === "publish" &&
    !input.myIntentId &&
    action === "message" &&
    !isWishLaneSelectionMessage(opts.content) &&
    opts.content.trim()
  ) {
    return true;
  }
  return false;
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
    matchAckOnly?: boolean;
    showCandidates?: boolean;
    afterToolResults?: boolean;
    toolResultsBlock?: string;
    laneJustPicked?: boolean;
  },
  onDelta?: (text: string) => void,
): Promise<LlmSideChatJson | null> {
  const system = buildChatSystem(
    input,
    candidateIds,
    chatOpts.matchAckOnly ? false : recallEmpty,
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
    matchIntentId: input.matchIntentId,
    triedIntentIds: input.triedIntentIds,
    triedOwnerIds: input.triedOwnerIds,
  });

  if (chatOpts.matchAckOnly) {
    const parsed = await runSideChat(
      input,
      candidateIds,
      recallEmpty,
      crossCityUsed,
      content,
      chatOpts,
      onDelta,
    );
    return { parsed, toolState };
  }

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
    /** Recall running — UI may show matching state before beat 2. */
    onMatching?: () => void;
    /** Recall finished — UI can open the result canvas before follow-up text. */
    onMatchReady?: (preview: SideMatchPreview) => void;
    onFollowUpDelta?: (text: string) => void;
    onFollowUpReady?: (opts: { reply: string; suggestions: string[] }) => void;
  },
): Promise<SideTurnOutput> {
  const content = userContent(input);
  log.info("side", "turn", {
    action: input.action,
    userPreview: content.slice(0, 80),
    published: Boolean(input.myIntentId),
    historyLen: input.history.length,
  });
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

  let draft =
    input.wishDraft.rawText
      ? input.wishDraft
      : isWishLaneSelectionMessage(content)
        ? input.wishDraft
        : input.action === "message" && input.userMessage?.trim()
          ? { ...input.wishDraft, rawText: input.userMessage.trim() }
          : input.wishDraft;
  if (
    isWishLaneSelectionMessage(content) &&
    wishLane !== "unset" &&
    isVagueExploreWishSeed(draft.rawText)
  ) {
    draft = { ...draft, rawText: "", kind: null };
  }
  let hardFilters = input.hardFilters;
  let buddyHardFilters = input.buddyHardFilters;
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
    matchIntentId: input.matchIntentId,
    triedIntentIds: input.triedIntentIds,
    triedOwnerIds: input.triedOwnerIds,
  });

  if (input.action === "confirm_publish" && !input.myIntentId) {
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
        myIntentId: null,
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

  if (input.action === "confirm_publish" && !myIntentId) {
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
        myIntentId: null,
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
        myIntentId: null,
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

  const browseReadyPre = browseClarifyComplete(
    { ...input, wishLane, wishDraft: draft },
    draft,
    hardFilters,
    buddyHardFilters,
    understanding,
  );

  const useMatchTwoPhase = shouldUseMatchTwoPhase(
    { ...input, wishLane, pendingOfferMatch, wishDraft: draft, pendingBrowseConfirm },
    wishLane,
    browseReadyPre,
  );

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

  const preRecallNeeded = shouldPreRecall(input, draft, useMatchTwoPhase);
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
        },
        input.lang,
      )
    : null;

  const laneJustPicked =
    isWishLaneSelectionMessage(content) && wishLane !== "unset";
  const chatOpts = {
    published: Boolean(myIntentId),
    wishLane,
    pendingConfirm: useMatchTwoPhase ? null : pendingConfirm,
    pendingBrowseConfirm: input.pendingBrowseConfirm ?? pendingBrowseConfirm,
    pendingMatchConfirm,
    pendingOfferMatch,
    readyToPublish: false,
    matchAckOnly: useMatchTwoPhase,
    showCandidates: preRecallNeeded,
    laneJustPicked,
  };

  const candidateIds = preRecall?.candidates.map((c) => c.id) ?? [];

  const chatResult = await runSideChatWithLazyTools(
    workingInput,
    candidateIds,
    useMatchTwoPhase
      ? false
      : (preRecall?.candidates.length ?? 0) === 0
        ? true
        : candidateIds.length === 0,
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

  const chatReply = (chatParsed?.reply ?? "").trim();
  const chatSuggestions = (chatParsed?.suggestions ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (chatReply) {
    hooks?.onChatDone?.({ reply: chatReply, suggestions: chatSuggestions });
  }

  const userMsgForAffirmPre = (input.userMessage ?? content).trim();
  const userAffirmedSearchPre =
    input.action === "confirm_browse" ||
    input.action === "confirm_match" ||
    isBrowseAffirmation(userMsgForAffirmPre, input.action) ||
    Boolean(chatParsed?.affirmMatch);

  const runExtract = shouldRunSideExtract(input, chatParsed, input.action, {
    useMatchTwoPhase,
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

  const userMsgEarly = (input.userMessage ?? content).trim();
  const earlyHandoff =
    (input.handoffCount ?? 0) < 2 &&
    !explicitActivityBuddySignal(userMsgEarly) &&
    (chatParsed.handoffTo === "matchmaker" ||
      userChoseMeetSomeoneAfterDisambig(userMsgEarly, input.history) ||
      explicitMeetSomeoneSignal(userMsgEarly));
  if (earlyHandoff) {
    const summary = (chatParsed.handoffSummary ?? userMsgEarly).trim() || userMsgEarly;
    const transition = (chatParsed.transitionReply ?? "").trim();
    const handoffReply =
      transition ||
      (zh(input.lang)
        ? "好，那我们聊聊你想认识什么样的人——"
        : "Sure — tell me what kind of person you're hoping to meet.");
    return {
      reply: handoffReply,
      understanding,
      hardFilters,
      buddyHardFilters,
      wishDraft: draft,
      pendingConfirm: null,
      pendingBrowseConfirm: null,
      pendingMatchConfirm: null,
      pendingOfferMatch: false,
      wishLane,
      browseSearched,
      myIntentId,
      matchIntentId: null,
      crossCityMatch: false,
      nearMissIds: [],
      stage: myIntentId ? "published" : "prompt",
      suggestions: [],
      handoffTo: "matchmaker",
      handoffSummary: summary,
      transitionReply: handoffReply,
      recallEmpty: false,
    };
  }

  let matchIntentId = input.matchIntentId;
  let matchQuality: MatchQuality | undefined;
  let crossCityMatch = false;
  let nearMissIds: string[] = [];
  let recallEmpty = false;
  let matchReason: string | undefined;

  const browseReady = browseClarifyComplete(
    { ...input, wishLane, wishDraft: draft },
    draft,
    hardFilters,
    buddyHardFilters,
    understanding,
  );

  const userMsgForAffirm = (input.userMessage ?? content).trim();
  const browseVerbal = isBrowseAffirmation(userMsgForAffirm, input.action);
  const matchVerbal = isMatchAffirmation(userMsgForAffirm, input.action);
  const userAffirmedBrowse =
    input.action === "confirm_browse" ||
    (input.pendingBrowseConfirm && (browseVerbal || Boolean(chatParsed?.affirmMatch))) ||
    (browseReady && (browseVerbal || Boolean(chatParsed?.affirmMatch)));
  const userAffirmedMatch =
    wishLane !== "browse" &&
    Boolean(myIntentId) &&
    (matchVerbal || Boolean(chatParsed?.affirmMatch));

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
  if (
    wishLane === "browse" &&
    chatParsed?.confirmLine?.trim() &&
    !input.matchIntentId &&
    input.action !== "confirm_browse" &&
    input.action !== "confirm_publish"
  ) {
    pendingBrowseConfirm = chatParsed.confirmLine.trim();
  }

  const recallMine = resolveRecallMine(
    { ...input, wishDraft: draft, hardFilters },
    draft,
    myIntentId,
    hardFilters,
  );

  if (recallMine && isLightSideQueueAction(input.action)) {
    const queued = await handleSideQueueBrowseAction(input, recallMine, input.lang);
    if (queued) return queued;
  }

  if (userAffirmedBrowse) {
    pendingBrowseConfirm = null;
  }

  if (pendingOfferMatch && isOfferMatchDecline(input.userMessage ?? "")) {
    pendingOfferMatch = false;
  }

  if (input.action === "confirm_publish" && myIntentId) {
    pendingConfirm = null;
  }
  if (input.action === "confirm_browse") {
    pendingBrowseConfirm = null;
  }

  const userWantsMatch =
    !publishedThisTurn &&
    (wishLane === "browse"
      ? userAffirmedBrowse || input.action === "confirm_browse"
      : wishLane === "publish"
        ? input.action === "confirm_match" ||
          (pendingOfferMatch &&
            (isOfferMatchAffirmation(input.userMessage ?? "") ||
              Boolean(chatParsed?.affirmMatch))) ||
          (Boolean(myIntentId) && userAffirmedMatch)
        : userAffirmedBrowse ||
          input.action === "confirm_browse" ||
          userAffirmedMatch) ||
    (lightActions.includes(input.action) && Boolean(myIntentId || input.matchIntentId));

  const shouldPick =
    Boolean(recallMine) &&
    (userWantsMatch || Boolean(input.matchIntentId));

  let rankedQueue = input.rankedQueue ?? [];
  let queueCursor = input.queueCursor ?? 0;
  let queueFingerprint = input.queueFingerprint ?? null;
  let passedIntentIds = input.passedIntentIds ?? [];
  let shownIntentIds = input.shownIntentIds ?? input.triedIntentIds ?? [];

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

  if (
    wishLane === "browse" &&
    !browseReady &&
    !input.matchIntentId &&
    (replyLooksLikeStartingSearch(reply, input.lang) || /现有的人|搜一下|稍等/i.test(reply))
  ) {
    const progress = assessWishClarifyProgress({
      draft,
      hardFilters,
      buddyHardFilters,
      understanding,
      profile: input.profile,
      history: input.history,
    });
    const activity = draft.rawText?.trim() || (draft.kind ? "跑步" : "");
    if (zh(input.lang)) {
      reply =
        progress.focus === "intake"
          ? "好的，先跟我说说你想做什么、有什么要求吧——时间地点、对搭子的期待都可以一起说。"
          : progress.focus === "whenWhere"
          ? `好的，${activity ? `${activity}记下了。` : ""}还想在什么时间、什么区域找？比如周末、工作日晚上，或同城某个片区。`
          : progress.focus === "buddy"
            ? `好的，${activity ? `${activity}记下了。` : ""}对搭子有什么偏好吗？比如水平、性格；没有要求也可以说「没要求」。`
            : `好的，${activity ? `${activity}记下了。` : ""}我们先把条件聊清楚，确认后我再帮你在心愿池里找。`;
    } else {
      reply =
        progress.focus === "intake"
          ? "Sure — tell me what you'd like to do and any requirements (timing, place, buddy prefs — all in one go is fine)."
          : progress.focus === "whenWhere"
          ? `Got it${activity ? ` — ${activity}` : ""}. When and which area work for you?`
          : progress.focus === "buddy"
            ? `Got it${activity ? ` — ${activity}` : ""}. Any buddy preferences, or say no preference?`
            : `Got it${activity ? ` — ${activity}` : ""}. Let's nail down the filters first, then I'll search the wish pool.`;
    }
  }

  let handoffTo: "matchmaker" | null =
    chatParsed?.handoffTo === "matchmaker" && (input.handoffCount ?? 0) < 2 ? "matchmaker" : null;
  if (handoffTo) matchIntentId = null;

  let followUpReply: string | undefined;
  const freshMatchSearch =
    userWantsMatch &&
    shouldPick &&
    Boolean(recallMine) &&
    !handoffTo &&
    !isLightSideQueueAction(input.action) &&
    (shouldRebuildQueue || !input.matchIntentId || input.action === "rematch");
  const ranMatchTwoPhase = freshMatchSearch;

  if (ranMatchTwoPhase) {
    const rawWish =
      draft.rawText?.trim() || recallMine!.rawText?.trim() || recallMine!.rawText_zh?.trim() || "";
    reply = sideMatchAckFallback(input.lang, rawWish, wishLane);
    hooks?.onMatching?.();
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
    followUpReply = await runSideMatchFollowUp({
      lang: input.lang,
      wishLane,
      mine: recallMine!,
      otherId: matchIntentId,
      recallEmpty,
      matchReason,
      matchQuality,
      crossCityMatch,
      relaxHints,
      onDelta: hooks?.onFollowUpDelta,
    });
    hooks?.onFollowUpReady?.({ reply: followUpReply, suggestions: [] });
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

  if (!ranMatchTwoPhase && crossCityMatch && matchIntentId && !handoffTo) {
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
    followUpReply,
    rankedQueue,
    queueCursor,
    queueFingerprint,
    passedIntentIds,
    shownIntentIds,
    suppressAssistantReply: suppressAssistantReply || undefined,
  };
}

export type SideStreamEvent =
  | { type: "delta"; text: string }
  | { type: "ready"; reply: string; suggestions: string[] }
  | { type: "matching" }
  | { type: "matchReady"; preview: SideMatchPreview }
  | { type: "followUpDelta"; text: string }
  | { type: "followUpReady"; reply: string; suggestions: string[] }
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
            onMatching: () => {
              controller.enqueue({ type: "matching" });
            },
            onMatchReady: (preview) => {
              controller.enqueue({ type: "matchReady", preview });
            },
            onFollowUpDelta: (text) => {
              controller.enqueue({ type: "followUpDelta", text });
            },
            onFollowUpReady: ({ reply, suggestions }) => {
              controller.enqueue({ type: "followUpReady", reply, suggestions });
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
