import OpenAI from "openai";
import { getServerConfig } from "./config.server";
import { log } from "./logger.server";
import { extractPartialJsonStringField } from "./json-partial";

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

/** Call DeepSeek chat. Returns null on missing key / failure. */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; thinking?: boolean },
): Promise<string | null> {
  const cfg = getServerConfig();
  const c = getClient();
  if (!c) {
    log.warn("llm", "DEEPSEEK_API_KEY not set — skipping LLM");
    return null;
  }
  const started = Date.now();
  const userPreview = [...messages].reverse().find((m) => m.role === "user")?.content?.slice(0, 80);
  const thinking = opts?.thinking !== false;
  log.info("llm", "request", {
    model: cfg.deepseekModel,
    msgs: messages.length,
    maxTokens: opts?.maxTokens ?? 800,
    thinking,
    userPreview,
  });
  try {
    const extra = thinking
      ? {
          // DeepSeek-specific knobs
          reasoning_effort: "high",
          thinking: { type: "enabled" },
        }
      : {};
    const response = await c.chat.completions.create({
      model: cfg.deepseekModel,
      messages,
      stream: false,
      temperature: opts?.temperature ?? 0.8,
      max_tokens: opts?.maxTokens ?? 800,
      ...extra,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const text = response.choices[0]?.message?.content?.trim();
    log.info("llm", "ok", {
      ms: Date.now() - started,
      chars: text?.length ?? 0,
      preview: text?.slice(0, 120),
    });
    if (!text) {
      log.warn("llm", "empty content (often thinking ate the token budget)");
      return null;
    }
    return text;
  } catch (err) {
    log.error("llm", "DeepSeek error", err);
    return null;
  }
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
    log.error("llm", "JSON parse error", {
      err: err instanceof Error ? err.message : String(err),
      rawPreview: raw.slice(0, 200),
    });
    return null;
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
    const extra = thinking
      ? {
          reasoning_effort: "high",
          thinking: { type: "enabled" },
        }
      : {};
    const stream = await c.chat.completions.create({
      model: cfg.deepseekModel,
      messages,
      stream: true,
      temperature: opts?.temperature ?? 0.8,
      max_tokens: opts?.maxTokens ?? 800,
      ...extra,
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
export async function* chatCompletionJsonStream<T>(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; replyField?: string },
): AsyncGenerator<JsonStreamEvent<T>> {
  const replyField = opts?.replyField ?? "reply";
  let raw = "";
  let lastReply = "";
  for await (const chunk of chatCompletionStream(messages, {
    temperature: opts?.temperature ?? 0.4,
    maxTokens: opts?.maxTokens ?? 1200,
    thinking: false,
  })) {
    raw += chunk;
    const partial = extractPartialJsonStringField(raw, replyField);
    if (partial != null && partial !== lastReply) {
      lastReply = partial;
      yield { type: "delta", text: partial };
    }
  }
  if (!raw.trim()) {
    yield { type: "error" };
    return;
  }
  try {
    const value = JSON.parse(extractJsonObject(raw)) as T;
    yield { type: "done", value };
  } catch (err) {
    log.error("llm", "JSON stream parse error", {
      err: err instanceof Error ? err.message : String(err),
      rawPreview: raw.slice(0, 200),
    });
    yield { type: "error" };
  }
}

export async function generatePersonaReply(opts: {
  persona: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  lang?: "zh" | "en";
}): Promise<string | null> {
  const langHint =
    opts.lang === "zh"
      ? "Reply in natural Chinese (简体中文). Keep it short (1-3 sentences)."
      : "Reply in natural English. Keep it short (1-3 sentences).";
  return chatCompletion([
    {
      role: "system",
      content: `${opts.persona}\n\nYou are chatting as this person on a meeting app. Be warm, specific, and human — never mention you are AI. ${langHint}`,
    },
    ...opts.history,
    { role: "user", content: opts.userMessage },
  ]);
}
