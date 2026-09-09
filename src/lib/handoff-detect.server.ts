/**
 * Mid-conversation handoff detect.
 * Sub-agents are isolated — this always returns empty.
 * Entry routing is home chips + reception orchestrator only.
 */

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

export async function detectMidConversationHandoff(
  input: DetectHandoffInput,
): Promise<DetectHandoffOutput> {
  void input;
  return emptyOutput();
}
