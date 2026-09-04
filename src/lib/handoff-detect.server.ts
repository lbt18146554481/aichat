import { chatCompletionJson } from "./llm.server";
import { MAX_HANDOFF_COUNT } from "./handoff";
import { selfVoiceRule } from "./agent-voice";
import {
  explicitActivityBuddySignal,
  explicitMeetSomeoneSignal,
  userChoseMeetSomeoneAfterDisambig,
} from "./meet-someone-detect";
import { isWishLaneSelectionMessage } from "./wish-lane";

export interface DetectHandoffInput {
  lang: "en" | "zh-CN";
  currentAgent: "matchmaker" | "sidebyside";
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  handoffCount: number;
}

export interface DetectHandoffOutput {
  handoffTo: "matchmaker" | "sidebyside" | null;
  askRevokeWish: boolean;
  transitionReply: string;
  summary: string;
  /** Model thinks user might want to switch but is unsure — UI should ask, never auto-switch. */
  needsClarify: boolean;
  clarifyReply: string;
}

interface LlmDetectJson {
  handoffTo?: "matchmaker" | "sidebyside" | null;
  askRevokeWish?: boolean;
  transitionReply?: string;
  summary?: string;
  confidence?: number;
  needsClarify?: boolean;
  clarifyReply?: string;
}

interface LlmSummaryJson {
  summary?: string;
}

/** One round ≈ one user turn (+ following assistants until next user). Keep last N rounds. */
export function splitHistoryByRounds(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  recentRounds = 6,
): {
  earlier: Array<{ role: "user" | "assistant"; content: string }>;
  recent: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const userIndices: number[] = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "user") userIndices.push(i);
  }
  if (userIndices.length <= recentRounds) {
    return { earlier: [], recent: history };
  }
  const startIdx = userIndices[userIndices.length - recentRounds]!;
  return {
    earlier: history.slice(0, startIdx),
    recent: history.slice(startIdx),
  };
}

const CONFIDENCE_HANDOFF = 0.8;

function emptyOutput(): DetectHandoffOutput {
  return {
    handoffTo: null,
    askRevokeWish: false,
    transitionReply: "",
    summary: "",
    needsClarify: false,
    clarifyReply: "",
  };
}

async function summarizeEarlierTurns(
  lang: "en" | "zh-CN",
  currentAgent: "matchmaker" | "sidebyside",
  earlier: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (earlier.length === 0) return "";
  const isZh = lang === "zh-CN";
  const system = isZh
    ? `用 2-4 句简体中文概括这段更早的对话。当前用户在「${currentAgent === "matchmaker" ? "认识新朋友" : "找人一起做事"}」。保留用户目标、已说的偏好（活动/时间/城市/想找什么样的人等），不要编造。只输出 JSON：{"summary":"..."}`
    : `Summarize earlier chat in 2-4 English sentences. User is in "${currentAgent === "matchmaker" ? "meet someone" : "do something together"}". Keep goals and prefs already stated; do not invent. JSON only: {"summary":"..."}`;

  const blob = earlier
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")
    .slice(0, 6000);

  const parsed = await chatCompletionJson<LlmSummaryJson>(
    [
      { role: "system", content: system },
      { role: "user", content: blob },
    ],
    { temperature: 0.2, maxTokens: 350 },
  );
  return (parsed?.summary ?? "").trim();
}

function defaultTransition(
  isZh: boolean,
  target: "matchmaker" | "sidebyside",
): string {
  if (isZh) {
    return target === "sidebyside"
      ? "好，那我们来看看你想和谁一起做什么——"
      : "好，那我们聊聊你想认识什么样的人——";
  }
  return target === "sidebyside"
    ? "Sure — let's figure out what you'd like to do with someone."
    : "Sure — tell me what kind of person you're hoping to meet.";
}

function defaultClarify(
  isZh: boolean,
  currentAgent: "matchmaker" | "sidebyside",
): string {
  if (currentAgent === "sidebyside") {
    return isZh
      ? "想确认一下：你是想找一起做的事（比如约跑步、找跑步搭子），还是想找喜欢这类事的人？"
      : "Just to check — find an activity together (e.g. a run, a buddy), or meet people who like this kind of thing?";
  }
  return isZh
    ? "想确认一下：你是想继续找喜欢这类事的人，还是改成找一起做的事（活动搭子）？"
    : "Just to check — keep looking for people who like this, or switch to finding an activity buddy?";
}

