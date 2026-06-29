// Tool-style search agent (pure front-end mock, no LLM call).
//
// The agent maintains a workspace:
//   - chat transcript on the left (user msgs + agent action lines)
//   - canvas state on the right (shortlist + selected candidate)
//
// Each user turn calls `runQuery`, which replaces the current shortlist
// with the new ranked results and auto-selects the top one. Cards are
// rendered from `shortlistIds`, NOT from message parts.

import { extractSignals } from "./conversation";
import { rankProfiles } from "./resonance";

export type Role = "user" | "assistant";

export type AssistantPart =
  | { kind: "status"; key: "results_one" | "results_other" | "no_more"; count?: number }
  | { kind: "ack"; key: "ack_saved" | "ack_dismissed" };

export interface Message {
  id: string;
  role: Role;
  t: number;
  text?: string;
  parts?: AssistantPart[];
}

export interface AgentState {
  messages: Message[];
  signals: string[];
  shortlistIds: string[];      // current right-canvas results
  shownIds: string[];          // history (excluded from re-ranking)
  savedIds: string[];
  dismissedIds: string[];
  selectedId: string | null;   // who's expanded in canvas detail
}

export const EMPTY_STATE: AgentState = {
  messages: [],
  signals: [],
  shortlistIds: [],
  shownIds: [],
  savedIds: [],
  dismissedIds: [],
  selectedId: null,
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function userTurn(state: AgentState, text: string): AgentState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const message: Message = { id: uid(), role: "user", t: Date.now(), text: trimmed };
  const nextSignals = Array.from(new Set([...state.signals, ...extractSignals(trimmed)]));
  return { ...state, messages: [...state.messages, message], signals: nextSignals };
}

export function runQuery(state: AgentState): { state: AgentState; assistant: Message } {
  const matches = rankProfiles(state.signals, {
    limit: 6,
    exclude: [...state.shownIds, ...state.dismissedIds],
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
  }

  const assistant: Message = { id: uid(), role: "assistant", t: Date.now(), parts };
  const newIds = matches.map((m) => m.person.id);

  return {
    state: {
      ...state,
      shortlistIds: newIds.length > 0 ? newIds : state.shortlistIds,
      shownIds: [...state.shownIds, ...newIds],
      selectedId: newIds[0] ?? state.selectedId,
      messages: [...state.messages, assistant],
    },
    assistant,
  };
}

export function actSelect(state: AgentState, id: string): AgentState {
  return { ...state, selectedId: id };
}

export function actSave(state: AgentState, personId: string): AgentState {
  if (state.savedIds.includes(personId)) return state;
  const ack: Message = {
    id: uid(),
    role: "assistant",
    t: Date.now(),
    parts: [{ kind: "ack", key: "ack_saved" }],
  };
  return {
    ...state,
    savedIds: [...state.savedIds, personId],
    messages: [...state.messages, ack],
  };
}

export function actDismiss(state: AgentState, personId: string): AgentState {
  if (state.dismissedIds.includes(personId)) return state;
  const ack: Message = {
    id: uid(),
    role: "assistant",
    t: Date.now(),
    parts: [{ kind: "ack", key: "ack_dismissed" }],
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

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:state.v1";
const LEGACY_KEYS = [
  "iris:conversation",
  "bloom:state",
  "muse:state",
  "kindred:state",
  "kindred:state.v0",
];

export function loadState(): AgentState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as AgentState;
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
