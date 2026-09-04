import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { MatchHardFilters, RecallOpts } from "./match-types";
import { chatCompletionJsonStream, runToolLoop } from "./llm.server";
import { recallCandidates, ensureMatchableHardFilters } from "./match-recall";
import { buildPoolFacets } from "./pool-facets.server";
import { findPersonInPool, getMatchablePeople } from "./people-store.server";
import type { Person, PersonGender } from "./types";
import { runMatchmakerExtract } from "./matchmaker-extract.server";
import type { MatchmakerLang } from "./match-types";
import { log } from "./logger.server";
import { selfVoiceRule, agentCapabilityIntroRule, isAgentFirstReply } from "./agent-voice";
import { formatPlaceList, parsePlaceList } from "./geo";
import { profileSummaryForPrompt } from "./profile-summary";
import { MATCH_QUEUE_LIMIT, matchPrefsFingerprint, advanceMatchmakerQueue } from "./matchmaker-queue";
import { runMatchmakerRank } from "./matchmaker-rank.server";
import {
  runMatchmakerClarifyCapReply,
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

export type { MatchmakerLang };
export type MatchmakerTurnAction =
  | "start"
  | "message"
  | "confirm_match"
  | "confirm_rematch"
  | "pass_and_next"
  | "see_next";

export interface MatchmakerTurnInput {
  lang: MatchmakerLang;
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
  queueCursor: number;
  queueFingerprint: string | null;
  seed?: string;
  handoffCount?: number;
  handoffSummary?: string;
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
  queueCursor: number;
  queueFingerprint: string | null;
  queueAdvance?: "pass" | "see";
  rematchRefresh?: boolean;
  passedIds?: string[];
  shownIds?: string[];
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

function genderLabel(g: PersonGender, lang: MatchmakerLang): string {
  if (lang === "zh-CN") {
    return { female: "女性", male: "男性", nonbinary: "非二元" }[g];
  }
  return g;
}

function filtersLine(f: MatchHardFilters, lang: MatchmakerLang): string {
  const isZh = lang === "zh-CN";
  const parts: string[] = [];
  if (f.ageMin != null) parts.push(isZh ? `年龄≥${f.ageMin}` : `age≥${f.ageMin}`);
  if (f.ageMax != null) parts.push(isZh ? `年龄≤${f.ageMax}` : `age≤${f.ageMax}`);
  if (f.genders.length) {
    parts.push(
      isZh
        ? `性别：${f.genders.map((g) => genderLabel(g, lang)).join("、")}`
        : `gender: ${f.genders.join(", ")}`,
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
    parts.push(isZh ? `地点：${label || f.cities.join(", ")}` : `location: ${label || f.cities.join(", ")}`);
  }
  if (f.excludeCities.length) {
    const label = formatPlaceList(parsePlaceList(f.excludeCities), lang);
    parts.push(
      isZh ? `不要地点：${label || f.excludeCities.join(", ")}` : `exclude: ${label || f.excludeCities.join(", ")}`,
    );
  }
  if (f.educationMin) parts.push(isZh ? `最低学历：${f.educationMin}` : `educationMin: ${f.educationMin}`);
  if (f.educationLevels.length)
    parts.push(isZh ? `学历：${f.educationLevels.join(", ")}` : `education: ${f.educationLevels.join(", ")}`);
  return parts.length ? parts.join("; ") : isZh ? "（暂无硬条件）" : "(no hard filters yet)";
}

/** User expressed openness on location — no need to pin a city hard filter. */
export function locationFlexible(u: UserUnderstanding): boolean {
  const blob = [...u.notes, ...u.positive].join(" ");
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

/** Guide the model on what to clarify next — conversational, not a form wizard. */
function clarifyFocusLine(f: MatchHardFilters, lang: MatchmakerLang, u: UserUnderstanding): string {
  const isZh = lang === "zh-CN";
  const hasAnySignal =
    f.genders.length > 0 ||
    f.excludeGenders.length > 0 ||
    f.cities.length > 0 ||
    f.ageMin != null ||
    f.ageMax != null ||
    u.positive.length > 0 ||
    u.notes.length > 0;

  if (coreHardFiltersSet(f, u)) {
    return isZh
      ? "硬性方向（性别、年龄、地点意愿）已基本清楚。若还想了解性格/节奏/兴趣，可轻问一句；信息够用时直接 confirmLine 复述即可。不要像填表一样逐项追问；用户说「随便/开始找」不必再挖软偏好。"
      : "Core direction (gender, age, location stance) is clear. Optionally ask once about traits/pace/interests, or confirmLine when enough. No form-style interrogation; skip soft prefs if they want to start.";
  }

  if (!hasAnySignal) {
    return isZh
      ? "偏好几乎空白：用一句开放式话请用户描述想找什么样的人（性别、年龄、城市、性格、相处方式都可以一起说）。不要开场只问「男生还是女生」这类单项。"
      : "Prefs nearly blank: one open invite to describe who they want (gender, age, city, traits, pace — any mix). Don't open with a single field like gender only.";
  }

  const missing: string[] = [];
  if (!f.genders.length && !f.excludeGenders.length) {
    missing.push(isZh ? "性别" : "gender");
  }
  if (!f.cities.length && !locationFlexible(u)) {
    missing.push(isZh ? "城市/是否接受异地" : "city / remote ok");
  }
  if (f.ageMin == null && f.ageMax == null) {
    missing.push(isZh ? "年龄范围" : "age range");
  }

  if (missing.length === 0) {
    return isZh
      ? "硬条件已基本够用，可复述确认或轻问软偏好；不要机械逐项追问。"
      : "Hard filters are enough — confirm or lightly ask soft prefs; no form wizard.";
  }

  return isZh
    ? `对照已收集的信息，只追问真正还缺的：${missing.join("、")}。同一轮可自然组合 2-3 个相关项（如「年龄大概什么范围？城市有偏好吗？」），不要像填表一样一次只问一个字段。用户说「随便/开始找」可跳过。`
    : `Ask only what's still missing: ${missing.join(", ")}. You may combine 2-3 related items in one turn (e.g. age range and city preference). Not one field per turn. Skip if they want to start now.`;
}

function actionHint(input: MatchmakerTurnInput): string {
  const { action, currentPersonId, seed } = input;
  const fromPriorChat =
    Boolean(input.handoffSummary?.trim()) ||
    input.history.some((h) => h.role === "user");
  const firstReply = isAgentFirstReply(input.history);
  if (action === "start") {
    if (fromPriorChat) {
      return zh(input.lang)
        ? `${firstReply ? "这是接手后第一次回复：先用一句自然介绍你能帮用户认识新朋友（一位一位推荐并说原因），再" : ""}直接回应用户已说的意图，不要「嗨/好，我们开始」等空泛接待套话，也别再问想认识人还是一起做事。偏好不够时不要 affirmMatch；对照已有信息只补真正缺的要点，可一轮问 2-3 项。`
        : `${firstReply ? "First reply after takeover: one natural sentence on helping them meet someone new (one person at a time with reasons), then " : ""}Respond directly to what they already said — no empty greeting filler, never re-ask meet-vs-activity. Until prefs are clear, do not affirmMatch; fill only what's missing — up to 2-3 related items per turn.`;
    }
    return zh(input.lang)
        ? `${firstReply ? "这是接手后第一次回复：先用一句自然介绍你能帮用户认识新朋友（一位一位推荐并说原因），再" : ""}用一句开放式问题请用户描述想找什么样的人（性别、年龄、城市、性格等可以一起说）。不要机械地只问「男生还是女生」。偏好还不够时不要 affirmMatch；自称只用「我」。`
        : `${firstReply ? "First reply: one natural sentence on meeting someone new (one at a time with reasons), then " : ""}Open with one invite to describe who they want (gender, age, city, traits — any mix). Don't mechanically ask only gender first. No affirmMatch until prefs exist; I/me only.`;
  }
  if (action === "pass_and_next") {
    return zh(input.lang)
      ? `用户想换一个人（已在前端浏览队列中处理；本轮只需简短回应，不要介绍具体人选）。`
      : `User browsed to next in the queue (handled client-side; reply briefly only, no new pick).`;
  }
  if (action === "see_next") {
    return zh(input.lang)
      ? `用户浏览下一位（前端已处理；简短回应即可）。`
      : `User browsed next (client-side; brief reply only).`;
  }
  if (seed) {
    return zh(input.lang)
      ? `用户开场相关：「${seed}」。若只是想认识人、打招呼而没有具体偏好，不要 affirmMatch；可轻轻问问想找什么样的人，但不要催促。`
      : `Opening context: "${seed}". If they only greeted with no real prefs, do not affirmMatch; you may gently ask who they want to meet — don't push.`;
  }
  return "";
}

/** Enough signal to introduce someone — greeting / "想认识人" alone is not enough. */
function prefsReady(input: MatchmakerTurnInput): boolean {
  const u = input.understanding;
  const f = input.hardFilters;
  if (f.ageMin != null || f.ageMax != null) return true;
  if (f.genders.length > 0 || f.excludeGenders.length > 0) return true;
  if (f.cities.length > 0 || f.educationMin || f.educationLevels.length > 0) return true;
  if (u.positive.length > 0 || u.negative.length > 0) return true;
  if (u.notes.some((n) => n.trim().length >= 6)) return true;
  return wantsImmediateMatch(input);
}

function userMessageBlob(input: MatchmakerTurnInput): string {
  const userBits = input.history
    .filter((h) => h.role === "user")
    .map((h) => h.content)
    .join(" ");
  return `${input.userMessage ?? ""} ${input.seed ?? ""} ${input.handoffSummary ?? ""} ${userBits}`;
}

/** Max assistant clarify turns before forcing the confirm-and-search flow. */
export const MAX_CLARIFY_TURNS = 5;

export function isStillClarifyingBeforeIntro(input: MatchmakerTurnInput): boolean {
  return (
    !input.currentPersonId &&
    input.shownIds.length === 0 &&
    (input.rankedQueue?.length ?? 0) === 0 &&
    !input.pendingRematchConfirm
  );
}

/** Assistant turns spent追问 before anyone is shown. */
export function countClarifyAssistantTurns(input: MatchmakerTurnInput): number {
  if (!isStillClarifyingBeforeIntro(input)) return 0;
  return input.history.filter((h) => h.role === "assistant").length;
}

/** Already asked MAX_CLARIFY_TURNS times — next reply must confirm, not追问. */
export function isClarifyCapReached(input: MatchmakerTurnInput): boolean {
  return isStillClarifyingBeforeIntro(input) && countClarifyAssistantTurns(input) >= MAX_CLARIFY_TURNS;
}

function buildClarifyCapConfirmLine(
  input: MatchmakerTurnInput,
  understanding: UserUnderstanding,
  hardFilters: MatchHardFilters,
): string {
  const isZh = zh(input.lang);
  const bits = [...understanding.positive.slice(0, 3), ...understanding.notes.slice(-2)].filter(
    Boolean,
  );
  const filters = filtersLine(hardFilters, input.lang);
  const hasFilters = !/暂无硬条件|no hard filters yet/i.test(filters);
  const recap = [hasFilters ? filters : "", ...bits].filter(Boolean).join(isZh ? "；" : "; ");
  if (recap) {
    return isZh
      ? `我先按这些理解：${recap}。还有别的要求吗？`
      : `So far I'm hearing: ${recap}. Anything else?`;
  }
  return isZh
    ? "我们聊了好几轮啦。还有别的要求吗？没有的话我就按目前已了解的帮你找。"
    : "We've gone back and forth a bit. Anything else? If not, I'll search with what I have.";
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
    clarifyTurns: number;
    clarifyCapReached: boolean;
  },
): string {
  const isZh = zh(input.lang);
  const firstReply = isAgentFirstReply(input.history);
  const capabilityIntro = firstReply ? agentCapabilityIntroRule("matchmaker", isZh) : "";
  const blocked = new Set([...input.blockedPersonIds, ...input.passedIds]);
  const current = input.currentPersonId
    ? findPersonInPool(pool, input.currentPersonId)
    : null;
  const currentLine = current
    ? isZh
      ? `当前右侧：${current.name_zh}（id=${current.id}）`
      : `Current on right: ${current.name} (id=${current.id})`
    : isZh
      ? "右侧尚未展示任何人。"
      : "No one on the right yet.";

  const u = input.understanding;
  const mem = [
    u.notes.length ? `notes: ${u.notes.join(" | ")}` : "",
    u.positive.length ? (isZh ? `希望对方：${u.positive.join(", ")}` : `wants in others: ${u.positive.join(", ")}`) : "",
    u.negative.length ? (isZh ? `不要这类：${u.negative.join(", ")}` : `avoids: ${u.negative.join(", ")}`) : "",
  ]
    .filter(Boolean)
    .join("\n");

  const confirmRule = isZh
    ? `首次匹配确认：信息已够且尚无队列时，用 confirmLine 复述想找什么样的人；用户确认前 affirmMatch=false。用户用自然语言确认（好/好的/开始找吧）后 affirmMatch=true（系统排序并展示第一位）——不要提按钮或「点击确认」。
重筛确认：用户已看过人且要改条件/换一批时，用 request_rematch 工具后输出 rematchConfirmLine 复述新条件；确认前 affirmRematch=false。用户口头确认后 affirmRematch=true（系统重新排序，保留已跳过名单）。
软偏好（性格、相处节奏、希望对方的兴趣等 understanding 变化）与硬条件同等：明显变了且要按新标准找人 → request_rematch + rematchConfirmLine，不要只靠 update_filters 或 browse_next_person。
不确定用户是要「同批看下一位」还是「改条件/偏好重筛」：只在 reply 里问一句，不要调工具、不要出确认卡片。
同批浏览：用户明确只要换/看下一位、不改条件 → browse_next_person（默认 mode=see，不写入 passed）；仅当用户明确说不合适/没感觉/不喜欢 → mode=pass。
已挂起首次确认：${opts.pendingMatchConfirm ?? "无"}；已挂起重筛确认：${opts.pendingRematchConfirm ?? "无"}；当前有队列：${opts.hasQueue ? "是" : "否"}`
    : `First-match confirm: when prefs are enough and no queue yet, use confirmLine; affirmMatch=false until the user verbally confirms (ok / start matching), then affirmMatch=true (server ranks) — never mention buttons.
Rematch confirm: when criteria change or a new batch is needed, call request_rematch then rematchConfirmLine; affirmRematch=false until verbal confirm, then affirmRematch=true (re-rank, keep passedIds).
Soft prefs (traits, pace, interests in understanding) count the same as hard filters: if they clearly changed and the user wants a new screen → request_rematch + rematchConfirmLine, not update_filters or browse_next_person alone.
If unsure browse vs rematch: ask in reply only — no tools, no confirm cards.
Browse same batch: browse_next_person with mode=see by default (no passedIds); mode=pass only when user clearly rejects (not a fit / no spark / don't like).
Pending first confirm: ${opts.pendingMatchConfirm ?? "none"}; pending rematch: ${opts.pendingRematchConfirm ?? "none"}; has queue: ${opts.hasQueue ? "yes" : "no"}`;

  const activityLaneRule =
    (input.handoffCount ?? 0) >= 2
      ? ""
      : isZh
        ? `目的随时可能切换（最高优先级之一）：
你当前在「认识新朋友」流程，但用户**随时**可能改去「找人一起做事 / 看有没有现成活动」。每一轮都要留意活动类信号，不要默认继续推人或收交友偏好。

三种不同目的——不要混为一谈：
A) **一起去做**：找搭子、约时间地点一起逛公园/跑步/看展等 → 用户明确选 A 后 handoffTo="sidebyside"（reply 与 transitionReply 留空 ""）。
B) **认识爱做这事的人**：把活动当交友偏好，想认识喜欢逛公园的人 → handoffTo=null，活动记入软偏好，按认识新朋友继续。
C) **查有没有现成活动**：问「有什么…活动」「有没有一起…的活动」「附近有什么活动」→ 不是介绍具体某个人，而是想找可参加的活动/搭子心愿 → 先澄清是否走 A（查活动/找搭子）；用户明确要查活动或找搭子 → handoffTo="sidebyside"。

常见信号（出现任一类都要警惕，可能正在切换目的）：
- C：有什么活动、有没有活动、有什么一起逛公园的活动
- A：一起、搭子、约、周末一起、找人一起逛公园、在北京找能一起…的人
- B：认识喜欢…的人、想找爱逛公园的女生、把…当偏好

**一旦 A / B / C 分不清，或用户话里同时像多条路**：
- handoffTo 必须为 null
- affirmMatch=false；不要 confirmLine；不要介绍右侧的人、不要换下一个、不要追问性别年龄
- 在 reply 里用一句自然的话问清楚（可顺带承认右侧已有人但先确认用户现在想要什么）
- suggestions 给 3 条第一人称短句，分别对应 A / B / C（措辞随上下文变化，勿照抄固定例句）
- 不要提 Side by Side、转接、换模块等产品名

**已澄清之后**：
- 明确选 A 或要查活动 → handoffTo="sidebyside"
- 明确选 B → handoffTo=null，继续收集偏好或匹配
- 用户说「还是认识人吧」「继续看人」→ 留在 matchmaker

${input.currentPersonId || opts.hasQueue ? "注意：右侧已有人或已有队列——用户若突然提活动/搭子，优先按上文澄清目的，不要继续介绍或推下一位。" : ""}`
        : `Intent can switch anytime (high priority):
You are in "meet someone new", but the user may switch to "do something together / browse activities" at any turn. Watch for activity signals every turn; do not default to pushing people or dating prefs.

Three distinct goals — do not conflate:
A) **Do together**: find a buddy, schedule time/place (park walk, run, exhibition…) → after user clearly picks A, handoffTo="sidebyside" (reply="" and transitionReply="").
B) **Meet someone who likes it**: activity as a dating/friendship preference → handoffTo=null, soft preference, stay in matchmaker.
C) **Browse existing activities**: "any park walk activities?", "what activities are there" → not introducing a person; wants joinable activities/wishes → clarify toward A; if they want activities/buddies → handoffTo="sidebyside".

Watch for signals:
- C: any activities, what activities exist
- A: together, buddy, weekend, find someone to walk with me
- B: meet someone who likes…, preference for park walks

**If A/B/C unclear or mixed**:
- handoffTo must be null
- affirmMatch=false; no confirmLine; do not introduce anyone on the right or ask gender/age
- Ask naturally in reply (acknowledge someone may be on the right but confirm what they want now)
- suggestions = 3 first-person phrases for A, B, C
- No product/lane names

**After clarify**: clear A or activities → handoffTo="sidebyside"; clear B → stay matchmaker; "keep meeting people" → stay matchmaker.

${input.currentPersonId || opts.hasQueue ? "Note: someone is already on the right or queue exists — if they mention activities/buddies, clarify lane first; do not keep introducing." : ""}`;

  const clarifyRule = isZh
    ? `追问上限：尚未展示任何人前，最多追问 ${MAX_CLARIFY_TURNS} 轮（当前已 ${opts.clarifyTurns} 轮）。${
        opts.clarifyCapReached
          ? "已达上限：不得再问偏好细节；必须用 confirmLine 复述目前已知，问用户还有没有其他要求，affirmMatch=false。"
          : opts.clarifyTurns >= MAX_CLARIFY_TURNS - 1
            ? "还剩最后一轮追问机会；下一轮必须走 confirmLine。"
            : "每轮 1-2 个自然问题即可，可组合相关项（如年龄+城市），不要像填表逐项追问，也不要连环盘问。"
      }`
    : `Clarify cap: before showing anyone, at most ${MAX_CLARIFY_TURNS} follow-up rounds (now ${opts.clarifyTurns}).${
        opts.clarifyCapReached
          ? "Cap reached: no more preference questions; use confirmLine to recap and ask if anything else, affirmMatch=false."
          : opts.clarifyTurns >= MAX_CLARIFY_TURNS - 1
            ? "Last clarify round next; after that you must use confirmLine."
            : "1-2 natural questions per turn; combine related items (e.g. age + city). No form wizard or rapid-fire."
      }`;

  return [
    isZh
      ? `你在 Maitri 帮用户认识新朋友。像真人聊天，2-5 句，温暖具体。不要提 AI。以用户为主导：先回应当下说的话，不要每句都催着补充偏好。
用户也可能随时改去「找人一起做事 / 看有什么活动」——见下方「目的随时可能切换」规则；有活动类信号时，优先澄清目的，不要惯性继续推人。
追问方式：先开放式了解用户想找什么样的人；对照下方已收集的信息，只补真正缺的要点。硬条件（性别、年龄、城市/是否异地）优先于性格/节奏，但可在一轮里自然问 2-3 个相关项，不要像填表一样逐项单问。用户说「都行/都可以」时，结合你刚问的是什么来理解（地点？年龄？性格？），不要把它当成一项性格偏好；具体哪些硬条件保留/清除由抽取层根据对话判断。用户资料已在下方，不必重复盘问其基本情况。
重要：在用户还没给出具体偏好（至少一项硬条件或软偏好）之前，不要 affirmMatch。仅说想认识人、打招呼，都不够。
信息已够时：首次用 confirmLine，或用户说「随便推/开始找」时 affirmMatch=true。用户已口头确认（好/好的/开始找）时也必须 affirmMatch=true，不要只说「找到合适我会介绍」——系统会立刻展示第一位或说明暂无匹配。
用户要在同批里换人：调 browse_next_person 或等前端按钮；你自然接话即可。系统排序后会在右侧展示具体人选（introducePersonId 由服务端决定，你不要编造 id）；介绍时请在 reply 里自然说明为什么是 TA，可依据右侧「为什么是 TA」同源证据（用户说过的话、共同收藏、对方的 values 回答），不要空泛说「找到合适再介绍」。
${recallEmpty ? "注意：硬过滤后无候选人——建议放宽年龄、性别、城市或学历。" : ""}
${selfVoiceRule(true)}`
      : `You help people meet someone new on Maitri. Warm, concise, human. User-led: answer what they said; don't interrogate every turn.
They may switch anytime to "do something together / browse activities" — see lane-switch rules below; when activity signals appear, clarify intent first; do not keep pushing people by inertia.
Clarify style: start open ("who are you hoping to meet?"); then fill only what's missing. Hard filters (gender, age, city/remote) before traits, but 2-3 related items in one turn is fine — no form wizard. Profile is below; don't re-interview basics.
Until they give a real preference (at least one hard or soft dimension), do not set affirmMatch. Greeting alone is not enough.
When prefs are enough: first match uses confirmLine, or affirmMatch=true if they say "surprise me / start matching". After user confirms (ok / yes / start), affirmMatch=true — do not only say "I'll introduce when I find someone"; the system shows the first match or explains if none. Rematch uses rematchConfirmLine + affirmRematch. Server ranks candidates — never output person ids.
Browse within batch: browse_next_person or client buttons; reply naturally.
${recallEmpty ? "Note: zero candidates after hard filters — suggest relaxing age, gender, city, or education." : ""}
${selfVoiceRule(false)}`,
    input.handoffSummary
      ? isZh
        ? `接手摘要：${input.handoffSummary}`
        : `Handoff summary: ${input.handoffSummary}`
      : "",
    profileSummaryForPrompt(input.profile, input.lang),
    isZh ? `硬条件：${filtersLine(input.hardFilters, input.lang)}` : `Hard filters: ${filtersLine(input.hardFilters, input.lang)}`,
    clarifyFocusLine(input.hardFilters, input.lang, input.understanding),
    mem ? (isZh ? `软偏好：\n${mem}` : `Soft prefs:\n${mem}`) : "",
    currentLine,
    confirmRule,
    activityLaneRule,
    clarifyRule,
    capabilityIntro,
    actionHint(input),
    isZh
      ? `只输出 JSON（reply 与 suggestions 放最前）：
{"reply":"...","suggestions":["短句1","短句2"],"confirmLine":null,"affirmMatch":false,"rematchConfirmLine":null,"affirmRematch":false,"passCurrentPerson":false,"handoffTo":null,"handoffSummary":"","transitionReply":""}`
      : `JSON only (put reply and suggestions first):
{"reply":"...","suggestions":["..."],"confirmLine":null,"affirmMatch":false,"rematchConfirmLine":null,"affirmRematch":false,"passCurrentPerson":false,"handoffTo":null|"sidebyside","handoffSummary":"","transitionReply":""}`,
    opts.pendingMatchConfirm || opts.pendingRematchConfirm
      ? isZh
        ? "reply 用简体中文。用户在确认是否开始匹配：suggestions 给 2-4 条第一人称短句，随当前偏好生成（确认开找 / 补充要求等），勿用固定模板。"
        : "User confirming match prefs: 2-4 contextual first-person suggestions — no fixed templates."
      : isZh
        ? "reply 用简体中文。suggestions 必须给 2-4 条非空短句（第一人称、用户可直接当回复），根据当前对话自行生成，勿照抄固定话术；不要写成你的提问。"
        : "Write reply and suggestions in English only. suggestions = 2-4 contextual first-person phrases (no fixed templates; not your questions).",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fallbackOutput(input: MatchmakerTurnInput, reason: "no_key" | "error"): MatchmakerTurnOutput {
  const isZh = zh(input.lang);
  const reply =
    reason === "no_key"
      ? isZh
        ? "我这边暂时连不上对话服务，请确认服务器已配置 DEEPSEEK_API_KEY。"
        : "Can't reach the conversation service — check DEEPSEEK_API_KEY."
      : isZh
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
    queueCursor: input.queueCursor ?? 0,
    queueFingerprint: input.queueFingerprint ?? null,
  };
}

function userContent(input: MatchmakerTurnInput): string {
  if (input.action === "start") {
    const hasUserHistory = input.history.some((h) => h.role === "user");
    if (hasUserHistory || input.handoffSummary?.trim()) {
      return zh(input.lang)
        ? "[继续] 请直接回应用户上面最后一条消息；若是本 agent 第一次回复，先自然介绍你能帮用户认识新朋友，再衔接下文；不要重复空泛打招呼。"
        : "[continue] Respond to the user's last message; if this is your first reply, briefly introduce meeting someone new first — no empty greeting filler.";
    }
    return input.seed?.trim()
      ? input.seed.trim()
      : zh(input.lang)
        ? "[对话开始]"
        : "[conversation start]";
  }
  if (input.action === "pass_and_next") {
    return zh(input.lang) ? "[用户点击：换一个人]" : "[User tapped: show someone else]";
  }
  if (input.action === "see_next") {
    return zh(input.lang) ? "[用户点击：看下一位]" : "[User tapped: see next]";
  }
  if (input.action === "confirm_match") {
    return zh(input.lang) ? "[用户口头确认开始匹配]" : "[User verbally confirmed start matching]";
  }
  if (input.action === "confirm_rematch") {
    return zh(input.lang) ? "[用户口头确认按新条件重新匹配]" : "[User verbally confirmed rematch with new criteria]";
  }
  return input.userMessage?.trim() ?? "";
}

/** Shared recall params for rank, facets, and empty-pool replies — keep in sync. */
function matchmakerRecallOpts(
  toolState: MatchmakerToolState,
  input: MatchmakerTurnInput,
  extracted: { understanding: UserUnderstanding; hardFilters: MatchHardFilters },
): RecallOpts & { pool: Person[] } {
  return {
    pool: toolState.pool,
    understanding: extracted.understanding,
    hardFilters: extracted.hardFilters,
    blockedIds: input.blockedPersonIds,
    shownIds: input.shownIds,
    passedIds: toolState.passedIds,
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
  opts: { clarifyCapReached: boolean; userAffirmedMatch: boolean; userAffirmedRematch: boolean },
): Promise<MatchmakerTurnOutput> {
  if (result.handoffTo) return result;

  const recallOpts = matchmakerRecallOpts(toolState, input, extracted);

  if (
    opts.clarifyCapReached &&
    !opts.userAffirmedMatch &&
    !result.introducePersonId &&
    (input.rankedQueue?.length ?? 0) === 0
  ) {
    const recap = buildClarifyCapConfirmLine(
      input,
      extracted.understanding,
      extracted.hardFilters,
    );
    const reply = await runMatchmakerClarifyCapReply({
      lang: input.lang,
      recapFacts: recap,
    });
    return { ...result, reply };
  }

  if (result.introducePersonId) {
    const person = findPersonInPool(toolState.pool, result.introducePersonId);
    if (person) {
      const reply = await runMatchmakerIntroReply({
        lang: input.lang,
        person,
        profile: input.profile,
        understanding: extracted.understanding,
      });
      return { ...result, recallEmpty: false, reply };
    }
  }

  if (
    result.recallEmpty &&
    (opts.userAffirmedMatch || opts.userAffirmedRematch) &&
    !result.introducePersonId
  ) {
    const facts = buildEmptyRecallFacts(input.lang, recallOpts);
    const reply = await runMatchmakerEmptyReply({ lang: input.lang, facts });
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
    const filterSummary = filtersLine(extracted.hardFilters, input.lang);
    const reply = await runMatchmakerQueueExhaustedReply({
      lang: input.lang,
      filterSummary,
    });
    return {
      ...result,
      reply,
      introducePersonId: null,
      rankedQueue: input.rankedQueue ?? [],
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
): Promise<MatchmakerTurnOutput> {
  if (isLightMatchmakerAction(input.action)) {
    return handleQueueBrowseAction(input, result, extracted, toolState);
  }

  const fp = matchPrefsFingerprint(extracted.understanding, extracted.hardFilters);
  let rankedQueue = input.rankedQueue ?? [];
  let queueCursor = input.queueCursor ?? 0;
  let queueFingerprint = input.queueFingerprint;

  const keepQueueDuringRematch =
    Boolean(input.pendingRematchConfirm) || Boolean(result.pendingRematchConfirm);
  if (queueFingerprint && queueFingerprint !== fp && !keepQueueDuringRematch) {
    rankedQueue = [];
    queueCursor = 0;
    queueFingerprint = null;
  }

  const ready = prefsReady({ ...input, ...extracted });
  const skipConfirm = shouldSkipMatchConfirm(input);
  const clarifyCapReached = isClarifyCapReached(input);
  const cappedOrConfirming =
    clarifyCapReached ||
    Boolean(input.pendingMatchConfirm) ||
    Boolean(result.pendingMatchConfirm);
  const userAffirmedMatch =
    isMatchAffirmation(content, input.action) || Boolean(chatParsed.affirmMatch);
  const userAffirmedRematch =
    isRematchAffirmation(content, input.action) || Boolean(chatParsed.affirmRematch);

  const recallOpts = matchmakerRecallOpts(toolState, input, extracted);

  const shouldRankRematch =
    ready &&
    !result.handoffTo &&
    userAffirmedRematch &&
    (rankedQueue.length > 0 ||
      Boolean(input.pendingRematchConfirm) ||
      Boolean(result.pendingRematchConfirm) ||
      toolState.requestRematch);

  const bypassConfirmGate =
    userAffirmedMatch ||
    (skipConfirm &&
      !input.currentPersonId &&
      (!isStillClarifyingBeforeIntro(input) || wantsImmediateMatch(input)));

  const shouldRankInitial =
    (ready || cappedOrConfirming || userAffirmedMatch) &&
    !result.handoffTo &&
    rankedQueue.length === 0 &&
    !shouldRankRematch &&
    bypassConfirmGate;

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
        queueCursor: idx,
        queueFingerprint,
        recallEmpty: false,
        pendingMatchConfirm: null,
      };
    }
    return {
      ...result,
      rankedQueue,
      queueCursor,
      queueFingerprint,
    };
  }

  const preview = recallCandidates({ ...recallOpts, limit: MATCH_QUEUE_LIMIT });

  const rank = await runMatchmakerRank({
    lang: input.lang,
    understanding: recallOpts.understanding,
    hardFilters: recallOpts.hardFilters,
    blockedIds: recallOpts.blockedIds,
    shownIds: recallOpts.shownIds,
    passedIds: recallOpts.passedIds,
    pool: recallOpts.pool,
  });

  rankedQueue = rank.rankedIds;
  if (rankedQueue.length === 0 && preview.filteredCount > 0) {
    rankedQueue = preview.candidates.map((c) => c.id);
  }
  queueCursor = 0;
  queueFingerprint = fp;
  const introducePersonId = rankedQueue[0] ?? null;
  const recallEmpty = rankedQueue.length === 0 && preview.filteredCount === 0;

  let next: MatchmakerTurnOutput = {
    ...result,
    introducePersonId,
    rankedQueue,
    queueCursor,
    queueFingerprint,
    recallEmpty,
    rematchRefresh: shouldRankRematch,
    pendingMatchConfirm: userAffirmedMatch ? null : result.pendingMatchConfirm,
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
    execute: (name, args) => executeMatchmakerTool(state, name, args),
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
    clarifyTurns: number;
    clarifyCapReached: boolean;
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
    { temperature: 0.85, maxTokens: 1500 },
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

  let handoffTo: "sidebyside" | null =
    chatParsed.handoffTo === "sidebyside" && (input.handoffCount ?? 0) < 2 ? "sidebyside" : null;

  const ready = prefsReady({
    ...input,
    understanding: extracted.understanding,
    hardFilters: extracted.hardFilters,
  });
  let pendingMatchConfirm = input.pendingMatchConfirm;
  let pendingRematchConfirm = input.pendingRematchConfirm;
  const hadPendingMatchConfirm = Boolean(input.pendingMatchConfirm);
  const hadPendingRematchConfirm = Boolean(input.pendingRematchConfirm);
  const hasQueue = (input.rankedQueue?.length ?? 0) > 0;
  const userAffirmedMatch =
    isMatchAffirmation(content, input.action) || Boolean(chatParsed.affirmMatch);
  const userAffirmedRematch =
    isRematchAffirmation(content, input.action) || Boolean(chatParsed.affirmRematch);

  if (chatParsed.rematchConfirmLine?.trim()) {
    pendingRematchConfirm = chatParsed.rematchConfirmLine.trim();
    pendingMatchConfirm = null;
  } else if (
    chatParsed.confirmLine?.trim() &&
    !hasQueue &&
    !toolState.requestRematch &&
    !userAffirmedMatch
  ) {
    pendingMatchConfirm = chatParsed.confirmLine.trim();
    pendingRematchConfirm = null;
  }

  if (
    pendingMatchConfirm &&
    !userAffirmedMatch &&
    hadPendingMatchConfirm &&
    input.action === "message" &&
    content.trim()
  ) {
    pendingMatchConfirm = null;
  }
  if (
    pendingRematchConfirm &&
    !userAffirmedRematch &&
    hadPendingRematchConfirm &&
    input.action === "message" &&
    content.trim()
  ) {
    pendingRematchConfirm = null;
  }

  if (userAffirmedMatch) {
    pendingMatchConfirm = null;
  }
  if (userAffirmedRematch) {
    pendingRematchConfirm = null;
  }

  let reply = (chatParsed.reply ?? "").trim();
  let suggestions = (chatParsed.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const clarifyCapReached = isClarifyCapReached(input);

  if (clarifyCapReached && !hasQueue && !handoffTo && !pendingRematchConfirm && !userAffirmedMatch) {
    const forced = buildClarifyCapConfirmLine(
      input,
      extracted.understanding,
      extracted.hardFilters,
    );
    pendingMatchConfirm = chatParsed.confirmLine?.trim() || forced;
  }

  if (!reply && !handoffTo) {
    return {
      ...fallbackOutput(input, "error"),
      understanding: extracted.understanding,
      hardFilters: extracted.hardFilters,
      passCurrentPerson: toolState.passCurrentPerson,
    };
  }

  return {
    reply: handoffTo ? "" : reply,
    introducePersonId,
    passCurrentPerson: handoffTo
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
    queueCursor: input.queueCursor ?? 0,
    queueFingerprint: input.queueFingerprint ?? null,
    queueAdvance: toolState.queueAdvance ?? undefined,
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
  log.info("matchmaker", "turn stream", {
    action: input.action,
    userPreview: content.slice(0, 80),
    historyLen: input.history.length,
  });

  const pool = await getMatchablePeople();
  const toolState = await runMatchmakerTools(input, content, pool);

  if (isLightMatchmakerAction(input.action)) {
    const extracted = {
      understanding: input.understanding,
      hardFilters: toolState.filtersTouched ? toolState.hardFilters : input.hardFilters,
    };
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

  const preRecall = recallCandidates({
    understanding: workingInput.understanding,
    hardFilters: workingInput.hardFilters,
    blockedIds: input.blockedPersonIds,
    shownIds: workingInput.shownIds,
    passedIds: toolState.passedIds,
    pool: toolState.pool,
  });

  const candidateIds =
    toolState.lastSearchIds.length > 0
      ? toolState.lastSearchIds
      : preRecall.candidates.map((c) => c.id);

  const clarifyTurns = countClarifyAssistantTurns(workingInput);
  const chatOpts = {
    pendingMatchConfirm: input.pendingMatchConfirm,
    pendingRematchConfirm: input.pendingRematchConfirm ?? null,
    readyToMatch: prefsReady({
      ...workingInput,
      hardFilters: toolState.hardFilters,
    }),
    hasQueue: (input.rankedQueue?.length ?? 0) > 0,
    clarifyTurns,
    clarifyCapReached: clarifyTurns >= MAX_CLARIFY_TURNS,
  };

  let chatParsed: LlmChatJson | null = null;
  for await (const ev of runMatchmakerChatStream(
    workingInput,
    candidateIds,
    preRecall.emptyAfterHardFilter,
    content,
    toolState.pool,
    chatOpts,
  )) {
    if (ev.type === "delta") yield { type: "delta", text: ev.text };
    else if (ev.type === "done") chatParsed = ev.value;
  }

  const chatReply = (chatParsed?.reply ?? "").trim();
  const chatSuggestions = (chatParsed?.suggestions ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (chatReply) {
    yield { type: "ready", reply: chatReply, suggestions: chatSuggestions };
  }

  // Extract after chat — skip on affirm so「好的」不会冲掉已有条件
  const extracted = shouldSkipExtract(input, content)
    ? {
        understanding: input.understanding,
        hardFilters: toolState.filtersTouched ? toolState.hardFilters : input.hardFilters,
      }
    : await runMatchmakerExtract({
        lang: input.lang,
        history: input.history,
        userMessage: content,
        prevUnderstanding: input.understanding,
        prevHardFilters: toolState.filtersTouched ? toolState.hardFilters : input.hardFilters,
      });

  // Tools that touched filters win for hard constraints this turn.
  let hardFilters = toolState.filtersTouched ? toolState.hardFilters : extracted.hardFilters;
  hardFilters = ensureMatchableHardFilters(hardFilters, toolState.pool, {
    understanding: extracted.understanding,
    blockedIds: input.blockedPersonIds,
    shownIds: input.shownIds,
    passedIds: toolState.passedIds,
  });
  extracted.hardFilters = hardFilters;

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

  yield {
    type: "done",
    result: await polishMatchmakerReply(
      workingInput,
      await applyMatchmakerRanking(
        workingInput,
        assembleMatchmakerOutput(
          workingInput,
          content,
          { understanding: extracted.understanding, hardFilters },
          chatParsed,
          toolState,
        ),
        { understanding: extracted.understanding, hardFilters },
        content,
        chatParsed,
        toolState,
      ),
      { understanding: extracted.understanding, hardFilters },
      toolState,
      content,
      {
        clarifyCapReached: isClarifyCapReached(workingInput),
        userAffirmedMatch:
          isMatchAffirmation(content, workingInput.action) || Boolean(chatParsed?.affirmMatch),
        userAffirmedRematch:
          isRematchAffirmation(content, workingInput.action) || Boolean(chatParsed?.affirmRematch),
      },
    ),
  };
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
