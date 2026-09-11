import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import { softPrefsPresent } from "./understanding";
import type { MatchHardFilters, RecallOpts } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import { applyMatchmakerColdStart, profileHasColdStartSignal } from "./cold-start-prefs";
import { chatCompletionJsonStream, runToolLoop } from "./llm.server";
import { recallCandidates, recallCandidatesAsync, ensureMatchableHardFilters } from "./match-recall";
import { buildPoolFacets } from "./pool-facets.server";
import { findPersonInPool, getMatchablePeopleForSeeker } from "./people-store.server";
import type { Person, PersonGender } from "./types";
import { runMatchmakerExtract } from "./matchmaker-extract.server";
import type { MatchmakerLang } from "./match-types";
import { log } from "./logger.server";
import { selfVoiceRule, agentCapabilityIntroRule } from "./agent-voice";
import { formatPlaceList, parsePlaceList } from "./geo";
import { profileSummaryForPrompt } from "./profile-summary";
import { MATCH_QUEUE_LIMIT, matchPrefsFingerprint, advanceMatchmakerQueue } from "./matchmaker-queue";
import { runMatchmakerRank, ensureQueueReasons } from "./matchmaker-rank.server";
import {
  runMatchmakerEmptyReply,
  runMatchmakerIntroReply,
  runMatchmakerQueueExhaustedReply,
} from "./matchmaker-followup-llm.server";
import {
  MATCHMAKER_TOOLS,
  createMatchmakerToolState,
  executeMatchmakerTool,
  matchmakerToolSystem,
  type MatchmakerToolState,
} from "./matchmaker-tools.server";
import {
  ASK_USER_INFO_TOOL_NAME,
  awaitingUserAskChatHint,
  formatUserAskResolutionForLlm,
  type PendingUserAsk,
  type UserAskResolution,
} from "./ask-user-info";
import { llmReplyLanguageRule, resolveReplyLang, type AppLang } from "./lang";

export type { MatchmakerLang };
export type MatchmakerTurnAction =
  | "start"
  | "message"
  | "confirm_match"
  | "confirm_rematch"
  | "pass_and_next"
  | "see_next"
  | "resolve_user_ask";

export interface MatchmakerTurnInput {
  /** UI locale (i18n). Cards / canvas display only — not LLM system or reply language. */
  lang: MatchmakerLang;
  /** User-writing language for LLM replies; resolved server-side if omitted. */
  replyLang?: AppLang;
  action: MatchmakerTurnAction;
  userMessage?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  currentPersonId: string | null;
  shownIds: string[];
  passedIds: string[];
  blockedPersonIds: string[];
  profile: Profile;
  pendingMatchConfirm: string | null;
  pendingRematchConfirm: string | null;
  rankedQueue: string[];
  queueReasons: Record<string, string>;
  /** Chat/tool hard filters only (no cold-start). */
  chatHardFilters?: MatchHardFilters;
  queueCursor: number;
  queueFingerprint: string | null;
  seed?: string;
  handoffCount?: number;
  handoffSummary?: string;
  /** Result of a previous ask_user_info card (confirm / cancel / skip). */
  userAskResolution?: UserAskResolution | null;
}

export interface MatchmakerTurnOutput {
  reply: string;
  introducePersonId: string | null;
  passCurrentPerson: boolean;
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  suggestions: string[];
  handoffTo: "sidebyside" | null;
  handoffSummary: string;
  transitionReply: string;
  recallEmpty: boolean;
  pendingMatchConfirm: string | null;
  pendingRematchConfirm: string | null;
  rankedQueue: string[];
  queueReasons: Record<string, string>;
  chatHardFilters: MatchHardFilters;
  queueCursor: number;
  queueFingerprint: string | null;
  queueAdvance?: "pass" | "see";
  rematchRefresh?: boolean;
  passedIds?: string[];
  shownIds?: string[];
  /** Inline ask_user_info card waiting for the user. */
  pendingUserAsk?: PendingUserAsk | null;
}

interface LlmChatJson {
  reply?: string;
  passCurrentPerson?: boolean;
  suggestions?: string[];
  handoffTo?: "sidebyside" | null;
  handoffSummary?: string;
  transitionReply?: string;
  confirmLine?: string | null;
  affirmMatch?: boolean;
  rematchConfirmLine?: string | null;
  affirmRematch?: boolean;
}

function zh(lang: MatchmakerLang): boolean {
  return lang === "zh-CN";
}

/** Reply language from user text; UI `lang` is never the source. */
function turnReplyLang(input: MatchmakerTurnInput, content?: string): AppLang {
  if (input.replyLang) return input.replyLang;
  return resolveReplyLang({
    userMessage: content ?? input.userMessage,
    seed: input.seed,
    history: input.history,
  });
}

function withReplyLang(input: MatchmakerTurnInput, content?: string): MatchmakerTurnInput {
  return { ...input, replyLang: turnReplyLang(input, content) };
}

function genderLabel(g: PersonGender, lang: MatchmakerLang): string {
  if (lang === "zh-CN") {
    return { female: "女性", male: "男性", nonbinary: "非二元" }[g];
  }
  return g;
}

