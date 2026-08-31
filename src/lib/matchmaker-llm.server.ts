import { PEOPLE } from "./people";
import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { MatchHardFilters } from "./match-types";
import { chatCompletionJsonStream } from "./llm.server";
import { recallCandidates, rosterFromIds } from "./match-recall";
import { runMatchmakerExtract } from "./matchmaker-extract.server";
import type { MatchmakerLang } from "./match-types";
import { log } from "./logger.server";

export type { MatchmakerLang };
export type MatchmakerTurnAction = "start" | "message" | "pass_and_next" | "see_next";

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
}

interface LlmChatJson {
  reply?: string;
  introducePersonId?: string | null;
  passCurrentPerson?: boolean;
  suggestions?: string[];
  handoffTo?: "sidebyside" | null;
  handoffSummary?: string;
  transitionReply?: string;
}

function zh(lang: MatchmakerLang): boolean {
  return lang === "zh-CN";
}

function profileLine(profile: Profile, lang: MatchmakerLang): string {
  const name = profile.name?.trim();
  const city = profile.city?.trim();
  const job = profile.occupation?.trim();
  const moment = profile.moments?.[0]?.answer?.trim();
  const parts = [
    name ? `name: ${name}` : "",
    profile.age ? `age: ${profile.age}` : "",
    city ? `city: ${city}` : "",
    job ? `occupation: ${job}` : "",
    moment ? `moment: ${moment}` : "",
  ].filter(Boolean);
  if (parts.length === 0) {
    return zh(lang)
      ? "用户资料很少。"
      : "Profile is sparse.";
  }
  return parts.join("; ");
}

function filtersLine(f: MatchHardFilters, lang: MatchmakerLang): string {
  const isZh = lang === "zh-CN";
  const parts: string[] = [];
  if (f.ageMin != null) parts.push(isZh ? `年龄≥${f.ageMin}` : `age≥${f.ageMin}`);
  if (f.ageMax != null) parts.push(isZh ? `年龄≤${f.ageMax}` : `age≤${f.ageMax}`);
  if (f.cities.length) parts.push(isZh ? `城市：${f.cities.join(", ")}` : `cities: ${f.cities.join(", ")}`);
  if (f.excludeCities.length)
    parts.push(isZh ? `不要城市：${f.excludeCities.join(", ")}` : `exclude cities: ${f.excludeCities.join(", ")}`);
  if (f.educationMin) parts.push(isZh ? `最低学历：${f.educationMin}` : `educationMin: ${f.educationMin}`);
  if (f.educationLevels.length)
    parts.push(isZh ? `学历：${f.educationLevels.join(", ")}` : `education: ${f.educationLevels.join(", ")}`);
  return parts.length ? parts.join("; ") : isZh ? "（暂无硬条件）" : "(no hard filters yet)";
}

function actionHint(input: MatchmakerTurnInput): string {
  const { action, currentPersonId, seed } = input;
  if (action === "start") {
    return zh(input.lang)
      ? "对话开始或刚从首页接手。以用户为主导：自然开场即可，不要一上来连环追问。偏好还不清楚时 introducePersonId 必须为 null。不要套「好，我们从介绍人开始」这类话。"
      : "Conversation start or just took over from home. User-led: warm open, no interrogation. Until prefs are clear, introducePersonId must be null. No canned 'let's start introducing' filler.";
  }
  if (action === "pass_and_next") {
    return zh(input.lang)
      ? `用户想换一个人${currentPersonId ? `（当前 id=${currentPersonId}）` : ""}。passCurrentPerson=true，从候选人里选另一位 introducePersonId。`
      : `User wants someone else. passCurrentPerson=true, pick another introducePersonId from candidates.`;
  }
  if (action === "see_next") {
    return zh(input.lang)
      ? `用户想看下一位，不是拒绝当前这位。passCurrentPerson=false，换 introducePersonId。`
      : `User wants to browse next without rejecting current. passCurrentPerson=false.`;
  }
  if (seed) {
    return zh(input.lang)
      ? `用户开场相关：「${seed}」。若只是想认识人、打招呼、或点了介绍按钮而没有具体偏好，introducePersonId 必须为 null；可轻轻问问偏好，但不要催促。`
      : `Opening context: "${seed}". If they only want to meet someone / greeted / tapped introduce with no real prefs, introducePersonId must be null; you may gently invite prefs — don't push.`;
  }
  return "";
}

