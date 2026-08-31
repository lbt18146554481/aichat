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
import {
  pickNextFromRecall,
  recallWishCandidates,
  rosterFromIntentIds,
  WISH_RECALL_LIMIT,
} from "./wish-recall";
import {
  EMPTY_WISH_HARD_FILTERS,
  emptyWishDraft,
  type SideLang,
  type WishDraft,
  type WishHardFilters,
} from "./wish-types";

export type SideTurnAction =
  | "start"
  | "message"
  | "confirm_publish"
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
  wishDraft: WishDraft;
  pendingConfirm: string | null;
  myIntentId: string | null;
  matchIntentId: string | null;
  triedIntentIds: string[];
  triedOwnerIds: string[];
  profile: Profile;
  handoffCount?: number;
  handoffSummary?: string;
  handoffHints?: SideBySideHints;
}

export interface SideTurnOutput {
  reply: string;
  understanding: UserUnderstanding;
  hardFilters: WishHardFilters;
  wishDraft: WishDraft;
  pendingConfirm: string | null;
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
}

interface LlmSideChatJson {
  reply?: string;
  confirmLine?: string | null;
  affirmPublish?: boolean;
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
    if (trait) {
      return zh(input.lang)
        ? `[对话开始] 用户上次偏好搭子特质：「${trait}」。自然开场，可轻轻带一句，再邀请说想做什么。`
        : `[conversation start] User previously preferred trait: "${trait}". Greet naturally, lightly nod to it, invite what they want to do.`;
    }
    return zh(input.lang) ? "[对话开始] 自然打招呼，邀请对方说说想一起做什么。" : "[conversation start] Greet naturally; invite what they'd like to do together.";
  }
  if (input.action === "confirm_publish") {
    return zh(input.lang) ? "[用户确认发布心愿]" : "[User confirmed publish]";
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

function isAffirmation(text: string, action: SideTurnAction): boolean {
  if (action === "confirm_publish") return true;
  const t = text.trim().toLowerCase();
  return /^(是的|对|好|好的|确认|可以|行|嗯|publish|yes|yep|yeah|ok|okay|sure|go ahead)/i.test(t);
}

function draftCity(input: SideTurnInput, draft: WishDraft): { en: string; zh: string } {
  const profileCity = input.profile.city?.trim() || "";
  const en = draft.city?.trim() || profileCity;
  const zhc = draft.city_zh?.trim() || draft.city?.trim() || profileCity;
  return { en, zh: zhc };
}

function publishDraft(input: SideTurnInput, draft: WishDraft): Intent {
  if (input.myIntentId) revokeMyIntent(input.myIntentId);
  const { en, zh: zhc } = draftCity(input, draft);
  return publishMyIntent({
    kind: draft.kind ?? "other",
    when: draft.whenAny ? undefined : draft.when,
    level: draft.levelAny ? undefined : draft.level,
    rawText: draft.rawText || input.userMessage || "",
    city: en,
    city_zh: zhc,
  });
}

function buildChatSystem(
  input: SideTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  crossCityUsed: boolean,
  opts: { published: boolean; pendingConfirm: string | null; readyToPublish: boolean },
): string {
  const isZh = zh(input.lang);
  const blocked = new Set([...input.triedIntentIds]);
  const roster =
    candidateIds.length > 0
      ? rosterFromIntentIds(candidateIds, input.lang, blocked)
      : isZh
        ? "（当前没有合适候选人）"
        : "(No candidates in pool)";

  const draftLine = isZh
    ? `草稿心愿：kind=${input.wishDraft.kind ?? "?"} when=${input.wishDraft.whenAny ? "any" : input.wishDraft.when ?? "?"} level=${input.wishDraft.levelAny ? "any" : input.wishDraft.level ?? "?"} text=${input.wishDraft.rawText}`
    : `Draft wish: kind=${input.wishDraft.kind ?? "?"} when=${input.wishDraft.whenAny ? "any" : input.wishDraft.when ?? "?"} level=${input.wishDraft.levelAny ? "any" : input.wishDraft.level ?? "?"} text=${input.wishDraft.rawText}`;

  const confirmRule = isZh
    ? `发布规则（B）：在用户明确确认前不要发布。若信息够清楚，用 confirmLine 给出一句话复述心愿并请用户确认；用户确认后 affirmPublish=true。
已挂起确认句：${opts.pendingConfirm ?? "无"}`
    : `Publish rule (B): do not publish until user confirms. Use confirmLine for one-sentence recap; set affirmPublish=true after user confirms.
Pending confirm: ${opts.pendingConfirm ?? "none"}`;

  const startHint =
    input.action === "start"
      ? isZh
        ? "这是开场：像真人顾问打招呼，1-3 句。邀请对方说说想一起做什么，但不要连环追问；以用户为主导。"
        : "Opening turn: greet like a human advisor, 1-3 sentences. Invite what they want to do — don't interrogate; stay user-led."
      : "";

  return [
    isZh
      ? `你是 Maitri 的 Side by Side 搭子顾问。温暖、具体，2-5 句。用自然语言，不要像系统播报。以用户为主导：先回应当下说的话，不要每句都催着补全时间/水平/活动。
未发布时：帮用户澄清心愿，信息够了再复述确认；信息不够就轻轻问一句或等用户继续说。
已发布后：只能从候选人里选 pickMatchIntentId；id 必须完全匹配。介绍匹配时自然带过对方心愿要点，不要另起一套「已匹配」播报。
跨城：${crossCityUsed ? "当前候选来自其他城市——必须在 reply 里自然说明同城暂时没有、这位在别的城市。" : "优先同城。"}
无候选人：${recallEmpty ? "硬过滤后无人——pickMatchIntentId 必须为 null，在 reply 里自然建议放宽时间/水平/活动或城市，不要用机械固定句。" : "有候选人可选。"}
${(input.handoffCount ?? 0) >= 2 ? "不要再 handoffTo。" : '若用户改去找人认识，handoffTo="matchmaker"。'}`
      : `You are Maitri's Side by Side advisor. Warm, concise, human — not a system announcer. User-led: answer what they said; don't interrogate every turn.
Before publish: clarify wish; confirm one sentence when ready — otherwise one gentle question or wait.
After publish: pick pickMatchIntentId only from candidates; weave the match into natural reply (no "MATCH FOUND" style).
${crossCityUsed ? "Candidates are cross-city — naturally say same-city was empty and this person is elsewhere." : "Same-city first."}
${recallEmpty ? "No candidates — pickMatchIntentId must be null; naturally suggest relaxing when/level/activity/city." : ""}
${(input.handoffCount ?? 0) >= 2 ? "No more handoffTo." : 'For intro pivot: handoffTo="matchmaker".'}`,
    startHint,
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
    isZh ? `用户城市：${input.profile.city || "未填"}` : `User city: ${input.profile.city || "unset"}`,
    draftLine,
    confirmRule,
    opts.published
      ? isZh
        ? `已发布心愿 id=${input.myIntentId}`
        : `Published wish id=${input.myIntentId}`
      : isZh
        ? "尚未发布心愿"
        : "Wish not published yet",
    isZh ? `候选人（Top ${WISH_RECALL_LIMIT}）：\n${roster}` : `Candidates (Top ${WISH_RECALL_LIMIT}):\n${roster}`,
    isZh
      ? `JSON（reply 必须放在最前面，便于流式显示）：{"reply":"...","confirmLine":null,"affirmPublish":false,"pickMatchIntentId":null,"handoffTo":null,"handoffSummary":"","transitionReply":"","suggestions":[]}`
      : `JSON (put reply first for streaming):{"reply":"...","confirmLine":null,"affirmPublish":false,"pickMatchIntentId":null,"handoffTo":null|"matchmaker","handoffSummary":"","transitionReply":"","suggestions":[]}`,
    isZh
      ? "reply 用简体中文。suggestions 为用户可能接下来说的 2-4 条短句（第一人称、可直接发送），不要写成你对用户的提问。"
      : "Write reply and suggestions in English only — no Chinese characters. suggestions: 2-4 short first-person phrases the user might say next (not your questions).",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function replyMentionsEmptyPool(reply: string, lang: SideLang): boolean {
  const r = reply.toLowerCase();
  if (zh(lang)) {
    return /找不到|没有合适|暂时没有|池子|放宽|没人/.test(reply);
  }
  return /no (good )?match|nobody|no one|empty|loosen|relax|couldn't find|can't find/.test(r);
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
    wishDraft: input.wishDraft,
    pendingConfirm: input.pendingConfirm,
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
): string | null {
  const allowed = new Set(candidateIds);
  if (chatId && allowed.has(chatId)) return chatId;

  const needsPick =
    input.action === "skip_match" ||
    input.action === "see_next" ||
    input.action === "rematch" ||
    Boolean(chatId);

  if (!needsPick || candidateIds.length === 0) return null;

  const exclude =
    input.action === "see_next" ? null : input.matchIntentId;
  for (const id of candidateIds) {
    if (id !== exclude) return id;
  }
  return candidateIds[0] ?? null;
}

async function runSideChat(
  input: SideTurnInput,
  candidateIds: string[],
  recallEmpty: boolean,
  crossCityUsed: boolean,
  content: string,
  chatOpts: { published: boolean; pendingConfirm: string | null; readyToPublish: boolean },
  onDelta?: (text: string) => void,
): Promise<LlmSideChatJson | null> {
  const system = buildChatSystem(input, candidateIds, recallEmpty, crossCityUsed, chatOpts);
  let value: LlmSideChatJson | null = null;
  for await (const ev of chatCompletionJsonStream<LlmSideChatJson>(
    [
      { role: "system", content: system },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ],
    { temperature: 0.85, maxTokens: 900 },
  )) {
    if (ev.type === "delta") onDelta?.(ev.text);
    else if (ev.type === "done") value = ev.value;
  }
  return value;
}

export async function runSideTurn(
  input: SideTurnInput,
  onDelta?: (text: string) => void,
): Promise<SideTurnOutput> {
  const content = userContent(input);
  log.info("side", "turn", {
    action: input.action,
    userPreview: content.slice(0, 80),
    published: Boolean(input.myIntentId),
    historyLen: input.history.length,
  });
  const lightActions: SideTurnAction[] = ["skip_match", "see_next", "rematch"];

  let draft = input.wishDraft.rawText ? input.wishDraft : { ...input.wishDraft, rawText: content };
  let hardFilters = input.hardFilters;
  let understanding = input.understanding;
  let readyToPublish = false;
  let pendingConfirm = input.pendingConfirm;

  const skipExtract = lightActions.includes(input.action);

  let extracted: Awaited<ReturnType<typeof runSideExtract>> | null = null;
  let chatParsed: LlmSideChatJson | null = null;

  const preMine = input.myIntentId ? getIntentById(input.myIntentId) : null;
  const preRecall = preMine
    ? recallWishCandidates({
        mine: preMine,
        hardFilters,
        understanding,
        exclude: input.triedIntentIds,
        excludeOwnerIds: input.triedOwnerIds,
      })
    : null;

  if (skipExtract) {
    chatParsed = await runSideChat(
      input,
      preRecall?.candidates.map((c) => c.id) ?? [],
      (preRecall?.candidates.length ?? 0) === 0,
      preRecall?.crossCityUsed ?? false,
      content,
      { published: true, pendingConfirm: null, readyToPublish: false },
      onDelta,
    );
  } else {
    [extracted, chatParsed] = await Promise.all([
      runSideExtract({
        lang: input.lang,
        history: input.history,
        userMessage: content,
        prevDraft: draft,
        prevHardFilters: hardFilters,
        prevUnderstanding: understanding,
      }),
      runSideChat(
        input,
        preRecall?.candidates.map((c) => c.id) ?? [],
        (preRecall?.candidates.length ?? 0) === 0,
        preRecall?.crossCityUsed ?? false,
        content,
        {
          published: Boolean(input.myIntentId),
          pendingConfirm,
          readyToPublish: false,
        },
        onDelta,
      ),
    ]);
    if (extracted) {
      draft = extracted.draft;
      hardFilters = extracted.hardFilters;
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
      wishDraft: draft,
      pendingConfirm,
    };
  }

  let myIntentId = input.myIntentId;
  let matchIntentId = input.matchIntentId;
  let matchQuality: MatchQuality | undefined;
  let crossCityMatch = false;
  let nearMissIds: string[] = [];
  let recallEmpty = false;
  let matchReason: string | undefined;

  const userAffirmed =
    isAffirmation(input.userMessage ?? "", input.action) ||
    Boolean(chatParsed.affirmPublish);

  if (chatParsed.confirmLine?.trim() && !myIntentId) {
    pendingConfirm = chatParsed.confirmLine.trim();
  }

  const shouldPublish =
    !myIntentId &&
    draft.kind &&
    (userAffirmed && (pendingConfirm || readyToPublish));

  if (shouldPublish) {
    const mine = publishDraft(input, draft);
    myIntentId = mine.id;
    pendingConfirm = null;
  }

  const mine = myIntentId ? getIntentById(myIntentId) : null;
  let recall = mine
    ? recallWishCandidates({
        mine,
        hardFilters,
        understanding,
        exclude: input.triedIntentIds,
        excludeOwnerIds: input.triedOwnerIds,
      })
    : null;

  if (mine && recall) {
    nearMissIds = recall.nearMissIds;
    recallEmpty = recall.candidates.length === 0;
    crossCityMatch = recall.crossCityUsed;

    const candidateIds = recall.candidates.map((c) => c.id);
    let picked = pickMatchId(chatParsed.pickMatchIntentId ?? null, candidateIds, input);

    if (!picked && (input.action === "skip_match" || input.action === "see_next" || input.action === "rematch")) {
      const next = pickNextFromRecall(recall, input.action === "see_next" ? null : input.matchIntentId);
      picked = next?.id ?? null;
      if (next) matchQuality = next.quality;
      crossCityMatch = next?.crossCity ?? crossCityMatch;
    } else if (picked) {
      const row = recall.candidates.find((c) => c.id === picked);
      matchQuality = row?.quality ?? "exact";
      crossCityMatch = row?.crossCity ?? crossCityMatch;
    }

    if (recallEmpty) {
      matchIntentId = null;
    } else if (picked) {
      matchIntentId = picked;
      matchReason = await generateMatchReason({
        lang: input.lang,
        mineId: mine.id,
        otherId: picked,
      });
    }
  }

  let handoffTo: "matchmaker" | null =
    chatParsed.handoffTo === "matchmaker" && (input.handoffCount ?? 0) < 2 ? "matchmaker" : null;
  if (handoffTo) matchIntentId = null;

  let reply = (chatParsed.reply ?? "").trim();
  if (!reply) {
    const cfg = await import("./config.server").then((m) => m.getServerConfig());
    return fallback(input, cfg.deepseekApiKey ? "error" : "no_key");
  }

  if (recallEmpty && mine && !handoffTo) {
    matchIntentId = null;
    if (!replyMentionsEmptyPool(reply, input.lang)) {
      reply = zh(input.lang)
        ? `${reply} 按你现在的条件，暂时还没有合适的人——要不要放宽时间、水平，或换个活动试试？`
        : `${reply} With your current filters I don't have a good match yet — want to loosen when, level, or try another activity?`;
    }
  }

  if (crossCityMatch && matchIntentId && !handoffTo) {
    if (!replyMentionsCrossCity(reply, input.lang)) {
      const extra = zh(input.lang)
        ? "同城暂时没有，这位来自其他城市。"
        : "No same-city match — this person is in another city.";
      reply = `${reply} ${extra}`;
    }
  }

  return {
    reply,
    understanding,
    hardFilters,
    wishDraft: draft,
    pendingConfirm,
    myIntentId,
    matchIntentId,
    matchQuality,
    matchReason,
    crossCityMatch,
    nearMissIds,
    stage: myIntentId ? "published" : "prompt",
    suggestions: (chatParsed.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
    handoffTo,
    handoffSummary: (chatParsed.handoffSummary ?? "").trim(),
    transitionReply: (chatParsed.transitionReply ?? "").trim(),
    recallEmpty,
  };
}

export type SideStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; result: SideTurnOutput };

export function sideTurnReadable(input: SideTurnInput): ReadableStream<SideStreamEvent> {
  return new ReadableStream<SideStreamEvent>({
    async start(controller) {
      try {
        const result = await runSideTurn(input, (text) => {
          controller.enqueue({ type: "delta", text });
        });
        controller.enqueue({ type: "done", result });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export { EMPTY_WISH_HARD_FILTERS, emptyWishDraft };
