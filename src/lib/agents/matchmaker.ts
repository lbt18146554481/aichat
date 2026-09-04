// Matchmaker — describe who you're looking for; the Agent introduces ONE
// person at a time. Conversation is fully LLM-driven; the right pane shows
// the introduced person's Moments.

import { getPersonById } from "../people";
import { getQuestionById } from "../questions";
import type { Person, Reflection } from "../types";
import {
  loadUnderstanding,
  saveUnderstanding,
  type UserUnderstanding,
} from "../understanding";
import { getSession, updateSession, deriveIntroduceStatus } from "../sessions";
import type { MatchHardFilters } from "../match-types";
import { EMPTY_HARD_FILTERS } from "../match-types";
import {
  advanceMatchmakerQueue,
  matchPrefsFingerprint,
  queueBrowseReply,
  queueExhaustedReply,
  retreatMatchmakerQueue,
  type QueueAdvanceMode,
} from "../matchmaker-queue";

export type Phase = "clarifying" | "introducing";
export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  t: number;
  text: string;
  kind?: "handoff";
  handoffAgent?: import("../handoff").HandoffTargetAgent;
  ask?: import("@/components/agent-ask").AgentAsk;
  askResolvedLabel?: string;
}

export interface MatchmakerState {
  phase: Phase;
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  messages: Message[];
  shownIds: string[];
  passedIds: string[];
  currentPersonId: string | null;
  suggestions: string[];
  /** @deprecated legacy sessions only */
  clarifyTurns?: number;
  titleMilestoneDone?: boolean;
  handoff?: import("../handoff").HandoffContext;
  handoffCount?: number;
  /** One-sentence recap waiting for user to confirm before first match. */
  pendingMatchConfirm?: string | null;
  /** Recap waiting for user to confirm a rematch (criteria changed). */
  pendingRematchConfirm?: string | null;
  /** LLM-ranked browse order (snapshot for current prefs). */
  rankedQueue: string[];
  queueCursor: number;
  queueFingerprint: string | null;
  /** Bumped after rematch rank so the right pane crossfades. */
  canvasSwapKey?: number;
  parentSessionId?: string;
  suspended?: boolean;
}

export const EMPTY: MatchmakerState = {
  phase: "clarifying",
  understanding: { positive: [], negative: [], notes: [], traits: [], interests: [], occupation: [], pace: [] },
  hardFilters: { ...EMPTY_HARD_FILTERS },
  messages: [],
  shownIds: [],
  passedIds: [],
  currentPersonId: null,
  suggestions: [],
  handoffCount: 0,
  pendingMatchConfirm: null,
  pendingRematchConfirm: null,
  rankedQueue: [],
  queueCursor: 0,
  queueFingerprint: null,
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Text overlap (reflection / moment picking) --------------------------

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with",
  "is", "am", "are", "was", "were", "be", "been", "being", "i", "you", "he", "she",
  "it", "we", "they", "my", "your", "his", "her", "its", "our", "their", "me", "him",
  "us", "them", "this", "that", "these", "those", "do", "does", "did", "done", "have",
  "has", "had", "not", "no", "yes", "so", "if", "than", "then", "as", "by", "from",
  "up", "down", "out", "into", "about", "just", "like", "when", "where", "why", "how",
  "what", "which", "who", "我", "你", "他", "她", "它", "我们", "你们", "他们", "的",
  "了", "和", "或", "也", "在", "是", "就", "都", "会", "要", "不", "没", "有", "得",
  "着", "与", "及", "但",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[—.,;:!?'"()[\]{}…/\\]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((w) => {
    if (b.has(w)) shared++;
  });
  return shared / (a.size + b.size - shared);
}