function filtersLine(f: MatchHardFilters, lang: MatchmakerLang): string {
  const isZh = lang === "zh-CN";
  const parts: string[] = [];
  const ageFlex = f.ageStrength === "flex" ? (isZh ? "（最好）" : " (prefer)") : "";
  if (f.ageMin != null) parts.push(isZh ? `年龄≥${f.ageMin}${ageFlex}` : `age≥${f.ageMin}${ageFlex}`);
  if (f.ageMax != null) parts.push(isZh ? `年龄≤${f.ageMax}${ageFlex}` : `age≤${f.ageMax}${ageFlex}`);
  if (f.genders.length) {
    const gFlex = f.genderStrength === "flex" ? (isZh ? "（最好）" : " (prefer)") : "";
    parts.push(
      isZh
        ? `性别：${f.genders.map((g) => genderLabel(g, lang)).join("、")}${gFlex}`
        : `gender: ${f.genders.join(", ")}${gFlex}`,
    );
  }
  if (f.excludeGenders.length) {
    parts.push(
      isZh
        ? `不要性别：${f.excludeGenders.map((g) => genderLabel(g, lang)).join("、")}`
        : `exclude gender: ${f.excludeGenders.join(", ")}`,
    );
  }
  if (f.cities.length) {
    const label = formatPlaceList(parsePlaceList(f.cities), lang);
    const cFlex = f.cityStrength === "flex" ? (isZh ? "（最好）" : " (prefer)") : "";
    parts.push(
      isZh
        ? `地点：${label || f.cities.join(", ")}${cFlex}`
        : `location: ${label || f.cities.join(", ")}${cFlex}`,
    );
  }
  if (f.excludeCities.length) {
    const label = formatPlaceList(parsePlaceList(f.excludeCities), lang);
    parts.push(
      isZh ? `不要地点：${label || f.excludeCities.join(", ")}` : `exclude: ${label || f.excludeCities.join(", ")}`,
    );
  }
  if (f.educationMin) {
    const eFlex = f.educationStrength === "flex" ? (isZh ? "（最好）" : " (prefer)") : "";
    parts.push(isZh ? `最低学历：${f.educationMin}${eFlex}` : `educationMin: ${f.educationMin}${eFlex}`);
  }
  if (f.educationLevels.length) {
    const eFlex = f.educationStrength === "flex" ? (isZh ? "（最好）" : " (prefer)") : "";
    parts.push(
      isZh
        ? `学历：${f.educationLevels.join(", ")}${eFlex}`
        : `education: ${f.educationLevels.join(", ")}${eFlex}`,
    );
  }
  return parts.length ? parts.join("; ") : isZh ? "（暂无硬条件）" : "(no hard filters yet)";
}

/** User expressed openness on location — no need to pin a city hard filter. */
export function locationFlexible(u: UserUnderstanding): boolean {
  const blob = [...u.notes, ...u.positive].join(" ");
  if (
    /(城市|地点|地方|city|location|place|异地)/i.test(blob) &&
    /(不限|都行|anywhere|\bany\b)/i.test(blob)
  ) {
    return true;
  }
  return /异地|不限.*(城市|地方|地点)|城市不限|其他城市|哪里都行|不局限|全国|线上|distance ok|any city|open to other|other cities ok/i.test(
    blob,
  );
}

function coreHardFiltersSet(f: MatchHardFilters, u?: UserUnderstanding): boolean {
  const hasGender = f.genders.length > 0 || f.excludeGenders.length > 0;
  const hasAge = f.ageMin != null || f.ageMax != null;
  const hasCity = f.cities.length > 0 || Boolean(u && locationFlexible(u));
  return hasGender && hasAge && hasCity;
}

/** Short state hint — search timing lives in【搜索决策】. */
function clarifyFocusLine(f: MatchHardFilters, lang: MatchmakerLang, u: UserUnderstanding): string {
  void lang;
  const hasAnySignal =
    f.genders.length > 0 ||
    f.excludeGenders.length > 0 ||
    f.cities.length > 0 ||
    f.ageMin != null ||
    f.ageMax != null ||
    softPrefsPresent(u) ||
    u.notes.length > 0;

  if (!hasAnySignal) {
    return "状态：尚无可搜信号（开放邀请即可；一有偏好/冷启动，系统本轮可出人）。";
  }

  return "状态：已有可搜信号——本轮若 affirmMatch，系统排序出人后再写介绍；reply 里先别点名具体某人。";
}

function actionHint(input: MatchmakerTurnInput): string {
  const { action, currentPersonId, seed } = input;
  if (action === "pass_and_next") {
    return `用户想换一个人（已在前端浏览队列中处理；本轮简短回应即可）。`;
  }
  if (action === "see_next") {
    return `用户浏览下一位（前端已处理；简短回应即可）。`;
  }
  if (action === "start" && seed?.trim()) {
    return `开场线索：「${seed.trim()}」。`;
  }
  if (seed?.trim() && action === "message") {
    return `开场线索：「${seed.trim()}」。`;
  }
  void currentPersonId;
  return "";
}

/** Enough to introduce — cold-start profile priors count; greeting alone still not enough unless immediate match. */
function prefsReady(input: MatchmakerTurnInput): boolean {
  const u = input.understanding;
  const f = applyMatchmakerColdStart(input.profile, input.hardFilters);
  if (f.ageMin != null || f.ageMax != null) return true;
  if (f.genders.length > 0 || f.excludeGenders.length > 0) return true;
  if (f.cities.length > 0 || f.educationMin || f.educationLevels.length > 0) return true;
  if (softPrefsPresent(u) || u.negative.length > 0) return true;
  if (u.notes.some((n) => n.trim().length >= 6)) return true;
  if (profileHasColdStartSignal(input.profile)) return true;
  return wantsImmediateMatch(input);
}

function userMessageBlob(input: MatchmakerTurnInput): string {
  const userBits = input.history
    .filter((h) => h.role === "user")
    .map((h) => h.content)
    .join(" ");
  return `${input.userMessage ?? ""} ${input.seed ?? ""} ${input.handoffSummary ?? ""} ${userBits}`;
}

/** Answering "any is fine" on a preference dimension — not "start matching now". */
function isPreferenceFlexMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(都行|都可以|随便|无所谓|没要求|不限|差不多|看情况|flexible|either is fine|no preference|doesn't matter|does not matter)[。.!！]?$/i.test(t)) {
    return true;
  }
  if (
    /^(性格|年龄|城市|地点|性别|学历|相处|节奏|个性|脾气)/.test(t) &&
    /都行|都可以|随便|没要求|不限|无所谓|flexible|no preference/i.test(t)
  ) {
    return true;
  }
  return /性格.*都行|年龄.*都行|城市.*都行|都行.*性格|不限.*性格|any age|any city|open on (age|city|personality)/i.test(t);
}

