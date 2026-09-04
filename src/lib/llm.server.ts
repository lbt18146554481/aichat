import OpenAI from "openai";
import { getServerConfig } from "./config.server";
import { log } from "./logger.server";
import { extractPartialJsonStringField, extractPartialJsonBooleanField, recoverPlainTextAsJsonField } from "./json-partial";

export { extractPartialJsonStringField } from "./json-partial";

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const cfg = getServerConfig();
  if (!cfg.deepseekApiKey) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: cfg.deepseekApiKey,
      baseURL: cfg.deepseekBaseUrl,
    });
    log.info("llm", "client created", {
      baseURL: cfg.deepseekBaseUrl,
      model: cfg.deepseekModel,
      keyLen: cfg.deepseekApiKey.length,
    });
  }
  return client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function completionExtra(thinking: boolean, jsonFormat: boolean): Record<string, unknown> {
  if (thinking) {
    return {
      reasoning_effort: "high",
      thinking: { type: "enabled" },
    };
  }
  const extra: Record<string, unknown> = { thinking: { type: "disabled" } };
  if (jsonFormat) extra.response_format = { type: "json_object" };
  return extra;
}

/** Call DeepSeek chat once. Returns null on missing key / failure / empty. */
async function chatCompletionOnce(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; thinking?: boolean } | undefined,
  jsonFormat: boolean,
): Promise<string | null> {
  const cfg = getServerConfig();
  const c = getClient();
  if (!c) return null;
  const started = Date.now();
  const userPreview = [...messages].reverse().find((m) => m.role === "user")?.content?.slice(0, 80);
  const thinking = opts?.thinking !== false;
  log.info("llm", "request", {
    model: cfg.deepseekModel,
    msgs: messages.length,
    maxTokens: opts?.maxTokens ?? 800,
    thinking,
    jsonFormat: !thinking && jsonFormat,
    userPreview,
  });
  try {
    const response = await c.chat.completions.create({
      model: cfg.deepseekModel,
      messages,
      stream: false,
      temperature: opts?.temperature ?? 0.8,
      max_tokens: opts?.maxTokens ?? 800,
      ...completionExtra(thinking, jsonFormat),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const text = response.choices[0]?.message?.content?.trim();
    log.info("llm", "ok", {
      ms: Date.now() - started,
      chars: text?.length ?? 0,
      preview: text?.slice(0, 120),
    });
    if (!text) {
      log.warn("llm", "empty content", { jsonFormat: !thinking && jsonFormat });
      return null;
    }
    return text;
  } catch (err) {
    log.error("llm", "DeepSeek error", { jsonFormat: !thinking && jsonFormat, err });
    return null;
  }
}

/** Call DeepSeek chat. Returns null on missing key / failure. */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; thinking?: boolean },
): Promise<string | null> {
  if (!getClient()) {
    log.warn("llm", "DEEPSEEK_API_KEY not set — skipping LLM");
    return null;
  }
  const structured = opts?.thinking === false;
  if (!structured) {
    return chatCompletionOnce(messages, opts, false);
  }
  let text = await chatCompletionOnce(messages, opts, true);
  if (!text) {
    log.warn("llm", "structured call empty — retry without response_format");
    text = await chatCompletionOnce(messages, opts, false);
  }
  return text;
}

export async function generateAgentReply(opts: {
  system: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): Promise<string | null> {
  return chatCompletion([
    { role: "system", content: opts.system },
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userMessage },
  ]);
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/** Chat completion that expects a JSON object in the response. */
export async function chatCompletionJson<T>(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<T | null> {
  // Structured calls: no thinking (avoids empty content) + enough tokens for JSON.
  const raw = await chatCompletion(messages, {
    temperature: opts?.temperature ?? 0.4,
    maxTokens: opts?.maxTokens ?? 1200,
    thinking: false,
  });
  if (!raw) return null;
  try {
    return JSON.parse(extractJsonObject(raw)) as T;
  } catch (err) {
    log.warn("llm", "JSON parse error — trying plain-text recovery", {
      err: err instanceof Error ? err.message : String(err),
      rawPreview: raw.slice(0, 200),
    });
    return recoverPlainTextAsJsonField<T>(raw, "reply");
  }
}

/** Stream plain-text deltas from DeepSeek. Yields incremental token strings. */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; thinking?: boolean },
): AsyncGenerator<string> {
  const cfg = getServerConfig();
  const c = getClient();
  if (!c) {
    log.warn("llm", "DEEPSEEK_API_KEY not set — skipping stream");
    return;
  }
  const started = Date.now();
  const userPreview = [...messages].reverse().find((m) => m.role === "user")?.content?.slice(0, 80);
  const thinking = opts?.thinking === true;
  log.info("llm", "stream request", {
    model: cfg.deepseekModel,
    msgs: messages.length,
    maxTokens: opts?.maxTokens ?? 800,
    thinking,
    userPreview,
  });
  try {
    const stream = await c.chat.completions.create({
      model: cfg.deepseekModel,
      messages,
      stream: true,
      temperature: opts?.temperature ?? 0.8,
      max_tokens: opts?.maxTokens ?? 800,
      ...completionExtra(thinking, !thinking),
    } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
    let chars = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (!delta) continue;
      chars += delta.length;
      yield delta;
    }
    log.info("llm", "stream ok", { ms: Date.now() - started, chars });
  } catch (err) {
    log.error("llm", "DeepSeek stream error", err);
  }
}

