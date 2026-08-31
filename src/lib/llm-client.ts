import { agentChatFn } from "./api/data.functions";
import type { Person } from "./types";
import type { UserUnderstanding } from "./understanding";

/** Replace the last assistant message text with an LLM polish when available. */
export async function polishAssistantText(opts: {
  fallback: string;
  system: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): Promise<string> {
  try {
    const { text } = await agentChatFn({
      data: {
        system: opts.system,
        history: opts.history,
        userMessage: opts.userMessage,
      },
    });
    if (text && text.trim()) return text.trim();
  } catch (e) {
    console.warn("[llm-client]", e);
  }
  return opts.fallback;
}

export function matchmakerSystem(lang: string, understanding: UserUnderstanding, person?: Person | null) {
  const zh = lang.startsWith("zh");
  const prefs = [
    understanding.positive.length ? `likes: ${understanding.positive.join(", ")}` : "",
    understanding.negative.length ? `dislikes: ${understanding.negative.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const personLine = person
    ? `Currently introducing: ${person.name}, ${person.age}, ${person.city}, ${person.occupation}. ${person.portrait}`
    : "No person introduced yet — clarify what they want, then introduce someone.";
  return [
    zh
      ? "你是 Maitri 的 Matchmaker Agent。语气温暖、具体、简短（2-5 句）。不要提你是 AI。帮助用户说清楚想找什么样的人，并一次介绍一个人。"
      : "You are Maitri's Matchmaker Agent. Warm, specific, concise (2-5 sentences). Never say you are AI. Help the user clarify who they want to meet, and introduce one person at a time.",
    prefs ? `Known preferences: ${prefs}` : "",
    personLine,
    zh ? "用简体中文回复。" : "Reply in English only — never use Chinese characters.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function sideBySideSystem(lang: string, context: string) {
  const zh = lang.startsWith("zh");
  return [
    zh
      ? "你是 Maitri 的 Side-by-side Agent。帮用户发布一起做事的心愿、解释匹配，并给出开场白建议。语气自然、简短。不要提你是 AI。"
      : "You are Maitri's Side-by-side Agent. Help publish activity wishes, explain matches, and draft openers. Natural and concise. Never say you are AI.",
    context,
    zh ? "用简体中文回复。" : "Reply in English only — never use Chinese characters.",
  ].join("\n");
}
