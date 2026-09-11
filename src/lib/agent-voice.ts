/** Shared prompt fragment — agents speak in first person without inventing self-names or product jargon. */
export function selfVoiceRule(isZh: boolean): string {
  return isZh
    ? "第一人称自称只用「我」，不给自己起名字、昵称或角色外号（如「小牵」「介绍人」等）。对用户说话时用自然说法，如「认识新朋友」「找人一起做事」「开始帮你找」，而不是 Matchmaker、Side by Side、转接、handoff、Agent 等产品或内部名称。"
    : 'Refer to yourself only as "I/me" — no invented name or persona label. Speak naturally ("meet someone new", "find someone to do something with") rather than Matchmaker, Side by Side, handoff, or Agent product names.';
}

/**
 * Composer suggestion chips above the input.
 * System prompts are Chinese; reply language still follows llmReplyLanguageRule.
 */
export function composerSuggestionsRule(): string {
  return `【推荐回复 suggestions】
用途：显示在输入框上方的快捷短句；用户点击后填入输入框（不自动发送），方便接着聊。
每一轮都要给 2-4 条，包括：闲聊澄清、affirmMatch 搜人/介绍之后、缺地点填卡、队列看下一位、暂时没人可介绍——不要给空数组。
写法：第一人称，像用户下一句会说的话；短（中文约 8–24 字，英文半句）；彼此意思不重复；贴合本轮（例如澄清偏好、确认开搜、刚介绍完某人后「看下一位 / 换个方向 / 再补充偏好」）。
不要系统播报口吻，不要复述你刚说的长段 reply。`;
}

/** Normalize LLM suggestions; optional fallback when model returns none. */
export function normalizeComposerSuggestions(
  raw: unknown,
  fallback: string[] = [],
): string[] {
  const list = Array.isArray(raw)
    ? raw.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 4)
    : [];
  if (list.length) return list;
  return fallback.map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

export function fallbackComposerSuggestions(
  kind: "afterIntro" | "empty" | "chat" | "place",
  lang: "en" | "zh-CN",
): string[] {
  const zh = lang === "zh-CN";
  if (kind === "afterIntro") {
    return zh
      ? ["我想看下一个人", "换个方向再找找", "我想再补充一点偏好"]
      : ["Show me the next person", "Try a different direction", "I'd like to refine who I'm looking for"];
  }
  if (kind === "empty") {
    return zh
      ? ["放宽年龄再找找", "城市也可以放宽", "换个性别条件试试"]
      : ["Loosen the age range", "I'm open to other cities", "Try different gender prefs"];
  }
  if (kind === "place") {
    return zh
      ? ["地点不限也可以", "线上也行", "就在我所在的城市"]
      : ["Any place is fine", "Online works too", "Use my city"];
  }
  return zh
    ? ["帮我随便推一个", "我想找个开朗一点的", "先从同城开始吧"]
    : ["Just introduce someone", "I'd like someone more outgoing", "Start with the same city"];
}

export type AgentIntroKind = "matchmaker" | "sidebyside";

/** True when this agent has not sent any assistant message in the session yet. */
export function isAgentFirstReply(history: Array<{ role: string; content: string }>): boolean {
  return !history.some((h) => h.role === "assistant" && h.content.trim());
}

/**
 * Soft guidance on when a brief capability hello fits.
 * Search/activity decisions live elsewhere — keep this short.
 */
export function agentCapabilityIntroRule(agent: AgentIntroKind, isZh: boolean): string {
  if (agent === "matchmaker") {
    return isZh
      ? `【寒暄】对方只是打招呼、还没说想找谁时，可以自然回一句并顺带说明你能帮 TA 认识新朋友。已说想找谁或要搜 → 跟【搜索决策】，语气跟对方对齐。`
      : `[Hello] If they're only greeting, a warm reply can briefly mention you help meet someone new. If they already said who / asked to search → follow Search decision; match their tone.`;
  }
  return isZh
    ? `【寒暄】对方只是打招呼、还没说想一起做什么时，可以自然回一句并顺带说明你能帮找搭子。已说活动或要找人 → 跟【决策】，语气跟对方对齐。`
    : `[Hello] If they're only greeting, a warm reply can briefly mention activity buddies. If they already named an activity / want to search → follow Decision; match their tone.`;
}