export type JsonStreamEvent<T> =
  | { type: "delta"; text: string }
  | { type: "done"; value: T }
  | { type: "error" };

/**
 * Stream a JSON chat completion. Emits growing `reply` string as deltas
 * (field must appear early in the JSON), then the parsed object.
 */
function emitReplyDelta<T>(
  value: T,
  replyField: string,
  lastReply: string,
): { lastReply: string; delta: string | null } {
  const reply = (value as Record<string, unknown>)[replyField];
  if (typeof reply === "string" && reply.trim() && reply !== lastReply) {
    return { lastReply: reply, delta: reply };
  }
  return { lastReply, delta: null };
}

async function* finishJsonStream<T>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } | undefined,
  replyField: string,
  raw: string,
  lastReply: string,
): AsyncGenerator<JsonStreamEvent<T>> {
  const trimmed = raw.trim();
  if (trimmed && !trimmed.includes("{")) {
    const recovered = recoverPlainTextAsJsonField<T>(raw, replyField);
    if (recovered) {
      log.warn("llm", "plain-text stream recovery", { preview: trimmed.slice(0, 80) });
      const d = emitReplyDelta(recovered, replyField, lastReply);
      if (d.delta) yield { type: "delta", text: d.delta };
      yield { type: "done", value: recovered };
      return;
    }
  }

  if (trimmed.includes("{")) {
    try {
      const value = JSON.parse(extractJsonObject(raw)) as T;
      const d = emitReplyDelta(value, replyField, lastReply);
      if (d.delta) yield { type: "delta", text: d.delta };
      yield { type: "done", value };
      return;
    } catch (err) {
      log.warn("llm", "JSON stream parse error — retrying non-stream", {
        err: err instanceof Error ? err.message : String(err),
        rawPreview: raw.slice(0, 200),
      });
    }
  } else if (trimmed) {
    log.warn("llm", "JSON stream without object — retrying non-stream", {
      rawPreview: raw.slice(0, 200),
    });
  } else {
    log.warn("llm", "JSON stream empty/whitespace — falling back to non-stream", {
      rawLen: raw.length,
    });
  }

  const fallback = await chatCompletionJson<T>(messages, {
    temperature: opts?.temperature ?? 0.4,
    maxTokens: opts?.maxTokens ?? 2000,
  });
  if (fallback) {
    const d = emitReplyDelta(fallback, replyField, lastReply);
    if (d.delta) yield { type: "delta", text: d.delta };
    yield { type: "done", value: fallback };
    return;
  }

  const recovered = recoverPlainTextAsJsonField<T>(raw, replyField);
  if (recovered) {
    log.warn("llm", "plain-text recovery (last resort)", { preview: trimmed.slice(0, 80) });
    const d = emitReplyDelta(recovered, replyField, lastReply);
    if (d.delta) yield { type: "delta", text: d.delta };
    yield { type: "done", value: recovered };
    return;
  }

  log.error("llm", "JSON stream unrecoverable", { rawPreview: raw.slice(0, 200) });
  yield { type: "error" };
}

export async function* chatCompletionJsonStream<T>(
  messages: ChatMessage[],
  opts?: {
    temperature?: number;
    maxTokens?: number;
    replyField?: string;
    /** When this field equals the given value in partial JSON, stop streaming reply deltas. */
    suppressReplyWhen?: { field: string; equals: boolean };
  },
): AsyncGenerator<JsonStreamEvent<T>> {
  const replyField = opts?.replyField ?? "reply";
  let raw = "";
  let lastReply = "";
  for await (const chunk of chatCompletionStream(messages, {
    temperature: opts?.temperature ?? 0.4,
    maxTokens: opts?.maxTokens ?? 2000,
    thinking: false,
  })) {
    raw += chunk;
    const suppressField = opts?.suppressReplyWhen?.field;
    const suppress =
      suppressField != null &&
      extractPartialJsonBooleanField(raw, suppressField) === opts!.suppressReplyWhen!.equals;
    // Model sometimes streams plain text instead of JSON — still show tokens live.
    if (!raw.includes("{")) {
      const plain = raw.trim();
      if (!suppress && plain && plain !== lastReply) {
        lastReply = plain;
        yield { type: "delta", text: plain };
      }
      continue;
    }
    const partial = extractPartialJsonStringField(raw, replyField);
    if (!suppress && partial != null && partial !== lastReply) {
      lastReply = partial;
      yield { type: "delta", text: partial };
    }
  }
  yield* finishJsonStream(messages, opts, replyField, raw, lastReply);
}

