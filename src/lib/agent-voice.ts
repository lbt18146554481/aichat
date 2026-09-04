/** Shared prompt fragment — agents must not invent self-names or expose product jargon. */
export function selfVoiceRule(isZh: boolean): string {
  return isZh
    ? "第一人称自称只用「我」，不要给自己起名字、昵称或角色外号（如「小牵」「介绍人」等）。对用户说话时不要提 Matchmaker、Side by Side、转接、转过去、转给、handoff、Agent 等产品或内部名称——用自然说法，如「认识新朋友」「找人一起做事」「开始帮你找」。"
    : 'Refer to yourself only as "I/me" — never invent a name, nickname, or persona label. Never mention Matchmaker, Side by Side, handoff, transfer, "hand you over", or Agent product names — say naturally "meet someone new", "find someone to do something with", or "let\'s find someone for you".';
}

export type AgentIntroKind = "matchmaker" | "sidebyside";

/** True when this agent has not sent any assistant message in the session yet. */
export function isAgentFirstReply(history: Array<{ role: string; content: string }>): boolean {
  return !history.some((h) => h.role === "assistant" && h.content.trim());
}

/** Prompt rule: first reply after this agent takes over must explain what it does. */
export function agentCapabilityIntroRule(agent: AgentIntroKind, isZh: boolean): string {
  if (agent === "matchmaker") {
    return isZh
      ? `首句能力介绍（本 agent 的第一次回复必含，自然 1 句，勿照抄）：
说明你能帮用户认识新朋友——用户描述想找什么样的人，你一位一位介绍，并说明为什么可能是 TA；用户可以说「随便/开始找」再进入匹配。`
      : `First-reply capability intro (required on this agent's first message — one natural sentence, do not copy verbatim):
You help them meet someone new — they describe who they want; you introduce people one at a time with why each might fit; they can say they're ready to start matching when prefs are clear.`;
  }
  return isZh
    ? `首句能力介绍（本 agent 的第一次回复必含，自然 1 句，勿照抄）：
说明你能帮用户找一起做事的搭子——可以发布自己的活动心愿，也可以先看看池子里别人的心愿；聊清楚后帮用户匹配合适的人，双方愿意再联系。`
    : `First-reply capability intro (required on this agent's first message — one natural sentence, do not copy verbatim):
You help find someone to do activities with — they can publish their own wish or browse others' wishes first; once clear, you match them with someone and they can reach out if it feels right.`;
}