/** Enough signal to introduce someone — greeting / "想认识人" alone is not enough. */
function prefsReady(input: MatchmakerTurnInput): boolean {
  const u = input.understanding;
  const f = input.hardFilters;
  if (f.ageMin != null || f.ageMax != null) return true;
  if (f.cities.length > 0 || f.educationMin || f.educationLevels.length > 0) return true;
  if (u.positive.length > 0 || u.negative.length > 0) return true;
  if (u.notes.some((n) => n.trim().length >= 6)) return true;
  const msg = `${input.userMessage ?? ""} ${input.seed ?? ""}`;
  if (/随便(推|看|来)|先看看|推一个|谁都行|show me (someone|anyone)|surprise me|anyone is fine/i.test(msg))
    return true;
  return false;
}

function buildChatSystem(
  input: MatchmakerTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
): string {
  const isZh = zh(input.lang);
  const blocked = new Set([...input.blockedPersonIds, ...input.passedIds]);
  const current = input.currentPersonId
    ? PEOPLE.find((p) => p.id === input.currentPersonId)
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
    u.positive.length ? `likes: ${u.positive.join(", ")}` : "",
    u.negative.length ? `dislikes: ${u.negative.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const roster =
    candidateIds.length > 0
      ? rosterFromIds(candidateIds, input.lang, blocked)
      : isZh
        ? "（按当前条件没有合适候选人 — 不要介绍，请帮用户放宽条件）"
        : "(No candidates match current filters — do not introduce; help them relax a constraint)";

  return [
    isZh
      ? `你是 Maitri 的 Matchmaker。像真人聊天，2-5 句，温暖具体。不要提 AI。以用户为主导：先回应当下说的话，不要每句都催着补充偏好。
只能从下方「候选人」里选 introducePersonId；id 必须完全匹配。
重要：在用户还没给出具体偏好（性格/节奏/城市/年龄/爱好等至少一类）之前，introducePersonId 必须为 null。仅说想认识人、打招呼、点了介绍按钮，都不够——可以轻轻邀请，但别连环追问。
用户明确说「随便推一个/先看看」时才可以在无偏好时介绍。
用户要换人时 passCurrentPerson=true。
若候选人列表为空，introducePersonId 必须为 null，并建议放宽哪条条件。
${(input.handoffCount ?? 0) >= 2 ? "不要再 handoffTo。" : '若用户明确改去约活动，handoffTo="sidebyside"。'}`
      : `You are Maitri's Matchmaker. Warm, concise, human. User-led: answer what they said; don't interrogate every turn.
Pick introducePersonId only from the candidate list below.
CRITICAL: Until the user has given a real preference (traits, pace, city, age, hobbies — at least one), introducePersonId must be null. Greeting or "I want to meet someone" is not enough — invite gently, don't push.
Only introduce with sparse prefs if they explicitly say "just show someone / surprise me".
If candidate list is empty, introducePersonId must be null and suggest relaxing a filter.
${(input.handoffCount ?? 0) >= 2 ? "No more handoffTo." : 'For activity pivot: handoffTo="sidebyside".'}`,
    input.handoffSummary
      ? isZh
        ? `接手摘要：${input.handoffSummary}`
        : `Handoff summary: ${input.handoffSummary}`
      : "",
    isZh ? `用户资料：${profileLine(input.profile, input.lang)}` : `Profile: ${profileLine(input.profile, input.lang)}`,
    isZh ? `硬条件：${filtersLine(input.hardFilters, input.lang)}` : `Hard filters: ${filtersLine(input.hardFilters, input.lang)}`,
    mem ? (isZh ? `软偏好：\n${mem}` : `Soft prefs:\n${mem}`) : "",
    currentLine,
    isZh ? `候选人（只能从这里选）：\n${roster}` : `Candidates (pick only from here):\n${roster}`,
    recallEmpty
      ? isZh
        ? "注意：硬过滤后无候选人。"
        : "Note: zero candidates after hard filters."
      : "",
    actionHint(input),
    isZh
      ? `只输出 JSON（reply 必须放在最前面，便于流式显示）：
{"reply":"...","introducePersonId":"id或null","passCurrentPerson":false,"suggestions":[],"handoffTo":null,"handoffSummary":"","transitionReply":""}`
      : `JSON only (put reply first for streaming):
{"reply":"...","introducePersonId":"id or null","passCurrentPerson":false,"suggestions":[],"handoffTo":null|"sidebyside","handoffSummary":"","transitionReply":""}`,
    isZh ? "reply 用简体中文。suggestions 为用户可能接下来说的 2-4 条短句（第一人称、可直接发送），贴合对话，不要写成你对用户的提问。" : "Write reply and suggestions in English only — no Chinese characters. suggestions: 2-4 short first-person phrases the user might say next (not your questions).",
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
  };
}

function userContent(input: MatchmakerTurnInput): string {
  if (input.action === "start") {
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
  return input.userMessage?.trim() ?? "";
}

function pickIntroduceId(
  chatId: string | null,
  candidateIds: string[],
  input: MatchmakerTurnInput,
): string | null {
  const allowed = new Set(candidateIds);
  if (chatId && allowed.has(chatId)) return chatId;

  const needsIntro =
    input.action === "pass_and_next" ||
    input.action === "see_next" ||
    Boolean(chatId);

  if (!needsIntro || candidateIds.length === 0) return null;

  const exclude = input.action === "see_next" ? new Set<string>() : new Set<string>();
  if (input.action === "pass_and_next" && input.currentPersonId) {
    exclude.add(input.currentPersonId);
  }

  for (const id of candidateIds) {
    if (!exclude.has(id)) return id;
  }
  return candidateIds[0] ?? null;
}

async function* runMatchmakerChatStream(
  input: MatchmakerTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  content: string,
): AsyncGenerator<{ type: "delta"; text: string } | { type: "done"; value: LlmChatJson | null }> {
  const system = buildChatSystem(input, candidateIds, recallEmpty);
  let value: LlmChatJson | null = null;
  for await (const ev of chatCompletionJsonStream<LlmChatJson>(
    [
      { role: "system", content: system },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ],
    { temperature: 0.85, maxTokens: 900 },
  )) {
    if (ev.type === "delta") yield { type: "delta", text: ev.text };
    else if (ev.type === "done") value = ev.value;
    else value = null;
  }
  yield { type: "done", value };
}

function assembleMatchmakerOutput(
  input: MatchmakerTurnInput,
  content: string,
  extracted: { understanding: MatchmakerTurnOutput["understanding"]; hardFilters: MatchmakerTurnOutput["hardFilters"] },
  chatParsed: LlmChatJson | null,
): MatchmakerTurnOutput {
  if (!chatParsed) {
    // sync fallback — config read happens in caller path via fallbackOutput
    return {
      ...fallbackOutput(input, "error"),
      understanding: extracted.understanding,
      hardFilters: extracted.hardFilters,
    };
  }

  const postRecall = recallCandidates({
    understanding: extracted.understanding,
    hardFilters: extracted.hardFilters,
    blockedIds: [...input.blockedPersonIds, ...input.passedIds],
    shownIds: input.shownIds,
    passedIds: input.passedIds,
  });

  const candidateIds = postRecall.candidates.map((c) => c.id);
  const recallEmpty = postRecall.emptyAfterHardFilter;

  let introducePersonId = pickIntroduceId(
    chatParsed.introducePersonId ?? null,
    candidateIds,
    input,
  );

  let handoffTo: "sidebyside" | null =
    chatParsed.handoffTo === "sidebyside" && (input.handoffCount ?? 0) < 2 ? "sidebyside" : null;
  if (handoffTo) introducePersonId = null;

  const ready = prefsReady({
    ...input,
    understanding: extracted.understanding,
    hardFilters: extracted.hardFilters,
  });
  if (
    introducePersonId &&
    !ready &&
    input.action !== "pass_and_next" &&
    input.action !== "see_next"
  ) {
    log.info("matchmaker", "blocked early introduce — prefs not ready", {
      attempted: introducePersonId,
    });
    introducePersonId = null;
  }

  let reply = (chatParsed.reply ?? "").trim();
  if (!reply && !handoffTo) {
    return {
      ...fallbackOutput(input, "error"),
      understanding: extracted.understanding,
      hardFilters: extracted.hardFilters,
    };
  }

  if (
    !introducePersonId &&
    !ready &&
    !handoffTo &&
    (chatParsed.introducePersonId || /我想到|介绍你认识|here's |meet \w+/i.test(reply))
  ) {
    reply = zh(input.lang)
      ? "好。你想认识什么样的人，随时跟我说就行——性格、节奏、城市都可以，想到什么说什么。"
      : "Sure. Tell me whenever you're ready what kind of person you're hoping to meet — traits, pace, city, whatever comes to mind.";
  }

  if (introducePersonId == null && !ready && !handoffTo && input.action === "start") {
    if (!reply || /好，我们从介绍|let's start by introducing/i.test(reply)) {
      reply = zh(input.lang)
        ? "嗨，我是介绍人。你可以慢慢说想认识什么样的人——不必一次说全。"
        : "Hi — I'm here to introduce people. Share what you're looking for whenever you're ready; no need to cover everything at once.";
    }
  }

  if (recallEmpty && !handoffTo && (introducePersonId || input.action === "pass_and_next")) {
    reply = zh(input.lang)
      ? "按你现在的条件（年龄、城市或学历），我这边暂时找不到合适的人。要不放宽一下其中一条？"
      : "With your current filters (age, city, or education), I don't have a good match right now. Want to loosen one?";
    introducePersonId = null;
  }

  return {
    reply:
      reply ||
      (zh(input.lang) ? "好，我们改成找一起做事的搭子。" : "Okay — let's find someone to do something with."),
    introducePersonId,
    passCurrentPerson: handoffTo ? false : Boolean(chatParsed.passCurrentPerson),
    understanding: extracted.understanding,
    hardFilters: extracted.hardFilters,
    suggestions: (chatParsed.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
    handoffTo,
    handoffSummary: (chatParsed.handoffSummary ?? "").trim(),
    transitionReply: (chatParsed.transitionReply ?? "").trim(),
    recallEmpty,
  };
}

export type MatchmakerStreamEvent =
  | { type: "delta"; text: string }
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

  const preRecall = recallCandidates({
    understanding: input.understanding,
    hardFilters: input.hardFilters,
    blockedIds: [...input.blockedPersonIds, ...input.passedIds],
    shownIds: input.shownIds,
    passedIds: input.passedIds,
  });

  const extractP = runMatchmakerExtract({
    lang: input.lang,
    history: input.history,
    userMessage: content,
    prevUnderstanding: input.understanding,
    prevHardFilters: input.hardFilters,
  });

  let chatParsed: LlmChatJson | null = null;
  for await (const ev of runMatchmakerChatStream(
    input,
    preRecall.candidates.map((c) => c.id),
    preRecall.emptyAfterHardFilter,
    content,
  )) {
    if (ev.type === "delta") yield { type: "delta", text: ev.text };
    else chatParsed = ev.value;
  }

  const extracted = await extractP;
  if (!chatParsed) {
    const cfg = await import("./config.server").then((m) => m.getServerConfig());
    const fb = fallbackOutput(input, cfg.deepseekApiKey ? "error" : "no_key");
    yield {
      type: "done",
      result: { ...fb, understanding: extracted.understanding, hardFilters: extracted.hardFilters },
    };
    return;
  }

  yield {
    type: "done",
    result: assembleMatchmakerOutput(input, content, extracted, chatParsed),
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
