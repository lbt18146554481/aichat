import { chatCompletionJsonStream } from "./llm.server";
import type { AgentId } from "./seed";
import type { UserUnderstanding } from "./understanding";
import { emptyUnderstanding } from "./handoff";
import { log } from "./logger.server";

export type OrchestratorLang = "en" | "zh-CN";

export interface OrchestratorHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface OrchestratorInput {
  lang: OrchestratorLang;
  userMessage: string;
  history: OrchestratorHistoryItem[];
  /** If user already picked a chip, skip LLM. */
  forcedTarget?: AgentId | null;
}

export interface OrchestratorOutput {
  action: "handoff" | "clarify" | "error";
  target: "matchmaker" | "sidebyside" | null;
  confidence: number;
  reply: string;
  summary: string;
  understanding: UserUnderstanding;
  sideBySideHints?: { activity?: string; when?: string; area?: string };
  /** Short phrases the USER might say next (composer suggestions). */
  suggestions: string[];
}

export type OrchestratorStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; result: OrchestratorOutput };

interface LlmJson {
  action?: "handoff" | "clarify";
  target?: "matchmaker" | "sidebyside" | null;
  confidence?: number;
  reply?: string;
  summary?: string;
  understanding?: {
    notes?: string[];
    likes?: string[];
    dislikes?: string[];
  };
  sideBySideHints?: { activity?: string; when?: string; area?: string };
  suggestions?: string[];
}

function zh(lang: OrchestratorLang) {
  return lang === "zh-CN";
}