/** User wants to skip the confirm round and see someone now. */
function wantsImmediateMatch(input: MatchmakerTurnInput): boolean {
  const t = (input.userMessage ?? input.seed ?? "").trim();
  if (!t || isPreferenceFlexMessage(t)) return false;
  return /随便(推|看|来|找|来一个)?|先看看|推一个|谁都行|直接帮我找|别问了|赶紧找|你找吧|找吧|帮我找|去找吧|开始找吧|show me (someone|anyone)|surprise me|anyone is fine|stop asking/i.test(
    t,
  );
}

function shouldSkipMatchConfirm(input: MatchmakerTurnInput): boolean {
  return (
    input.action === "pass_and_next" ||
    input.action === "see_next" ||
    input.shownIds.length > 0 ||
    Boolean(input.currentPersonId) ||
    wantsImmediateMatch(input)
  );
}

function isMatchAffirmation(text: string, action: MatchmakerTurnAction): boolean {
  if (action === "confirm_match") return true;
  const t = text.trim();
  if (!t) return false;
  if (/^(是的|对|好|好的|确认|可以|行|嗯|ok|okay|yes|yep|sure|go ahead)/i.test(t)) return true;
  return /没有了|就这些|开始(吧|找)|没有别的|可以找了|就这样|你找吧|找吧|帮我找|再找找|找找看|随便找(一个)?|that's all|no more|start matching|find someone/i.test(t);
}

function isAffirmationTurn(input: MatchmakerTurnInput, content: string): boolean {
  return (
    input.action === "confirm_match" ||
    input.action === "confirm_rematch" ||
    isMatchAffirmation(content, input.action) ||
    isRematchAffirmation(content, input.action)
  );
}

function shouldSkipExtract(input: MatchmakerTurnInput, content: string): boolean {
  return isAffirmationTurn(input, content) || isLightMatchmakerAction(input.action);
}

function isRematchAffirmation(text: string, action: MatchmakerTurnAction): boolean {
  if (action === "confirm_rematch") return true;
  const t = text.trim();
  if (!t) return false;
  if (/^(是的|对|好|好的|确认|可以|行|嗯|ok|okay|yes|yep|sure|go ahead)/i.test(t)) return true;
  return /重新找|换一批|按新的|就这样找|开始找|rematch|re-match|find again|new batch/i.test(t);
}

