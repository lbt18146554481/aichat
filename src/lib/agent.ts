// Tool-style search agent (pure front-end mock, no LLM call).
//
// The agent runs a single, evolving workspace that moves through four
// natural phases — Describe → Browse → Focus → Decide — without ever
// leaving the page. Every user action results in the agent saying
// something next, so the user is never stuck staring at a wall of cards.

import { extractSignals } from "./conversation";
import { getPersonById } from "./people";
import { rankProfiles } from "./resonance";

export type Role = "user" | "assistant";

export type AssistantPart =
  | { kind: "status"; key: "results_one" | "results_other" | "no_more"; count?: number }
  | { kind: "followup"; key: "narrow_hint" | "after_focus" }
  | {
      kind: "insight";
      personId: string;
      sharedSignals: string[];
    }
  | { kind: "compare_invite"; count: number }
  | { kind: "ack"; key: "ack_saved" | "ack_dismissed" | "ack_passed" };

export interface Message {
  id: string;
  role: Role;
  t: number;
  text?: string;
  parts?: AssistantPart[];
}

export interface AgentState {
  messages: Message[];
  signals: string[];           // every signal ever extracted from user input
  removedSignals: string[];    // signals the user dismissed via chip ×
  shortlistIds: string[];      // current right-canvas results
  shownIds: string[];          // exclude from re-ranking
  savedIds: string[];
  dismissedIds: string[];
  selectedId: string | null;   // who is expanded in canvas detail
  compareMode: boolean;        // canvas swaps to compare view
}

export const EMPTY_STATE: AgentState = {
  messages: [],
  signals: [],
  removedSignals: [],
  shortlistIds: [],
  shownIds: [],
  savedIds: [],
  dismissedIds: [],
  selectedId: null,
  compareMode: false,
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function activeSignals(state: AgentState): string[] {
  return state.signals.filter((s) => !state.removedSignals.includes(s));
}

// ---- Turns ---------------------------------------------------------------

export function userTurn(state: AgentState, text: string): AgentState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const message: Message = { id: uid(), role: "user", t: Date.now(), text: trimmed };
  const newSignals = extractSignals(trimmed).filter(
    (s) => !state.signals.includes(s),
  );
  return {
    ...state,
    messages: [...state.messages, message],
    signals: [...state.signals, ...newSignals],
    // If user re-mentions a removed signal, un-remove it.
    removedSignals: state.removedSignals.filter((s) => !newSignals.includes(s)),
  };
}

export function runQuery(state: AgentState): AgentState {
  const sigs = activeSignals(state);
  const matches = rankProfiles(sigs, {
    limit: 6,
    exclude: [...state.dismissedIds],
  });

  const parts: AssistantPart[] = [];
  if (matches.length === 0) {
    parts.push({ kind: "status", key: "no_more" });
  } else {
    parts.push({
      kind: "status",
      key: matches.length === 1 ? "results_one" : "results_other",
      count: matches.length,
    });
    parts.push({ kind: "followup", key: "narrow_hint" });
  }

  const assistant: Message = { id: uid(), role: "assistant", t: Date.now(), parts };
  const newIds = matches.map((m) => m.person.id);

  return {
    ...state,
    shortlistIds: newIds.length > 0 ? newIds : state.shortlistIds,
    shownIds: Array.from(new Set([...state.shownIds, ...newIds])),
    selectedId: newIds[0] ?? state.selectedId,
    messages: [...state.messages, assistant],
    compareMode: false,
  };
}

// ---- Canvas actions ------------------------------------------------------

export function actSelect(state: AgentState, id: string): AgentState {
  return { ...state, selectedId: id, compareMode: false };
}

export function actSave(state: AgentState, personId: string): AgentState {
  if (state.savedIds.includes(personId)) return state;
  const ack: Message = {
    id: uid(),
    role: "assistant",
    t: Date.now(),
    parts: [{ kind: "ack", key: "ack_saved" }],
  };
  const nextSaved = [...state.savedIds, personId];
  const messages = [...state.messages, ack];
  // After 2+ saves, the agent gently invites the user toward Decide phase.
  if (nextSaved.length === 2) {
    messages.push({
      id: uid(),
      role: "assistant",
      t: Date.now() + 1,
      parts: [{ kind: "compare_invite", count: 2 }],
    });
  }
  return { ...state, savedIds: nextSaved, messages };
}

export function actDismiss(state: AgentState, personId: string): AgentState {
  if (state.dismissedIds.includes(personId)) return state;
  const ack: Message = {
    id: uid(),
    role: "assistant",
    t: Date.now(),
    parts: [{ kind: "ack", key: "ack_passed" }],
  };
  const remainingShortlist = state.shortlistIds.filter((id) => id !== personId);
  return {
    ...state,
    dismissedIds: [...state.dismissedIds, personId],
    savedIds: state.savedIds.filter((id) => id !== personId),
    shortlistIds: remainingShortlist,
    selectedId:
      state.selectedId === personId
        ? remainingShortlist[0] ?? null
        : state.selectedId,
    messages: [...state.messages, ack],
  };
}

export function actUnsave(state: AgentState, personId: string): AgentState {
  return { ...state, savedIds: state.savedIds.filter((id) => id !== personId) };
}

// User clicks "Tell me more about X" on a tile.
// We mirror the click as a user message and let the agent respond with an
// insight: a one-line read on why this person matches the current query.
export function actTellMore(
  state: AgentState,
  personId: string,
  displayName: string,
): AgentState {
  const person = getPersonById(personId);
  if (!person) return state;

  const userMsg: Message = {
    id: uid(),
    role: "user",
    t: Date.now(),
    text: `Tell me more about ${displayName}.`,
  };

  const sharedSignals = person.signals.filter((s) =>
    activeSignals(state).includes(s),
  );

  const assistant: Message = {
    id: uid(),
    role: "assistant",
    t: Date.now() + 1,
    parts: [
      { kind: "insight", personId, sharedSignals },
      { kind: "followup", key: "after_focus" },
    ],
  };

  return {
    ...state,
    selectedId: personId,
    compareMode: false,
    messages: [...state.messages, userMsg, assistant],
  };
}

// User clicks "Find more like them" from the detail panel.
// We absorb the person's signals into the query and run a fresh search,
// excluding the people already on screen.
export function actFindSimilar(
  state: AgentState,
  personId: string,
  displayName: string,
): { state: AgentState; ranAt: number } {
  const person = getPersonById(personId);
  if (!person) return { state, ranAt: 0 };

  const userMsg: Message = {
    id: uid(),
    role: "user",
    t: Date.now(),
    text: `Show me more people like ${displayName}.`,
  };

  const mergedSignals = Array.from(new Set([...state.signals, ...person.signals]));
  const next = runQuery({
    ...state,
    signals: mergedSignals,
    messages: [...state.messages, userMsg],
  });
  return { state: next, ranAt: Date.now() };
}

// User removes a chip from the Active filters strip.
export function actRemoveSignal(state: AgentState, signal: string): AgentState {
  if (state.removedSignals.includes(signal)) return state;
  return runQuery({
    ...state,
    removedSignals: [...state.removedSignals, signal],
  });
}

export function actSetCompareMode(state: AgentState, on: boolean): AgentState {
  return { ...state, compareMode: on };
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:state.v2";
const LEGACY_KEYS = [
  "iris:conversation",
  "bloom:state",
  "muse:state",
  "kindred:state",
  "kindred:state.v0",
  "kindred:state.v1",
];

export function loadState(): AgentState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<AgentState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AgentState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function resetState(): AgentState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  return EMPTY_STATE;
}