export function pickReflectionFor(
  person: Person,
  u: UserUnderstanding,
  lang: "en" | "zh-CN" = "en",
): Reflection | null {
  if (person.reflections.length === 0) return null;
  const userText = u.notes.join(" ");
  if (!userText.trim()) return person.reflections[0];
  const ut = tokens(userText);
  let best: Reflection | null = null;
  let bestScore = -1;
  for (const r of person.reflections) {
    const text = lang === "zh-CN" ? r.answer_zh : r.answer;
    const score = jaccard(ut, tokens(text));
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best ?? person.reflections[0];
}

export function reflectionQuestionText(r: Reflection, lang: "en" | "zh-CN"): string {
  const q = getQuestionById(r.questionId);
  if (!q) return "";
  return lang === "zh-CN" ? q.text_zh : q.text;
}

export function pickBestAngle(
  person: Person,
  u: UserUnderstanding,
): Person["angles"][number] | null {
  if (person.angles.length === 0) return null;
  const pos = new Set(u.positive);
  let best = person.angles[0];
  let bestScore = -1;
  for (const a of person.angles) {
    const overlap = a.signals.filter((s) => pos.has(s)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = a;
    }
  }
  return best;
}

export function sharedSignals(person: Person, u: UserUnderstanding): string[] {
  const pos = new Set(u.positive);
  return person.signals.filter((s) => pos.has(s));
}

export function pickBestMoment(
  person: Person,
  u: UserUnderstanding,
): Person["moments"][number] | null {
  if (person.moments.length === 0) return null;
  const userText = [...u.positive, ...u.notes].join(" ");
  if (!userText.trim()) return person.moments[0];
  const ut = tokens(userText);
  let best = person.moments[0];
  let bestScore = -1;
  for (const m of person.moments) {
    const score = jaccard(ut, tokens(m.answer)) + jaccard(ut, tokens(m.answer_zh));
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export function suggestChips(state: MatchmakerState, _lang: "en" | "zh-CN"): string[] {
  return state.suggestions ?? [];
}

// ---- LLM turn application ----------------------------------------------

export interface MatchmakerTurnResult {
  reply: string;
  introducePersonId: string | null;
  passCurrentPerson: boolean;
  understanding: UserUnderstanding;
  hardFilters?: MatchHardFilters;
  suggestions?: string[];
  handoffTo?: "sidebyside" | null;
  handoffSummary?: string;
  transitionReply?: string;
  pendingMatchConfirm?: string | null;
  pendingRematchConfirm?: string | null;
  rankedQueue?: string[];
  queueCursor?: number;
  queueFingerprint?: string | null;
  queueAdvance?: QueueAdvanceMode;
  rematchRefresh?: boolean;
  passedIds?: string[];
  shownIds?: string[];
}

function pushA(s: MatchmakerState, text: string): MatchmakerState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "assistant", t: Date.now(), text }] };
}

function pushU(s: MatchmakerState, text: string): MatchmakerState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "user", t: Date.now(), text }] };
}