function normalizeUnderstanding(raw: LlmJson["understanding"]): UserUnderstanding {
  return {
    notes: (raw?.notes ?? []).map((n) => n.trim()).filter(Boolean).slice(-6),
    positive: (raw?.likes ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    negative: (raw?.dislikes ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
  };
}

function normalizeSuggestions(raw: string[] | undefined, lang: OrchestratorLang): string[] {
  const out = (raw ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 40)
    .slice(0, 4);
  if (out.length) return out;
  return zh(lang)
    ? ["想认识新朋友", "想找人一起做事", "先聊聊你能做什么"]
    : ["I'd like to meet someone", "Find company for something", "What can you help with?"];
}

function forcedHandoff(input: OrchestratorInput, target: AgentId): OrchestratorOutput {
  return {
    action: "handoff",
    target,
    confidence: 1,
    reply: "",
    summary: input.userMessage.trim(),
    understanding: emptyUnderstanding(),
    suggestions: [],
    sideBySideHints: target === "sidebyside" ? { activity: input.userMessage.trim() } : undefined,
  };
}

function connectionError(input: OrchestratorInput): OrchestratorOutput {
  const isZh = zh(input.lang);
  return {
    action: "error",
    target: null,
    confidence: 0,
    reply: isZh
      ? "刚才没连上对话服务，请稍后再试。"
      : "Couldn't reach the conversation service. Please try again.",
    summary: input.userMessage.trim(),
    understanding: emptyUnderstanding(),
    suggestions: isZh
      ? ["再试一次", "你好"]
      : ["Try again", "Hi"],
  };
}

function buildSystem(lang: OrchestratorLang): string {
  const isZh = zh(lang);
  return [
    isZh
      ? `你是 Maitri 首页接待，像朋友聊天，以用户为主导。没有方向按钮——由你决定何时 handoff。

能力：
- matchmaker：帮认识新朋友
- sidebyside：帮约人一起做事

怎么回：
1) 先认真回应用户说的话。用户问「你是谁」就介绍自己，不要逼选方向。
2) 不要每句都以「你更想 A 还是 B？」收尾。
3) 只有用户清楚表达想认识人 / 想约活动时，才 action=handoff（confidence≥0.8）。
4) 否则 action=clarify：自然聊天，把主动权留给用户。
5) suggestions：2-4 条「用户接下来可能说的短句」（第一人称、可直接当回复），贴合对话，不要写成你对用户的提问。

只输出 JSON（reply 放最前，便于流式）：
{"reply":"...","action":"handoff"|"clarify","target":"matchmaker"|"sidebyside"|null,"confidence":0-1,"summary":"一句话概括","understanding":{"notes":[],"likes":[],"dislikes":[]},"sideBySideHints":{"activity":"","when":"","area":""},"suggestions":["短句1","短句2"]}`
      : `You are Maitri's homepage host. User-led. No direction buttons — you decide when to handoff.

You can hand off to matchmaker (meet people) or sidebyside (do activities).

1) Answer what they said first.
2) Don't force A-or-B every turn.
3) handoff only when they clearly want to meet someone or do an activity (confidence≥0.8).
4) Otherwise clarify and leave the floor to them.
5) suggestions: 2-4 short first-person phrases the USER might say next (not your questions to them).

JSON only (reply first):
{"reply":"...","action":"handoff"|"clarify","target":"matchmaker"|"sidebyside"|null,"confidence":0-1,"summary":"...","understanding":{"notes":[],"likes":[],"dislikes":[]},"sideBySideHints":{"activity":"","when":"","area":""},"suggestions":["..."]}`,
    isZh
      ? "用简体中文写 reply / summary / suggestions。"
      : "Write reply, summary, and suggestions in English only — no Chinese characters.",
  ].join("\n\n");
}

function assembleFromParsed(input: OrchestratorInput, parsed: LlmJson): OrchestratorOutput {
  const isZh = zh(input.lang);
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  let action: "handoff" | "clarify" = parsed.action === "clarify" ? "clarify" : "handoff";
  let target: "matchmaker" | "sidebyside" | null =
    parsed.target === "matchmaker" || parsed.target === "sidebyside" ? parsed.target : null;

  if (action === "handoff" && (!target || confidence < 0.8)) {
    action = "clarify";
    target = null;
  }
  if (action === "clarify") target = null;

  const reply =
    (parsed.reply ?? "").trim() ||
    (action === "clarify"
      ? isZh
        ? "我在这儿。想聊天、认识新朋友，或找人一起做事都可以——你说了算。"
        : "I'm here. We can chat, meet someone new, or find company for something — your call."
      : "");

  return {
    action,
    target,
    confidence,
    reply,
    summary: (parsed.summary ?? input.userMessage).trim() || input.userMessage.trim(),
    understanding: normalizeUnderstanding(parsed.understanding),
    sideBySideHints: parsed.sideBySideHints,
    suggestions: action === "handoff" ? [] : normalizeSuggestions(parsed.suggestions, input.lang),
  };
}

/** Non-streaming wrapper (tests / forced paths). */
export async function runOrchestratorTurn(input: OrchestratorInput): Promise<OrchestratorOutput> {
  let result: OrchestratorOutput | null = null;
  for await (const ev of runOrchestratorTurnStream(input)) {
    if (ev.type === "done") result = ev.result;
  }
  return result ?? connectionError(input);
}

export async function* runOrchestratorTurnStream(
  input: OrchestratorInput,
): AsyncGenerator<OrchestratorStreamEvent> {
  if (input.forcedTarget) {
    log.info("orchestrator", "forced handoff", { target: input.forcedTarget });
    yield { type: "done", result: forcedHandoff(input, input.forcedTarget) };
    return;
  }

  log.info("orchestrator", "turn stream", {
    lang: input.lang,
    userPreview: input.userMessage.slice(0, 80),
    historyLen: input.history.length,
  });

  const messages = [
    { role: "system" as const, content: buildSystem(input.lang) },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.userMessage },
  ];

  let parsed: LlmJson | null = null;
  for await (const ev of chatCompletionJsonStream<LlmJson>(messages, {
    temperature: 0.55,
    maxTokens: 1200,
  })) {
    if (ev.type === "delta") {
      yield { type: "delta", text: ev.text };
    } else if (ev.type === "done") {
      parsed = ev.value;
    } else {
      log.warn("orchestrator", "LLM empty → connection error (no fake fallback)", {
        userPreview: input.userMessage.slice(0, 80),
      });
      yield { type: "done", result: connectionError(input) };
      return;
    }
  }

  if (!parsed) {
    yield { type: "done", result: connectionError(input) };
    return;
  }

  const result = assembleFromParsed(input, parsed);
  log.info("orchestrator", "result", {
    action: result.action,
    target: result.target,
    confidence: result.confidence,
    replyPreview: result.reply.slice(0, 80),
  });
  yield { type: "done", result };
}

/** ReadableStream wrapper for TanStack Start server functions. */
export function orchestratorTurnReadable(input: OrchestratorInput): ReadableStream<OrchestratorStreamEvent> {
  return new ReadableStream<OrchestratorStreamEvent>({
    async start(controller) {
      try {
        for await (const ev of runOrchestratorTurnStream(input)) {
          controller.enqueue(ev);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
