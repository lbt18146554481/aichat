import { chatCompletionJsonStream } from "./llm.server";
import type { AgentId } from "./seed";
import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import { emptyUnderstanding } from "./handoff";
import { selfVoiceRule } from "./agent-voice";
import { profileSummaryForPrompt } from "./profile-summary";
import { log } from "./logger.server";
import { wantsActivity, wantsPerson } from "./route-intent";

export type OrchestratorLang = "en" | "zh-CN";

export interface OrchestratorHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface OrchestratorInput {
  lang: OrchestratorLang;
  userMessage: string;
  history: OrchestratorHistoryItem[];
  profile: Profile;
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

function normalizeSuggestions(raw: string[] | undefined, _lang: OrchestratorLang): string[] {
  return (raw ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 40)
    .slice(0, 4);
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
    suggestions: [],
  };
}

function buildSystem(lang: OrchestratorLang, profile: Profile): string {
  const isZh = zh(lang);
  return [
    isZh
      ? `你就是 Maitri——产品本身在和用户说话，不是前台接待、不是助理、不是某个角色。职责仍极窄：弄清用户要走哪条路，然后 handoff。语气温暖、亲切，像靠谱朋友：先接住用户当下说的话，可以多说一两句；但不要客服腔，也不要过度兴奋（少用感叹号、不用「太棒了！！」堆砌）。

「热情」与「催促」要分开：
- 可以：自然自我介绍；用 1-2 句说明你能帮什么（陪聊、认识新朋友、找人一起做事）——让用户知道能力边界。
- 不可以：催用户立刻选方向、立刻开始找、连续提问、像在推进任务清单（「你是想 A 还是 B？」「要不要现在…」）。

两条路（JSON 的 target）：
- matchmaker：认识新朋友 / 找人聊天、交友
- sidebyside：找人一起做事 / 约活动、找搭子

规则：
1) 先认真回应用户说的话。日常自称只用「我」。寒暄时：温暖回礼 + 可用资料里的称呼 + 顺带一两句说明「我是 Maitri，能陪你聊，也能在你想的时候帮你认识新朋友或找搭子」——是介绍能力，不是下指令。不要说「我是首页接待」「帮你理清方向」。
2) action=clarify：方向还不明。纯打招呼（如「你好」）→ 按规则 1 回即可；不要追问「是想认识人还是找人做事」，不要 A/B 选择题。只有用户隐约想找人、但说不清交友还是活动时，才用一句开放式邀请多说（仍不要催立刻行动）。不要问性别、年龄、兴趣、想找什么样的人、活动细节——那些交给接手后。
3) action=handoff（填 target，confidence≥0.85）一旦方向清楚，立刻转，不要在这里继续收偏好。例如：
   - 「我想认识新人」「找女生」「想交朋友」→ matchmaker
   - 「想找人一起打球」「周末约跑步」→ sidebyside
   用户已经选过方向后，再说「都行 / 好 / 随便」等，也要 handoff 到已明确的那条路。
4) reply 与 action 一致：
   - handoff → reply 留空字符串 ""
   - clarify → 不得承诺「开始帮你找」；不得追问想找什么样的人；介绍能力时句末用「不着急」「你想聊什么都行」这类收束，不要转成催办
5) handoff 时 summary：一句话带上用户已说的线索；understanding.likes/notes 可记软偏好。
6) suggestions：2-4 条用户可能接下来说的第一人称短句，根据当前对话自行生成，勿照抄固定模板。

${selfVoiceRule(true)}
例外：被问身份时可说「我是 Maitri」；仍不要自称接待/助手/介绍人等。

只输出 JSON（reply 放最前，便于流式）：
{"reply":"...","action":"handoff"|"clarify","target":"matchmaker"|"sidebyside"|null,"confidence":0-1,"summary":"一句话概括","understanding":{"notes":[],"likes":[],"dislikes":[]},"sideBySideHints":{"activity":"","when":"","area":""},"suggestions":["短句1","短句2"]}`
      : `You are Maitri itself speaking with the user — not a receptionist, assistant, or persona. Narrow job: figure out which lane they want, then handoff. Sound warm and human — not customer service, not hype ("Amazing!!").

Separate warmth from pushing:
- OK: introduce yourself; in 1-2 sentences explain what you can do (chat, help meet someone new, find company for an activity) so they know the scope.
- NOT OK: rush them to pick a lane, start matching now, rapid-fire questions, or task-checklist energy ("A or B?" "Want to start now?").

Lanes (JSON target):
- matchmaker: meet someone new / make friends
- sidebyside: find company for an activity

Rules:
1) Answer what they said. Day-to-day use only "I/me". On greetings: warm reply + their name if you have it + briefly what Maitri can do — informing, not instructing. Never "homepage receptionist" or "clarify your direction".
2) action=clarify: lane unclear. Pure hello → rule 1; no "meet someone or do something?" multiple choice. Only when they vaguely want people but lane is unclear, one open invite to say more — still no push to act. No gender/age/interest/activity details here.
3) action=handoff (target, confidence≥0.85) when lane is clear. Examples:
   - "meet someone" / "looking for a woman" → matchmaker
   - "play tennis together" → sidebyside
   After lane is clear, "sure / ok / anything" still handoffs.
4) reply must match action:
   - handoff → reply ""
   - clarify → no "let's start finding"; when explaining capabilities, close with "no rush" / "whatever you want to talk about" — don't turn into a CTA
5) On handoff, summary carries clues; understanding may hold soft prefs.
6) suggestions: 2-4 contextual first-person phrases from the conversation — no fixed templates.

${selfVoiceRule(false)}
Exception: when asked who you are, you may say "I'm Maitri"; still never call yourself a receptionist/host/assistant.

JSON only (reply first):
{"reply":"...","action":"handoff"|"clarify","target":"matchmaker"|"sidebyside"|null,"confidence":0-1,"summary":"...","understanding":{"notes":[],"likes":[],"dislikes":[]},"sideBySideHints":{"activity":"","when":"","area":""},"suggestions":["..."]}`,
    isZh
      ? "用简体中文写 reply / summary / suggestions。"
      : "Write reply, summary, and suggestions in English only — no Chinese characters.",
    profileSummaryForPrompt(profile, lang),
  ].join("\n\n");
}