export function applyTurnResult(
  state: MatchmakerState,
  userText: string | null,
  output: MatchmakerTurnResult,
  opts?: { skipUser?: boolean; skipAssistant?: boolean; replaceLastAssistant?: boolean },
): MatchmakerState {
  let next = state;
  if (userText?.trim() && !opts?.skipUser) next = pushU(next, userText.trim());

  next = {
    ...next,
    understanding: output.understanding,
    hardFilters: output.hardFilters ?? next.hardFilters,
  };

  const fp = matchPrefsFingerprint(next.understanding, next.hardFilters);
  const keepQueueDuringRematch =
    Boolean(next.pendingRematchConfirm) || Boolean(output.pendingRematchConfirm);
  if (next.queueFingerprint && next.queueFingerprint !== fp && !keepQueueDuringRematch) {
    next = {
      ...next,
      rankedQueue: [],
      queueCursor: 0,
      queueFingerprint: null,
      currentPersonId: null,
    };
  }

  if (output.rankedQueue !== undefined) {
    next = {
      ...next,
      rankedQueue: output.rankedQueue,
      queueCursor: output.queueCursor ?? 0,
      queueFingerprint: output.queueFingerprint ?? fp,
    };
  }

  // Heal stale sessions where the queue was ranked but currentPersonId was dropped
  // because the people cache had not hydrated yet.
  next = healMatchmakerQueue(next);

  if (output.passedIds) {
    next = { ...next, passedIds: output.passedIds };
  }
  if (output.shownIds) {
    next = { ...next, shownIds: output.shownIds };
  }

  if (output.passCurrentPerson && next.currentPersonId) {
    const id = next.currentPersonId;
    if (!next.passedIds.includes(id)) next = { ...next, passedIds: [...next.passedIds, id] };
  }

  if (output.introducePersonId) {
    const personId = output.introducePersonId;
    next = {
      ...next,
      phase: "introducing",
      currentPersonId: personId,
      shownIds: next.shownIds.includes(personId) ? next.shownIds : [...next.shownIds, personId],
    };
    if (output.rematchRefresh) {
      next = { ...next, canvasSwapKey: (next.canvasSwapKey ?? 0) + 1 };
    }
  } else if (output.passCurrentPerson) {
    next = { ...next, currentPersonId: null, phase: "clarifying" };
  }

  if (opts?.replaceLastAssistant) {
    const msgs = [...next.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      msgs[msgs.length - 1] = { ...last, text: output.reply };
      next = { ...next, messages: msgs };
    } else {
      next = pushA(next, output.reply);
    }
  } else if (!opts?.skipAssistant) {
    next = pushA(next, output.reply);
  }

  return {
    ...next,
    suggestions: output.suggestions?.length
      ? output.suggestions.slice(0, 4)
      : opts?.replaceLastAssistant && (state.suggestions?.length ?? 0) > 0
        ? state.suggestions.slice(0, 4)
        : [],
    pendingMatchConfirm: output.pendingMatchConfirm ?? null,
    pendingRematchConfirm: output.pendingRematchConfirm ?? null,
  };
}

export function patchLastAssistant(state: MatchmakerState, text: string): MatchmakerState {
  const msgs = [...state.messages];
  const last = msgs[msgs.length - 1];
  if (last?.role === "assistant") {
    msgs[msgs.length - 1] = { ...last, text };
    return { ...state, messages: msgs };
  }
  return pushA(state, text);
}

export function appendUserMessage(state: MatchmakerState, userText: string): MatchmakerState {
  const t = userText.trim();
  if (!t) return state;
  return pushU(state, t);
}

export function beginAssistantStream(state: MatchmakerState): MatchmakerState {
  return pushA(state, "");
}

export function beginStreamingTurn(
  state: MatchmakerState,
  userText: string | null,
): MatchmakerState {
  let next = state;
  if (userText?.trim()) next = pushU(next, userText.trim());
  return pushA(next, "");
}

export function focusPerson(state: MatchmakerState, personId: string): MatchmakerState {
  const person = getPersonById(personId);
  if (!person) return state;
  return {
    ...state,
    phase: "introducing",
    currentPersonId: personId,
    shownIds: state.shownIds.includes(personId) ? state.shownIds : [...state.shownIds, personId],
  };
}

/**
 * Whether mount should auto-fire the opening `start` turn.
 * History resume must not re-run — only empty sessions or handoff grafts
 * that have not yet received a reply after the handoff divider.
 */
export function sessionNeedsBootStart(state: MatchmakerState): boolean {
  if (state.currentPersonId) return false;
  if (state.messages.length === 0) return true;

  const fromHandoff =
    state.handoff?.from === "orchestrator" || state.handoff?.from === "sidebyside";
  if (!fromHandoff) return false;

  const handoffIdx = state.messages.findLastIndex((m) => m.kind === "handoff");
  const afterHandoff =
    handoffIdx >= 0 ? state.messages.slice(handoffIdx + 1) : state.messages;

  return !afterHandoff.some((m) => m.role === "assistant" && m.text.trim());
}

