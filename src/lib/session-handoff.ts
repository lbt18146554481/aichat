import type { HandoffContext, GraftedMessage, HandoffTargetAgent } from "./handoff";
import { emptyUnderstanding, mergeUnderstanding } from "./handoff";
import type { MatchmakerState, Message } from "./agents/matchmaker";
import { EMPTY as EMPTY_MM, uid as mmUid } from "./agents/matchmaker";
import type { SideState, SideMsg } from "./agents/side-by-side";
import { EMPTY as EMPTY_SIDE, uid as sideUid } from "./agents/side-by-side";
import { isVagueExploreWishSeed } from "./wish-lane";
import { emptyWishDraft } from "./wish-types";
import { createSession, getSession, handoffSession, updateSession, type Session } from "./sessions";
import { deriveHandoffSeed } from "./thread-title";
import { saveUnderstanding } from "./understanding";
import type { UserUnderstanding } from "./understanding";

type HandoffChatLine = {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  kind?: "handoff";
  handoffAgent?: HandoffTargetAgent;
};

function graftToLines(grafted: GraftedMessage[], mkId: () => string): HandoffChatLine[] {
  return grafted.map((m, i) => ({
    id: mkId() + String(i),
    role: m.role,
    t: m.t ?? Date.now() + i,
    text: m.content,
  }));
}

function lastAssistantText(msgs: HandoffChatLine[]): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === "assistant" && m.kind !== "handoff" && m.text.trim()) {
      return m.text.trim();
    }
  }
  return null;
}

/** Prior chat, then a visible agent-switch marker, then optional bridge line. */
function buildHandoffMessages(
  grafted: GraftedMessage[],
  target: HandoffTargetAgent,
  transition: string | undefined,
  mkId: () => string,
): HandoffChatLine[] {
  const out = graftToLines(grafted, mkId);
  out.push({
    id: mkId(),
    role: "assistant",
    t: Date.now() + out.length,
    text: "",
    kind: "handoff",
    handoffAgent: target,
  });
  const bridge = transition?.trim();
  if (bridge && bridge !== lastAssistantText(out)) {
    out.push({
      id: mkId(),
      role: "assistant",
      t: Date.now() + out.length,
      text: bridge,
    });
  }
  return out;
}

function toMmMessages(
  grafted: GraftedMessage[],
  target: HandoffTargetAgent,
  transition?: string,
): Message[] {
  return buildHandoffMessages(grafted, target, transition, mmUid);
}

function toSideMessages(
  grafted: GraftedMessage[],
  target: HandoffTargetAgent,
  transition?: string,
): SideMsg[] {
  return buildHandoffMessages(grafted, target, transition, sideUid);
}

export function buildMatchmakerStateFromHandoff(h: HandoffContext): MatchmakerState {
  const understanding = mergeUnderstanding(emptyUnderstanding(), h.understanding);
  return {
    ...EMPTY_MM,
    understanding,
    messages: toMmMessages(h.graftedMessages, "matchmaker", h.transitionReply),
    handoff: h,
    handoffCount: h.handoffCount,
    parentSessionId: h.parentSessionId,
  };
}

export function buildSideStateFromHandoff(h: HandoffContext): SideState {
  const wish = h.sideBySideHints?.activity || h.seed || h.summary;
  const draftText = wish && !isVagueExploreWishSeed(wish) ? wish : "";
  const understanding = mergeUnderstanding(emptyUnderstanding(), h.understanding);
  return {
    ...EMPTY_SIDE,
    messages: toSideMessages(h.graftedMessages, "sidebyside", h.transitionReply),
    handoff: h,
    handoffCount: h.handoffCount,
    parentSessionId: h.parentSessionId,
    pendingWishText: wish || undefined,
    wishDraft: {
      ...emptyWishDraft(draftText),
      rawText: draftText,
    },
    understanding,
  };
}

export function openMatchmakerFromHandoff(h: HandoffContext, fromSessionId?: string): Session {
  const state = buildMatchmakerStateFromHandoff(h);
  if (h.understanding) saveUnderstanding(state.understanding);
  const seed = deriveHandoffSeed(h);
  if (fromSessionId) {
    return handoffSession(fromSessionId, "introduce", seed, state);
  }
  return createSession("introduce", seed, state);
}

export function openSideBySideFromHandoff(h: HandoffContext, fromSessionId?: string): Session {
  const state = buildSideStateFromHandoff(h);
  const seed = deriveHandoffSeed(h);
  if (fromSessionId) {
    return handoffSession(fromSessionId, "do_something", seed, state);
  }
  return createSession("do_something", seed, state);
}

export function markSessionSuspended(sessionId: string) {
  const s = getSession(sessionId);
  if (!s) return;
  updateSession(sessionId, {
    state: { ...(s.state as object), suspended: true },
  });
}

function graftFromChatLines(
  messages: { role: "user" | "assistant"; text: string; t: number; kind?: string }[],
  extraUser?: string,
): GraftedMessage[] {
  const msgs: GraftedMessage[] = messages
    .filter((m) => m.kind !== "handoff" && m.text.trim())
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text,
      t: m.t,
    }));
  if (extraUser?.trim()) msgs.push({ role: "user", content: extraUser.trim(), t: Date.now() });
  return msgs;
}

export function graftFromMatchmaker(
  state: MatchmakerState,
  extraUser?: string,
): GraftedMessage[] {
  return graftFromChatLines(state.messages, extraUser);
}

export function graftFromSide(state: SideState, extraUser?: string): GraftedMessage[] {
  return graftFromChatLines(state.messages, extraUser);
}

export function understandingFromState(u: UserUnderstanding | undefined): UserUnderstanding {
  return mergeUnderstanding(emptyUnderstanding(), u);
}
