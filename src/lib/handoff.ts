// Cross-agent handoff: two sessions for state, grafted chat for continuity.

import type { UserUnderstanding } from "./understanding";
import type { AgentId } from "./seed";

export type HandoffFrom = "home" | "orchestrator" | "matchmaker" | "sidebyside";

export interface GraftedMessage {
  role: "user" | "assistant";
  content: string;
  t?: number;
}

export interface SideBySideHints {
  activity?: string;
  when?: string;
  area?: string;
}

export interface HandoffContext {
  from: HandoffFrom;
  parentSessionId?: string;
  seed: string;
  summary: string;
  understanding?: UserUnderstanding;
  sideBySideHints?: SideBySideHints;
  /** Full chat to show in the child session (cross-session continuity). */
  graftedMessages: GraftedMessage[];
  /** How many agent switches already happened in this chain. */
  handoffCount: number;
  /** Transition line shown as assistant message after graft. */
  transitionReply?: string;
}

export const MAX_HANDOFF_COUNT = 2;

export function targetAgentId(target: "matchmaker" | "sidebyside"): AgentId {
  return target;
}

export function sessionAgentFromTarget(target: "matchmaker" | "sidebyside"): "introduce" | "do_something" {
  return target === "matchmaker" ? "introduce" : "do_something";
}

export function emptyUnderstanding(): UserUnderstanding {
  return { positive: [], negative: [], notes: [] };
}

export function mergeUnderstanding(
  base: UserUnderstanding | undefined,
  patch: Partial<UserUnderstanding> | undefined,
): UserUnderstanding {
  const b = base ?? emptyUnderstanding();
  if (!patch) return b;
  return {
    positive: [...new Set([...(patch.positive ?? b.positive)])].slice(0, 12),
    negative: [...new Set([...(patch.negative ?? b.negative)])].slice(0, 12),
    notes: (patch.notes ?? b.notes).slice(-6),
  };
}