export function healMatchmakerQueue(state: MatchmakerState): MatchmakerState {
  if (state.currentPersonId || state.rankedQueue.length === 0) return state;
  const cursor = Math.min(state.queueCursor ?? 0, state.rankedQueue.length - 1);
  const personId = state.rankedQueue[cursor] ?? state.rankedQueue[0]!;
  return {
    ...state,
    phase: "introducing",
    currentPersonId: personId,
    queueCursor: cursor,
    shownIds: state.shownIds.includes(personId) ? state.shownIds : [...state.shownIds, personId],
  };
}

export function load(sessionId?: string | null): MatchmakerState {
  if (typeof window === "undefined") return EMPTY;
  if (sessionId) {
    const s = getSession(sessionId);
    if (s) {
      const partial = s.state as Partial<MatchmakerState>;
      return healMatchmakerQueue({
        ...EMPTY,
        ...partial,
        hardFilters: { ...EMPTY_HARD_FILTERS, ...partial.hardFilters },
      });
    }
    return EMPTY;
  }
  return EMPTY;
}

export function save(s: MatchmakerState, sessionId?: string | null) {
  if (typeof window === "undefined") return;
  if (sessionId) {
    updateSession(sessionId, {
      state: s,
      status: deriveIntroduceStatus(s),
    });
  }
  try {
    saveUnderstanding(s.understanding);
  } catch {
    /* noop */
  }
}

export function advanceQueueInState(
  state: MatchmakerState,
  mode: QueueAdvanceMode,
  blockedIds: string[],
  lang: "en" | "zh-CN",
): MatchmakerState {
  if (state.rankedQueue.length === 0) return state;

  const advanced = advanceMatchmakerQueue(state, mode, blockedIds);
  const next: MatchmakerState = {
    ...state,
    passedIds: advanced.passedIds,
    shownIds: advanced.shownIds,
    queueCursor: advanced.queueCursor,
    currentPersonId: advanced.currentPersonId,
    phase: advanced.currentPersonId ? "introducing" : state.phase,
  };

  const reply = advanced.exhausted
    ? queueExhaustedReply(lang)
    : queueBrowseReply(lang, mode);
  return pushA(next, reply);
}

/** Advance queue without appending an assistant message (LLM already replied). */
export function advanceQueueSilent(
  state: MatchmakerState,
  mode: QueueAdvanceMode,
  blockedIds: string[],
): MatchmakerState {
  if (state.rankedQueue.length === 0) return state;

  const advanced = advanceMatchmakerQueue(state, mode, blockedIds);
  return {
    ...state,
    passedIds: advanced.passedIds,
    shownIds: advanced.shownIds,
    queueCursor: advanced.queueCursor,
    currentPersonId: advanced.currentPersonId,
    phase: advanced.currentPersonId ? "introducing" : state.phase,
    canvasSwapKey: (state.canvasSwapKey ?? 0) + 1,
  };
}

/** Step back in queue without LLM / chat side-effects. */
export function retreatQueueSilent(
  state: MatchmakerState,
  blockedIds: string[],
): MatchmakerState & { atStart: boolean } {
  if (state.rankedQueue.length === 0) return { ...state, atStart: true };

  const retreated = retreatMatchmakerQueue(state, blockedIds);
  if (retreated.atStart) return { ...state, atStart: true };

  return {
    ...state,
    queueCursor: retreated.queueCursor,
    currentPersonId: retreated.currentPersonId,
    shownIds: retreated.shownIds,
    phase: "introducing",
    canvasSwapKey: (state.canvasSwapKey ?? 0) + 1,
    atStart: false,
  };
}

export function canRetreatQueue(state: MatchmakerState, blockedIds: string[]): boolean {
  if (state.rankedQueue.length === 0 || state.queueCursor <= 0) return false;
  const blocked = new Set(blockedIds);
  for (let i = state.queueCursor - 1; i >= 0; i--) {
    if (!blocked.has(state.rankedQueue[i]!)) return true;
  }
  return false;
}

export function reset(): MatchmakerState {
  return EMPTY;
}

export const _personRef = getPersonById;
