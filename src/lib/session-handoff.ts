import type { HandoffContext, GraftedMessage } from "./handoff";
import { emptyUnderstanding, mergeUnderstanding } from "./handoff";
import type { MatchmakerState, Message } from "./agents/matchmaker";
import { EMPTY as EMPTY_MM, uid as mmUid } from "./agents/matchmaker";
import type { SideState, SideMsg } from "./agents/side-by-side";
import { EMPTY as EMPTY_SIDE, uid as sideUid } from "./agents/side-by-side";
import { emptyWishDraft } from "./wish-types";
import { createSession, getSession, updateSession, type Session } from "./sessions";
import { saveUnderstanding } from "./understanding";
import type { UserUnderstanding } from "./understanding";

function toMmMessages(grafted: GraftedMessage[], transition?: string): Message[] {
  const msgs: Message[] = grafted.map((m, i) => ({
    id: mmUid() + String(i),
    role: m.role,
    t: m.t ?? Date.now() + i,
    text: m.content,
  }));
  if (transition?.trim()) {
    msgs.push({
      id: mmUid(),
      role: "assistant",
      t: Date.now() + msgs.length,
      text: transition.trim(),
    });
  }
  return msgs;
}

function toSideMessages(grafted: GraftedMessage[], transition?: string): SideMsg[] {
  const msgs: SideMsg[] = grafted.map((m, i) => ({
    id: sideUid() + String(i),
    role: m.role,
    t: m.t ?? Date.now() + i,
    text: m.content,
  }));
  if (transition?.trim()) {
    msgs.push({
      id: sideUid(),
      role: "assistant",
      t: Date.now() + msgs.length,
      text: transition.trim(),
    });
  }
  return msgs;
}

export function buildMatchmakerStateFromHandoff(h: HandoffContext): MatchmakerState {
  const understanding = mergeUnderstanding(emptyUnderstanding(), h.understanding);
  return {
    ...EMPTY_MM,
    understanding,
    messages: toMmMessages(h.graftedMessages, h.transitionReply),
    handoff: h,
    handoffCount: h.handoffCount,
    parentSessionId: h.parentSessionId,
  };
}

export function buildSideStateFromHandoff(h: HandoffContext): SideState {
  const wish = h.sideBySideHints?.activity || h.seed || h.summary;
  const understanding = mergeUnderstanding(emptyUnderstanding(), h.understanding);
  return {
    ...EMPTY_SIDE,
    messages: toSideMessages(h.graftedMessages, h.transitionReply),
    handoff: h,
    handoffCount: h.handoffCount,
    parentSessionId: h.parentSessionId,
    pendingWishText: wish || undefined,
    wishDraft: {
      ...emptyWishDraft(wish || ""),
      rawText: wish || "",
    },
    understanding,
  };
}

export function openMatchmakerFromHandoff(h: HandoffContext): Session {
  const state = buildMatchmakerStateFromHandoff(h);
  if (h.understanding) saveUnderstanding(state.understanding);
  return createSession("introduce", h.summary || h.seed, state);
}

export function openSideBySideFromHandoff(h: HandoffContext): Session {
  const state = buildSideStateFromHandoff(h);
  return createSession("do_something", h.summary || h.seed, state);
}

export function markSessionSuspended(sessionId: string) {
  const s = getSession(sessionId);
  if (!s) return;
  updateSession(sessionId, {
    state: { ...(s.state as object), suspended: true },
  });
}

export function graftFromMatchmaker(
  state: MatchmakerState,
  extraUser?: string,
): GraftedMessage[] {
  const msgs: GraftedMessage[] = state.messages.map((m) => ({
    role: m.role,
    content: m.text,
    t: m.t,
  }));
  if (extraUser?.trim()) msgs.push({ role: "user", content: extraUser.trim(), t: Date.now() });
  return msgs;
}

export function graftFromSide(state: SideState, extraUser?: string): GraftedMessage[] {
  const msgs: GraftedMessage[] = state.messages.map((m) => ({
    role: m.role,
    content: m.text,
    t: m.t,
  }));
  if (extraUser?.trim()) msgs.push({ role: "user", content: extraUser.trim(), t: Date.now() });
  return msgs;
}

export function understandingFromState(u: UserUnderstanding | undefined): UserUnderstanding {
  return mergeUnderstanding(emptyUnderstanding(), u);
}