function buildChatSystem(
  input: MatchmakerTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  pool: Person[],
  opts: {
    pendingMatchConfirm: string | null;
    pendingRematchConfirm: string | null;
    readyToMatch: boolean;
    hasQueue: boolean;
    awaitingUserAsk?: PendingUserAsk | null;
  },
): string {
  void candidateIds;
  void opts.pendingMatchConfirm;
  void opts.pendingRematchConfirm;
  void opts.readyToMatch;
  const replyLang = turnReplyLang(input);
  const capabilityIntro = agentCapabilityIntroRule("matchmaker", true);
  const awaitingHint = opts.awaitingUserAsk
    ? awaitingUserAskChatHint(opts.awaitingUserAsk, "zh-CN")
    : "";
  const current = input.currentPersonId
    ? findPersonInPool(pool, input.currentPersonId)
    : null;
  const currentLine = current
    ? `当前右侧：${current.name_zh || current.name}（id=${current.id}）`
    : "右侧尚未展示任何人。";

  const u = input.understanding;
  const softBits = [
    ...(u.traits ?? []),
    ...(u.interests ?? []),
    ...(u.occupation ?? []),
    ...(u.pace ?? []),
  ];
  const wantLine = softBits.length
    ? softBits.join(", ")
    : u.positive.length
      ? u.positive.join(", ")
      : "";
  const mem = [
    u.notes.length ? `notes: ${u.notes.join(" | ")}` : "",
    wantLine ? `希望对方：${wantLine}` : "",
    u.negative.length ? `不要这类：${u.negative.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const role = `你在 Maitri 帮用户认识新朋友。像真人聊天，2-5 句，温暖具体。
若对方想找活动搭子 / 一起做事：handoffTo 保持 null，在 reply 请回首页开「一起做事」新对话；suggestions 可给「回首页开新对话」。爱好当作交友偏好时留在本会话。
${selfVoiceRule(true)}`;

  const decision = `【搜索决策】
找人/认识新朋友意图（含「随便推一个」「帮我找」「想找…的女孩/男生」等，偏好很少也行）→ affirmMatch=true；系统排序出人，你介绍；introducePersonId 由服务端决定。
闲聊、打招呼、还不找人 → affirmMatch=false。
未提及维度用资料冷启动 soft；confirmLine 始终 null；先出人，细节可之后再聊。
右侧已有人且用户改方向（如「安静一点」）→ request_rematch + affirmRematch=true（或 rematchConfirmLine）；也可 affirmMatch=true。reply 简短确认，新介绍由系统写。
换一批 / 条件明显变了 → 同上重筛。
同批：右侧「看下一个人」记入 passed；聊天明确不合适 → browse_next_person mode=pass；只想看下一位 → mode=see。
当前有队列：${opts.hasQueue ? "是" : "否"}
${recallEmpty ? "硬过滤暂无人时，在 reply 里自然建议放宽年龄、性别、城市或学历。" : ""}`;

  const jsonBlock = `【JSON】reply 与 suggestions 放最前：
{"reply":"...","suggestions":["短句1","短句2"],"confirmLine":null,"affirmMatch":false,"rematchConfirmLine":null,"affirmRematch":false,"passCurrentPerson":false,"handoffTo":null,"handoffSummary":"","transitionReply":""}
suggestions：2-4 条第一人称短句（用户可直接发送）。
${llmReplyLanguageRule(replyLang)}`;

  return [
    role,
    decision,
    capabilityIntro,
    input.handoffSummary ? `接手摘要：${input.handoffSummary}` : "",
    profileSummaryForPrompt(input.profile, "zh-CN"),
    `硬条件：${filtersLine(input.hardFilters, "zh-CN")}`,
    clarifyFocusLine(input.hardFilters, "zh-CN", input.understanding),
    mem ? `软偏好：\n${mem}` : "",
    currentLine,
    awaitingHint,
    actionHint(input),
    jsonBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fallbackOutput(input: MatchmakerTurnInput, reason: "no_key" | "error"): MatchmakerTurnOutput {
  const replyLang = turnReplyLang(input);
  const reply =
    reason === "no_key"
      ? replyLang === "zh-CN"
        ? "我这边暂时连不上对话服务，请确认服务器已配置 DEEPSEEK_API_KEY。"
        : "Can't reach the conversation service — check DEEPSEEK_API_KEY."
      : replyLang === "zh-CN"
        ? "刚才没连上对话服务，请稍后再试。"
        : "Couldn't reach the conversation service. Please try again.";
  return {
    reply,
    introducePersonId: null,
    passCurrentPerson: false,
    understanding: input.understanding,
    hardFilters: input.hardFilters,
    suggestions: [],
    handoffTo: null,
    handoffSummary: "",
    transitionReply: "",
    recallEmpty: false,
    pendingMatchConfirm: null,
    pendingRematchConfirm: null,
    rankedQueue: input.rankedQueue ?? [],
    queueReasons: input.queueReasons ?? {},
    chatHardFilters: input.chatHardFilters ?? EMPTY_HARD_FILTERS,
    queueCursor: input.queueCursor ?? 0,
    queueFingerprint: input.queueFingerprint ?? null,
    pendingUserAsk: null,
  };
}

function userContent(input: MatchmakerTurnInput): string {
  if (input.action === "start") {
    const hasUserHistory = input.history.some((h) => h.role === "user");
    if (hasUserHistory || input.handoffSummary?.trim()) {
      return "[继续] 请直接回应用户上面最后一条消息。";
    }
    return input.seed?.trim() ? input.seed.trim() : "[对话开始]";
  }
  if (input.action === "pass_and_next") {
    return "[用户点击：换一个人]";
  }
  if (input.action === "see_next") {
    return "[用户点击：看下一位]";
  }
  if (input.action === "confirm_match") {
    return "[用户口头确认开始匹配]";
  }
  if (input.action === "confirm_rematch") {
    return "[用户口头确认按新条件重新匹配]";
  }
  if (input.action === "resolve_user_ask") {
    const res = input.userAskResolution;
    if (res) return formatUserAskResolutionForLlm(res, "zh-CN");
    return "[ask_user_info 结果] status=cancelled value=\"\"";
  }
  const base = input.userMessage?.trim() ?? "";
  if (input.userAskResolution) {
    const note = formatUserAskResolutionForLlm(input.userAskResolution, input.lang);
    return base ? `${note}\n\n${base}` : note;
  }
  return base;
}

/** Shared recall params for rank, facets, and empty-pool replies — keep in sync. */
function matchmakerRecallOpts(
  toolState: MatchmakerToolState,
  input: MatchmakerTurnInput,
  extracted: { understanding: UserUnderstanding; hardFilters: MatchHardFilters },
  chat?: { chatUnderstanding?: UserUnderstanding; chatHardFilters?: MatchHardFilters },
): RecallOpts & { pool: Person[] } {
  return {
    pool: toolState.pool,
    understanding: extracted.understanding,
    hardFilters: applyMatchmakerColdStart(input.profile, extracted.hardFilters),
    blockedIds: input.blockedPersonIds,
    shownIds: input.shownIds,
    passedIds: toolState.passedIds,
    seekerProfile: input.profile,
    chatUnderstanding: chat?.chatUnderstanding ?? extracted.understanding,
    chatHardFilters: chat?.chatHardFilters,
  };
}

export function buildEmptyRecallFacts(
  lang: MatchmakerLang,
  recallOpts: RecallOpts & { pool: Person[] },
): string {
  return buildEmptyRecallReply(lang, recallOpts);
}

function buildEmptyRecallReply(
  lang: MatchmakerLang,
  recallOpts: RecallOpts & { pool: Person[] },
): string {
  const isZh = lang === "zh-CN";
  const { pool, hardFilters } = recallOpts;
  if (pool.length === 0) {
    return isZh
      ? "候选人库目前是空的（数据库还没 seed）。需要先运行 npm run db:seed。"
      : "The candidate pool is empty — run npm run db:seed first.";
  }
  const facets = buildPoolFacets(pool, { lang, ...recallOpts });
  const active = filtersLine(hardFilters, lang);
  const hasActive = !/暂无硬条件|no hard filters yet/i.test(active);
  const n = facets.matchingNow;

  if (n > 0) {
    return isZh
      ? hasActive
        ? `按当前硬条件（${active}）有 ${n} 人（全池 ${facets.totalInPool}），但暂时没能排到可介绍的人（可能都看过了）。要放宽一条条件，或说「换一批」？`
        : `全池 ${facets.totalInPool} 人里暂时没有新的可介绍对象。要放宽条件或换一批吗？`
      : hasActive
        ? `${n} match (${active}) out of ${facets.totalInPool}, but none left to introduce — loosen a filter or ask for a new batch?`
        : `No new introductions left in the pool of ${facets.totalInPool}. Loosen filters or ask for a new batch?`;
  }

  if (isZh) {
    if (!hasActive) {
      return `全池 ${facets.totalInPool} 人，但当前条件下没有可介绍的候选人。${facets.tip}`;
    }
    if (facets.relaxHints[0]) {
      const h = facets.relaxHints[0];
      return `按当前硬条件（${active}）暂时 0 人（全池 ${facets.totalInPool}）。建议放宽「${h.label}」约可恢复到 ${h.countIfRelaxed} 人。`;
    }
    return `按当前硬条件（${active}）暂时 0 人（全池 ${facets.totalInPool} 人）。${facets.tip}`;
  }

  if (!hasActive) {
    return `No candidates to introduce (${facets.totalInPool} in pool). ${facets.tip}`;
  }
  if (facets.relaxHints[0]) {
    const h = facets.relaxHints[0];
    return `Zero matches for (${active}) out of ${facets.totalInPool}. Relaxing ${h.label} restores ~${h.countIfRelaxed}.`;
  }
  return `Zero matches for (${active}) out of ${facets.totalInPool}. ${facets.tip}`;
}

function isLightMatchmakerAction(action: MatchmakerTurnAction): boolean {
  return action === "pass_and_next" || action === "see_next";
}

async function polishMatchmakerReply(
  input: MatchmakerTurnInput,
  result: MatchmakerTurnOutput,
  extracted: { understanding: UserUnderstanding; hardFilters: MatchHardFilters },
  toolState: MatchmakerToolState,
  content: string,
  opts: { userAffirmedMatch: boolean; userAffirmedRematch: boolean },
): Promise<MatchmakerTurnOutput> {
  if (result.handoffTo) return result;

  const recallOpts = matchmakerRecallOpts(toolState, input, extracted);

  if (result.introducePersonId) {
    const person = findPersonInPool(toolState.pool, result.introducePersonId);
    if (person) {
      const reply = await runMatchmakerIntroReply({
        lang: turnReplyLang(input),
        person,
        profile: input.profile,
        understanding: extracted.understanding,
        cachedReason: result.queueReasons?.[result.introducePersonId],
      });
      return { ...result, recallEmpty: false, reply };
    }
  }

  if (result.recallEmpty && !result.introducePersonId) {
    const facts = buildEmptyRecallFacts("zh-CN", recallOpts);
    const reply = await runMatchmakerEmptyReply({ lang: turnReplyLang(input), facts });
    return { ...result, reply };
  }

  return result;
}

async function handleQueueBrowseAction(
  input: MatchmakerTurnInput,
  result: MatchmakerTurnOutput,
  extracted: { understanding: UserUnderstanding; hardFilters: MatchHardFilters },
  toolState: MatchmakerToolState,
): Promise<MatchmakerTurnOutput> {
  const mode = input.action === "pass_and_next" ? "pass" : "see";
  const advanced = advanceMatchmakerQueue(
    {
      rankedQueue: input.rankedQueue ?? [],
      queueCursor: input.queueCursor ?? 0,
      passedIds: toolState.passedIds,
      shownIds: input.shownIds,
      currentPersonId: input.currentPersonId,
    },
    mode,
    input.blockedPersonIds,
  );

  if (advanced.exhausted) {
    const filterSummary = filtersLine(extracted.hardFilters, "zh-CN");
    const reply = await runMatchmakerQueueExhaustedReply({
      lang: turnReplyLang(input),
      filterSummary,
    });
    return {
      ...result,
      reply,
      introducePersonId: null,
      rankedQueue: input.rankedQueue ?? [],
      queueReasons: input.queueReasons ?? {},
      chatHardFilters: input.chatHardFilters ?? EMPTY_HARD_FILTERS,
      queueCursor: advanced.queueCursor,
      passedIds: advanced.passedIds,
      shownIds: advanced.shownIds,
      recallEmpty: false,
      passCurrentPerson: mode === "pass",
    };
  }

  const introducePersonId = advanced.currentPersonId;
  let next: MatchmakerTurnOutput = {
    ...result,
    introducePersonId,
    rankedQueue: input.rankedQueue ?? [],
    queueReasons: input.queueReasons ?? {},
    chatHardFilters: input.chatHardFilters ?? EMPTY_HARD_FILTERS,
    queueCursor: advanced.queueCursor,
    passedIds: advanced.passedIds,
    shownIds: advanced.shownIds,
    passCurrentPerson: mode === "pass" && Boolean(input.currentPersonId),
  };

  if (introducePersonId) {
    const person = findPersonInPool(toolState.pool, introducePersonId);
    if (person) {
      const reply = await runMatchmakerIntroReply({
        lang: input.lang,
        person,
        profile: input.profile,
        understanding: extracted.understanding,
        cachedReason: (input.queueReasons ?? {})[introducePersonId],
      });
      next = { ...next, reply };
    }
  }

  return next;
}

async function applyMatchmakerRanking(
  input: MatchmakerTurnInput,
  result: MatchmakerTurnOutput,
  extracted: { understanding: UserUnderstanding; hardFilters: MatchHardFilters },
  content: string,
  chatParsed: LlmChatJson,
  toolState: MatchmakerToolState,
  chatHardFilters: MatchHardFilters,
): Promise<MatchmakerTurnOutput> {
  if (toolState.pendingUserAsk) {
    return { ...result, pendingUserAsk: toolState.pendingUserAsk };
  }
  if (isLightMatchmakerAction(input.action)) {
    return handleQueueBrowseAction(input, result, extracted, toolState);
  }

  const fp = matchPrefsFingerprint(extracted.understanding, extracted.hardFilters);
  let rankedQueue = input.rankedQueue ?? [];
  let queueReasons = input.queueReasons ?? {};
  let queueCursor = input.queueCursor ?? 0;
  let queueFingerprint = input.queueFingerprint;

  const keepQueueDuringRematch =
    Boolean(input.pendingRematchConfirm) || Boolean(result.pendingRematchConfirm);
  if (queueFingerprint && queueFingerprint !== fp && !keepQueueDuringRematch) {
    rankedQueue = [];
    queueReasons = {};
    queueCursor = 0;
    queueFingerprint = null;
  }

  const userAffirmedMatch =
    isMatchAffirmation(content, input.action) || Boolean(chatParsed.affirmMatch);
  const userAffirmedRematch =
    isRematchAffirmation(content, input.action) || Boolean(chatParsed.affirmRematch);
  const wantsRematchNow =
    userAffirmedRematch ||
    toolState.requestRematch ||
    Boolean(chatParsed.rematchConfirmLine?.trim());

  const recallOpts = matchmakerRecallOpts(toolState, input, extracted, {
    chatUnderstanding: extracted.understanding,
    chatHardFilters,
  });

  // Search only when the chat model (or explicit rematch/browse action) asks — not prefsReady.
  const shouldRankRematch =
    !result.handoffTo &&
    wantsRematchNow &&
    (rankedQueue.length > 0 ||
      Boolean(input.pendingRematchConfirm) ||
      Boolean(result.pendingRematchConfirm) ||
      toolState.requestRematch ||
      Boolean(chatParsed.rematchConfirmLine?.trim()));

  const shouldRankInitial =
    !result.handoffTo &&
    rankedQueue.length === 0 &&
    !shouldRankRematch &&
    userAffirmedMatch;

  if (!shouldRankRematch && !shouldRankInitial) {
    if (
      userAffirmedMatch &&
      rankedQueue.length > 0 &&
      !input.currentPersonId &&
      !result.handoffTo
    ) {
      const idx = Math.min(queueCursor, rankedQueue.length - 1);
      const introducePersonId = rankedQueue[idx] ?? null;
      return {
        ...result,
        introducePersonId,
        rankedQueue,
        queueReasons,
        chatHardFilters,
        queueCursor: idx,
        queueFingerprint,
        recallEmpty: false,
        pendingMatchConfirm: null,
        pendingRematchConfirm: null,
      };
    }
    return {
      ...result,
      rankedQueue,
      queueReasons,
      chatHardFilters,
      queueCursor,
      queueFingerprint,
      pendingMatchConfirm: null,
    };
  }

  const preview = await recallCandidatesAsync({ ...recallOpts, limit: MATCH_QUEUE_LIMIT });

  const rank = await runMatchmakerRank({
    lang: input.lang,
    understanding: recallOpts.understanding,
    hardFilters: recallOpts.hardFilters,
    chatUnderstanding: extracted.understanding,
    chatHardFilters,
    blockedIds: recallOpts.blockedIds,
    shownIds: recallOpts.shownIds,
    passedIds: recallOpts.passedIds,
    pool: recallOpts.pool,
    profile: input.profile,
  });

  rankedQueue = rank.rankedIds;
  queueReasons = rank.reasons;
  if (rankedQueue.length === 0 && preview.filteredCount > 0) {
    rankedQueue = preview.candidates.map((c) => c.id);
    queueReasons = ensureQueueReasons(
      rankedQueue,
      {},
      recallOpts.pool,
      extracted.understanding,
      input.lang,
      input.profile,
    );
  }
  queueCursor = 0;
  queueFingerprint = fp;
  const introducePersonId = rankedQueue[0] ?? null;
  const recallEmpty = rankedQueue.length === 0 && preview.filteredCount === 0;

  let next: MatchmakerTurnOutput = {
    ...result,
    introducePersonId,
    rankedQueue,
    queueReasons,
    chatHardFilters,
    queueCursor,
    queueFingerprint,
    recallEmpty,
    rematchRefresh: shouldRankRematch,
    pendingMatchConfirm: null,
    pendingRematchConfirm: null,
  };

  if (introducePersonId && !result.handoffTo) {
    next = { ...next, recallEmpty: false };
  }

  return next;
}

function shouldRunMatchmakerTools(input: MatchmakerTurnInput, content: string): boolean {
  if (isAffirmationTurn(input, content)) return false;
  if (input.action === "message") {
    if (input.pendingMatchConfirm || input.pendingRematchConfirm) return true;
    const t = content.trim();
    if (!t) return false;
    const toolSignals = [
      /换(一个|人|位|个)?/,
      /下一个/,
      /不太合适/,
      /没感觉/,
      /不合适/,
      /\bpass\b/i,
      /重筛/,
      /重新找/,
      /换一批/,
      /browse_next/,
      /update_filter/,
      /preview_pool/,
      /request_rematch/,
      /\d+\s*岁/,
      /上海|北京|深圳|成都|广州|杭州|柏林|里斯本|纽约|东京|京都/,
      /女生|男生|女性|男性|女孩|男孩|男的|女的|gender/i,
      /放宽|多少人|有没有|统计|分布|找不到|为什么.*没有/,
      /pool_facets/,
    ];
    if (toolSignals.some((re) => re.test(t))) return true;
    if (input.currentPersonId || (input.rankedQueue?.length ?? 0) > 0) {
      if (/^(好|行|可以|嗯|ok|yes|sure|开始)/i.test(t)) return true;
    }
    return false;
  }
  if (input.action !== "start") return false;
  if (input.seed?.trim() || input.handoffSummary?.trim()) return true;
  // Cold open / continue marker — skip tool round-trip.
  if (/^\[(对话开始|conversation start|继续|continue)/i.test(content.trim())) return false;
  return content.trim().length > 0;
}

async function runMatchmakerTools(
  input: MatchmakerTurnInput,
  content: string,
  pool: Person[],
): Promise<MatchmakerToolState> {
  const state = createMatchmakerToolState({
    ...input,
    // Tools edit chat-only filters; cold-start is applied later for recall/rank.
    hardFilters: input.chatHardFilters ?? input.hardFilters,
    pool,
    rankedQueueLength: input.rankedQueue?.length ?? 0,
  });
  if (!shouldRunMatchmakerTools(input, content)) return state;

  const { called } = await runToolLoop({
    messages: [
      { role: "system", content: matchmakerToolSystem(state) },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ],
    tools: MATCHMAKER_TOOLS,
    execute: (name, args, meta) => executeMatchmakerTool(state, name, args, meta),
    shouldPauseAfter: (name) => name === ASK_USER_INFO_TOOL_NAME,
    maxRounds: 4,
  });
  if (called.length) {
    log.info("matchmaker", "tools used", { called });
  }
  return state;
}

async function* runMatchmakerChatStream(
  input: MatchmakerTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  content: string,
  pool: Person[],
  chatOpts: {
    pendingMatchConfirm: string | null;
    pendingRematchConfirm: string | null;
    readyToMatch: boolean;
    hasQueue: boolean;
  },
): AsyncGenerator<{ type: "delta"; text: string } | { type: "done"; value: LlmChatJson | null }> {
  const system = buildChatSystem(input, candidateIds, recallEmpty, pool, chatOpts);
  let value: LlmChatJson | null = null;
  for await (const ev of chatCompletionJsonStream<LlmChatJson>(
    [
      { role: "system", content: system },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ],
    {
      temperature: 0.85,
      maxTokens: 1500,
      // Search/rematch turns: intro polish replaces chat reply — don't stream a provisional one.
      suppressReplyWhen: [
        { field: "affirmMatch", equals: true },
        { field: "affirmRematch", equals: true },
      ],
    },
  )) {
    if (ev.type === "delta") yield { type: "delta", text: ev.text };
    else if (ev.type === "done") value = ev.value;
  }
  yield { type: "done", value };
}

function assembleMatchmakerOutput(
  input: MatchmakerTurnInput,
  content: string,
  extracted: { understanding: MatchmakerTurnOutput["understanding"]; hardFilters: MatchmakerTurnOutput["hardFilters"] },
  chatParsed: LlmChatJson | null,
  toolState: MatchmakerToolState,
): MatchmakerTurnOutput {
  if (!chatParsed) {
    return {
      ...fallbackOutput(input, "error"),
      understanding: extracted.understanding,
      hardFilters: extracted.hardFilters,
      passCurrentPerson: toolState.passCurrentPerson,
    };
  }

  const recallOpts = matchmakerRecallOpts(toolState, input, extracted);
  const postRecall = recallCandidates(recallOpts);
  const recallEmpty = postRecall.emptyAfterHardFilter;

  let introducePersonId: string | null = null;

  // Agents are isolated: never hand off to Side mid-conversation.
  const handoffTo: "sidebyside" | null = null;

  // Deliver-now: never park a first-match confirm card.
  const pendingMatchConfirm = null;
  const pendingRematchConfirm = null;
  const pendingUserAsk = toolState.pendingUserAsk;

  let reply = (chatParsed.reply ?? "").trim();
  let suggestions = (chatParsed.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4);

  if (!reply && !handoffTo) {
    return {
      ...fallbackOutput(input, "error"),
      understanding: extracted.understanding,
      hardFilters: extracted.hardFilters,
      passCurrentPerson: toolState.passCurrentPerson,
      pendingUserAsk,
    };
  }

  return {
    reply: handoffTo ? "" : reply,
    introducePersonId,
    passCurrentPerson: handoffTo || pendingUserAsk
      ? false
      : Boolean(chatParsed.passCurrentPerson) || toolState.passCurrentPerson,
    understanding: extracted.understanding,
    hardFilters: extracted.hardFilters,
    suggestions,
    handoffTo,
    handoffSummary: (chatParsed.handoffSummary ?? "").trim(),
    transitionReply: (chatParsed.transitionReply ?? "").trim(),
    recallEmpty,
    pendingMatchConfirm,
    pendingRematchConfirm,
    rankedQueue: input.rankedQueue ?? [],
    queueReasons: input.queueReasons ?? {},
    chatHardFilters: input.chatHardFilters ?? EMPTY_HARD_FILTERS,
    queueCursor: input.queueCursor ?? 0,
    queueFingerprint: input.queueFingerprint ?? null,
    queueAdvance: pendingUserAsk ? undefined : toolState.queueAdvance ?? undefined,
    pendingUserAsk,
  };
}

/** @internal exported for unit tests */
export function matchmakerPrefsReady(input: MatchmakerTurnInput): boolean {
  return prefsReady(input);
}

/** @internal exported for unit tests */
export function matchmakerCoreHardFiltersSet(
  f: MatchHardFilters,
  u?: UserUnderstanding,
): boolean {
  return coreHardFiltersSet(f, u);
}

/** @internal exported for unit tests */
export function matchmakerShouldSkipConfirm(input: MatchmakerTurnInput): boolean {
  return shouldSkipMatchConfirm(input);
}

/** @internal exported for unit tests */
export function matchmakerWantsImmediateMatch(input: MatchmakerTurnInput): boolean {
  return wantsImmediateMatch(input);
}

/** @internal exported for unit tests */
export function matchmakerIsAffirmation(text: string, action: MatchmakerTurnAction): boolean {
  return isMatchAffirmation(text, action);
}

export type MatchmakerStreamEvent =
  | { type: "delta"; text: string }
  /** Chat finished — UI can stop thinking; extract/introduce may still follow. */
  | { type: "ready"; reply: string; suggestions: string[] }
  | { type: "done"; result: MatchmakerTurnOutput };

export async function* runMatchmakerTurnStream(
  input: MatchmakerTurnInput,
): AsyncGenerator<MatchmakerStreamEvent> {
  const content = userContent(input);
  input = withReplyLang(input, content);
  log.info("matchmaker", "turn stream", {
    action: input.action,
    userPreview: content.slice(0, 80),
    historyLen: input.history.length,
    replyLang: input.replyLang,
    uiLang: input.lang,
  });

  const pool = await getMatchablePeopleForSeeker(input.profile);
  const toolState = await runMatchmakerTools(input, content, pool);

  if (isLightMatchmakerAction(input.action)) {
    const extracted = {
      understanding: input.understanding,
      hardFilters: toolState.filtersTouched ? toolState.hardFilters : input.hardFilters,
    };
    const chatHardFilters = toolState.filtersTouched
      ? toolState.hardFilters
      : (input.chatHardFilters ?? EMPTY_HARD_FILTERS);
    const base: MatchmakerTurnOutput = {
      reply: "",
      introducePersonId: null,
      passCurrentPerson: false,
      understanding: extracted.understanding,
      hardFilters: extracted.hardFilters,
      suggestions: [],
      handoffTo: null,
      handoffSummary: "",
      transitionReply: "",
      recallEmpty: false,
      pendingMatchConfirm: null,
      pendingRematchConfirm: null,
      rankedQueue: input.rankedQueue ?? [],
      queueReasons: input.queueReasons ?? {},
      chatHardFilters,
      queueCursor: input.queueCursor ?? 0,
      queueFingerprint: input.queueFingerprint,
    };
    const result = await applyMatchmakerRanking(
      input,
      base,
      extracted,
      content,
      { reply: "" },
      toolState,
      chatHardFilters,
    );
    if (result.reply) {
      yield { type: "ready", reply: result.reply, suggestions: result.suggestions };
    }
    yield { type: "done", result };
    return;
  }

  const workingInput: MatchmakerTurnInput = {
    ...input,
    hardFilters: toolState.hardFilters,
    passedIds: toolState.passedIds,
    currentPersonId: toolState.passCurrentPerson ? null : input.currentPersonId,
  };

  // Extract before chat so we know if this turn will introduce someone.
  const skipExtract = shouldSkipExtract(input, content);
  const extracted = skipExtract
    ? {
        understanding: input.understanding,
        hardFilters: toolState.filtersTouched ? toolState.hardFilters : input.hardFilters,
      }
    : await runMatchmakerExtract({
        lang: input.lang,
        history: input.history,
        userMessage: content,
        prevUnderstanding: input.understanding,
        prevHardFilters: toolState.filtersTouched
          ? toolState.hardFilters
          : (input.chatHardFilters ?? input.hardFilters),
      });

  // Chat/tool filters only — cold-start is applied next and must not pollute block [2].
  const chatHardFilters = toolState.filtersTouched
    ? { ...toolState.hardFilters }
    : skipExtract
      ? { ...(input.chatHardFilters ?? EMPTY_HARD_FILTERS) }
      : { ...extracted.hardFilters };

  let hardFilters = applyMatchmakerColdStart(input.profile, chatHardFilters);
  hardFilters = ensureMatchableHardFilters(hardFilters, toolState.pool, {
    understanding: extracted.understanding,
    blockedIds: input.blockedPersonIds,
    shownIds: input.shownIds,
    passedIds: toolState.passedIds,
    seekerProfile: input.profile,
  });
  extracted.hardFilters = hardFilters;

  const extractedInput: MatchmakerTurnInput = {
    ...workingInput,
    understanding: extracted.understanding,
    hardFilters,
    chatHardFilters,
  };

  const ready = prefsReady(extractedInput);
  const hasQueue = (input.rankedQueue?.length ?? 0) > 0;
  const rematchNow =
    toolState.requestRematch ||
    isRematchAffirmation(content, input.action) ||
    Boolean(input.pendingRematchConfirm);
  /** Hold chat only when we already know this action will rematch/confirm-search — AI decides affirmMatch in normal chat. */
  const holdChatStream =
    input.action === "confirm_match" ||
    (rematchNow && (hasQueue || toolState.requestRematch || Boolean(input.pendingRematchConfirm)));

  const preRecall = await recallCandidatesAsync({
    understanding: extracted.understanding,
    hardFilters,
    blockedIds: input.blockedPersonIds,
    shownIds: workingInput.shownIds,
    passedIds: toolState.passedIds,
    pool: toolState.pool,
    seekerProfile: input.profile,
    chatUnderstanding: extracted.understanding,
    chatHardFilters,
  });

  const candidateIds =
    toolState.lastSearchIds.length > 0
      ? toolState.lastSearchIds
      : preRecall.candidates.map((c) => c.id);

  const chatOpts = {
    pendingMatchConfirm: null as string | null,
    pendingRematchConfirm: null as string | null,
    readyToMatch: ready,
    hasQueue,
    awaitingUserAsk: toolState.pendingUserAsk,
  };

  let chatParsed: LlmChatJson | null = null;

  if (holdChatStream && !toolState.pendingUserAsk) {
    // Skip chat LLM naming people before rank — polish writes the real intro after.
    chatParsed = {
      reply: "",
      suggestions: [],
      confirmLine: null,
      affirmMatch: !rematchNow,
      rematchConfirmLine: null,
      affirmRematch: rematchNow,
      passCurrentPerson: false,
      handoffTo: null,
      handoffSummary: "",
      transitionReply: "",
    };
  } else {
    // Buffer chat deltas until we know whether this turn searches. Forwarding them
    // early causes a provisional reply that then gets replaced by the polished intro.
    for await (const ev of runMatchmakerChatStream(
      extractedInput,
      candidateIds,
      preRecall.emptyAfterHardFilter,
      content,
      toolState.pool,
      chatOpts,
    )) {
      if (ev.type === "done") chatParsed = ev.value;
    }

    const chatReply = (chatParsed?.reply ?? "").trim();
    const chatSuggestions = (chatParsed?.suggestions ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    const willSearchThisTurn =
      !toolState.pendingUserAsk &&
      (Boolean(chatParsed?.affirmMatch) ||
        Boolean(chatParsed?.affirmRematch) ||
        Boolean(chatParsed?.rematchConfirmLine?.trim()) ||
        rematchNow);
    // Search turns: only the polished intro (via done). Non-search: ready once.
    if (chatReply && !willSearchThisTurn) {
      yield { type: "ready", reply: chatReply, suggestions: chatSuggestions };
    }
  }

  if (!chatParsed) {
    const cfg = await import("./config.server").then((m) => m.getServerConfig());
    const fb = fallbackOutput(input, cfg.deepseekApiKey ? "error" : "no_key");
    yield {
      type: "done",
      result: {
        ...fb,
        understanding: extracted.understanding,
        hardFilters,
        passCurrentPerson: toolState.passCurrentPerson,
      },
    };
    return;
  }

  const polished = await polishMatchmakerReply(
    extractedInput,
    await applyMatchmakerRanking(
      extractedInput,
      assembleMatchmakerOutput(
        extractedInput,
        content,
        { understanding: extracted.understanding, hardFilters },
        chatParsed,
        toolState,
      ),
      { understanding: extracted.understanding, hardFilters },
      content,
      chatParsed,
      toolState,
      chatHardFilters,
    ),
    { understanding: extracted.understanding, hardFilters },
    toolState,
    content,
    {
      userAffirmedMatch:
        isMatchAffirmation(content, extractedInput.action) || Boolean(chatParsed?.affirmMatch),
      userAffirmedRematch:
        isRematchAffirmation(content, extractedInput.action) || Boolean(chatParsed?.affirmRematch),
    },
  );

  // holdChatStream: no ready/delta — client keeps thinking until done (reply + person together).
  yield { type: "done", result: polished };
}

export async function runMatchmakerTurn(input: MatchmakerTurnInput): Promise<MatchmakerTurnOutput> {
  let result: MatchmakerTurnOutput | null = null;
  for await (const ev of runMatchmakerTurnStream(input)) {
    if (ev.type === "done") result = ev.result;
  }
  return result ?? fallbackOutput(input, "error");
}

export function matchmakerTurnReadable(input: MatchmakerTurnInput): ReadableStream<MatchmakerStreamEvent> {
  return new ReadableStream<MatchmakerStreamEvent>({
    async start(controller) {
      try {
        for await (const ev of runMatchmakerTurnStream(input)) {
          controller.enqueue(ev);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
