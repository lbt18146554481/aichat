/** Shared prompt fragment — agents speak in first person without inventing self-names or product jargon. */
export function selfVoiceRule(isZh: boolean): string {
  return isZh
    ? "第一人称自称只用「我」，不给自己起名字、昵称或角色外号（如「小牵」「介绍人」等）。对用户说话时用自然说法，如「认识新朋友」「找人一起做事」「开始帮你找」，而不是 Matchmaker、Side by Side、转接、handoff、Agent 等产品或内部名称。"
    : 'Refer to yourself only as "I/me" — no invented name or persona label. Speak naturally ("meet someone new", "find someone to do something with") rather than Matchmaker, Side by Side, handoff, or Agent product names.';
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