/** User turns only — never scan assistant copy (home often mentions both lanes). */
function userTurnsText(input: OrchestratorInput): string {
  return [...input.history.filter((h) => h.role === "user").map((h) => h.content), input.userMessage]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * When both lanes match (e.g. 「找人一起逛公园」), activity wins — same as routeIntent().
 */
function resolveLane(
  person: boolean,
  activity: boolean,
): "matchmaker" | "sidebyside" | null {
  if (activity && !person) return "sidebyside";
  if (person && !activity) return "matchmaker";
  if (activity && person) return "sidebyside";
  return null;
}

/**
 * If user messages already pick a lane, force handoff.
 * Ambiguous (neither) → null, leave to the model.
 */
export function inferForcedTargetFromUser(
  input: OrchestratorInput,
): "matchmaker" | "sidebyside" | null {
  const last = input.userMessage.trim();
  if (!last) return null;

  const fromLast = resolveLane(wantsPerson(last), wantsActivity(last));
  if (fromLast) return fromLast;

  const all = userTurnsText(input);
  return resolveLane(wantsPerson(all), wantsActivity(all));
}

function buildSummaryFromChat(input: OrchestratorInput, parsed: LlmJson): string {
  const fromParsed = (parsed.summary ?? "").trim();
  if (fromParsed) return fromParsed;
  const parts = input.history
    .filter((h) => h.role === "user")
    .map((h) => h.content.trim())
    .filter(Boolean);
  parts.push(input.userMessage.trim());
  return parts.slice(-4).join("；") || input.userMessage.trim();
}

/** Exported for unit tests. */
export function assembleFromParsed(input: OrchestratorInput, parsed: LlmJson): OrchestratorOutput {
  const isZh = zh(input.lang);
  let confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  let action: "handoff" | "clarify" = parsed.action === "handoff" ? "handoff" : "clarify";
  let target: "matchmaker" | "sidebyside" | null =
    parsed.target === "matchmaker" || parsed.target === "sidebyside" ? parsed.target : null;

  const forced = inferForcedTargetFromUser(input);
  if (forced) {
    if (action !== "handoff" || target !== forced) {
      log.info("orchestrator", "forced lane handoff", {
        forced,
        modelAction: parsed.action,
        modelTarget: parsed.target,
        userPreview: input.userMessage.slice(0, 40),
      });
    }
    action = "handoff";
    target = forced;
    confidence = Math.max(confidence, 0.95);
  } else {
    // Model picked a lane but left action=clarify
    if (action === "clarify" && target) {
      action = "handoff";
      confidence = Math.max(confidence, 0.85);
    }
    if (action === "handoff" && !target) {
      action = "clarify";
      target = null;
    }
  }

  if (action === "clarify") target = null;

  const reply =
    (parsed.reply ?? "").trim() ||
    (action === "clarify"
      ? isZh
        ? "你好呀。我是 Maitri——能陪你慢慢聊，也能在你想的时候帮你认识新朋友，或者找个人一起做点事。不着急，你想从哪儿聊起都行。"
        : "Hey — I'm Maitri. I can chat with you, and when you're ready, help you meet someone new or find company for something. No rush — start wherever you like."
      : "");

  return {
    action,
    target,
    confidence,
    reply,
    summary: buildSummaryFromChat(input, parsed),
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
    { role: "system" as const, content: buildSystem(input.lang, input.profile) },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.userMessage },
  ];

  let parsed: LlmJson | null = null;
  for await (const ev of chatCompletionJsonStream<LlmJson>(messages, {
    temperature: 0.62,
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