export async function detectMidConversationHandoff(
  input: DetectHandoffInput,
): Promise<DetectHandoffOutput> {
  const empty = emptyOutput();
  if (input.handoffCount >= MAX_HANDOFF_COUNT) return empty;

  const isZh = input.lang === "zh-CN";

  if (input.currentAgent === "sidebyside") {
    if (explicitActivityBuddySignal(input.userMessage)) {
      return empty;
    }
    if (isWishLaneSelectionMessage(input.userMessage)) {
      return empty;
    }
    if (
      userChoseMeetSomeoneAfterDisambig(input.userMessage, input.history) ||
      explicitMeetSomeoneSignal(input.userMessage)
    ) {
      return {
        handoffTo: "matchmaker",
        askRevokeWish: false,
        transitionReply: defaultTransition(isZh, "matchmaker"),
        summary: input.userMessage.trim(),
        needsClarify: false,
        clarifyReply: "",
      };
    }
  }

  if (input.currentAgent === "matchmaker" && explicitActivityBuddySignal(input.userMessage)) {
    return {
      handoffTo: "sidebyside",
      askRevokeWish: false,
      transitionReply: defaultTransition(isZh, "sidebyside"),
      summary: input.userMessage.trim(),
      needsClarify: false,
      clarifyReply: "",
    };
  }

  const other = input.currentAgent === "matchmaker" ? "sidebyside" : "matchmaker";
  const { earlier, recent } = splitHistoryByRounds(input.history, 6);
  const earlierSummary = await summarizeEarlierTurns(input.lang, input.currentAgent, earlier);

  const laneLabel = isZh
    ? input.currentAgent === "matchmaker"
      ? "找喜欢某类事的人"
      : "找一起做的事 / 活动搭子"
    : input.currentAgent === "matchmaker"
      ? "people who like something"
      : "find an activity / activity buddy";
  const otherLabel = isZh
    ? other === "matchmaker"
      ? "找喜欢某类事的人"
      : "找一起做的事 / 活动搭子"
    : other === "matchmaker"
      ? "people who like something"
      : "find an activity / activity buddy";

  const system = isZh
    ? `你在判断用户是否想换方向。当前在「${laneLabel}」（内部 id=${input.currentAgent}）。
另一方向：「${otherLabel}」（id=${other}）。

规则：
1) 只有用户**明确**要改去另一方向时，才设 handoffTo="${other}"，且 confidence 必须 ≥ 0.8。
   - 「找活动 / 搭子 / 一起跑步 / 约跑步 / 看心愿池」→ 留在 sidebyside
   - 「认识喜欢…的人 / 找对象 / 介绍某个人 / 以认识人为目的」→ matchmaker
   - 「想找女生一起跑步」等模糊句 → needsClarify，追问是找活动还是找喜欢的人
2) 若你觉得用户**可能**想切换但不够确定：handoffTo=null，needsClarify=true，用 clarifyReply 写一句简短追问（确认是找活动还是找喜欢的人），confidence 填你的把握（通常 <0.8）。
3) 仍在当前话题（含补充搭子/活动偏好）→ handoffTo=null，needsClarify=false。
4) 从找搭子切走且用户可能已有心愿时，askRevokeWish 可为 true（仅在确定 handoff 时有意义）。
5) 自称只用「我」；clarifyReply / transitionReply 不要提 Matchmaker、Side by Side、转接等产品名。

${earlierSummary ? `更早对话摘要：\n${earlierSummary}\n` : ""}
只输出 JSON：
{"handoffTo":null|"${other}","needsClarify":false,"clarifyReply":"","askRevokeWish":false,"transitionReply":"","summary":"一句话","confidence":0-1}
${selfVoiceRule(true)}`
    : `Decide if the user wants to change direction. Currently in "${laneLabel}" (id=${input.currentAgent}).
Other lane: "${otherLabel}" (id=${other}).

Rules:
1) Set handoffTo="${other}" only when they clearly want the other lane, with confidence ≥ 0.8.
2) If they might want to switch but you are unsure: handoffTo=null, needsClarify=true, clarifyReply=one short question confirming direction, confidence usually <0.8.
3) Still on-topic (including companion/activity prefs) → handoffTo=null, needsClarify=false.
4) askRevokeWish may be true when leaving sidebyside with a published wish (only matters on firm handoff).
5) Use only I/me; no product names in clarifyReply/transitionReply.

${earlierSummary ? `Earlier conversation summary:\n${earlierSummary}\n` : ""}
JSON only:
{"handoffTo":null|"${other}","needsClarify":false,"clarifyReply":"","askRevokeWish":false,"transitionReply":"","summary":"...","confidence":0-1}
${selfVoiceRule(false)}`;

  const parsed = await chatCompletionJson<LlmDetectJson>(
    [
      { role: "system", content: system },
      ...recent.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.userMessage },
    ],
    { temperature: 0.2, maxTokens: 450 },
  );

  if (!parsed) return empty;

  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  const needsClarify = Boolean(parsed.needsClarify);
  const clarifyReply =
    (parsed.clarifyReply ?? "").trim() ||
    (needsClarify ? defaultClarify(isZh, input.currentAgent) : "");

  // Uncertain → ask; never auto-switch.
  if (needsClarify) {
    return {
      handoffTo: null,
      askRevokeWish: false,
      transitionReply: "",
      summary: (parsed.summary ?? input.userMessage).trim(),
      needsClarify: true,
      clarifyReply,
    };
  }

  if (confidence < CONFIDENCE_HANDOFF) return empty;
  if (parsed.handoffTo !== other) return empty;

  return {
    handoffTo: parsed.handoffTo,
    askRevokeWish: Boolean(parsed.askRevokeWish) && input.currentAgent === "sidebyside",
    transitionReply: (parsed.transitionReply ?? "").trim() || defaultTransition(isZh, parsed.handoffTo),
    summary: (parsed.summary ?? input.userMessage).trim(),
    needsClarify: false,
    clarifyReply: "",
  };
}