export async function generatePersonaReply(opts: {
  persona: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  lang?: "zh" | "en";
  /** First reply after the user says hello. */
  isHello?: boolean;
}): Promise<string | null> {
  const langHint =
    opts.lang === "zh"
      ? "用自然简体中文回复，1-4 句，温暖具体。"
      : "Reply in natural English, 1-4 sentences, warm and specific.";
  const roleHint =
    opts.lang === "zh"
      ? `你是资料卡上的 AI 陪聊角色（用户已在界面看到「AI 角色」标注）。以该角色的口吻陪用户聊天、练打招呼；像真人说话，但不要假装是真人在另一端、不要提 Maitri/系统/模型。${opts.isHello ? "这是用户刚发来的第一句招呼，自然接住并愿意继续聊。" : ""}`
      : `You are an AI companion persona from this profile card (the UI labels you as AI). Chat in this character's voice; warm and human, but do not pretend to be a real person on the other end or mention Maitri/system/models. ${opts.isHello ? "This is the user's opening hello — welcome it and keep the conversation going." : ""}`;
  return chatCompletion([
    {
      role: "system",
      content: `${opts.persona}\n\n${roleHint} ${langHint}`,
    },
    ...opts.history,
    { role: "user", content: opts.userMessage },
  ]);
}

/* ─── Tool calling (OpenAI-compatible / DeepSeek) ─── */

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AssistantToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolLoopMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: AssistantToolCall[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

/** One non-streaming completion that may return tool_calls. */
export async function chatCompletionToolTurn(opts: {
  messages: ToolLoopMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string | null; tool_calls: AssistantToolCall[] } | null> {
  const cfg = getServerConfig();
  const c = getClient();
  if (!c) return null;

  const started = Date.now();
  try {
    const response = await c.chat.completions.create({
      model: cfg.deepseekModel,
      messages: opts.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: opts.tools as OpenAI.Chat.ChatCompletionTool[],
      tool_choice: "auto",
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 800,
      ...completionExtra(false, false),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

    const msg = response.choices[0]?.message;
    const tool_calls = (msg?.tool_calls ?? [])
      .filter(
        (t): t is OpenAI.Chat.ChatCompletionMessageToolCall & { type: "function" } =>
          t.type === "function",
      )
      .map((t) => ({
        id: t.id,
        type: "function" as const,
        function: {
          name: t.function.name,
          arguments: t.function.arguments ?? "{}",
        },
      }));

    log.info("llm", "tool turn ok", {
      ms: Date.now() - started,
      tools: tool_calls.map((t) => t.function.name),
      contentChars: msg?.content?.length ?? 0,
    });

    return {
      content: msg?.content?.trim() || null,
      tool_calls,
    };
  } catch (err) {
    log.error("llm", "tool turn error", err);
    return null;
  }
}

/**
 * Run tool rounds until the model stops calling tools or maxRounds.
 * Returns the full message list (including tool results) for a follow-up reply call.
 */
export async function runToolLoop(opts: {
  messages: ToolLoopMessage[];
  tools: ToolDefinition[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
  maxRounds?: number;
  temperature?: number;
}): Promise<{ messages: ToolLoopMessage[]; rounds: number; called: string[] }> {
  const maxRounds = opts.maxRounds ?? 4;
  const messages = [...opts.messages];
  const called: string[] = [];
  let rounds = 0;

  for (let i = 0; i < maxRounds; i++) {
    const turn = await chatCompletionToolTurn({
      messages,
      tools: opts.tools,
      temperature: opts.temperature,
    });
    if (!turn) break;
    rounds++;

    if (turn.tool_calls.length === 0) {
      if (turn.content) {
        messages.push({ role: "assistant", content: turn.content });
      }
      break;
    }

    messages.push({
      role: "assistant",
      content: turn.content,
      tool_calls: turn.tool_calls,
    });

    for (const tc of turn.tool_calls) {
      called.push(tc.function.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      let result: unknown;
      try {
        result = await opts.execute(tc.function.name, args);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { messages, rounds, called };
}
