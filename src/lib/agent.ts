// Tool-style search agent (pure front-end mock, no LLM call).
//
// The agent has three observable states the UI cares about:
//   idle      → waiting for input
//   searching → showing a single-line loading row
//   results   → assistant turn finished, candidate cards rendered
//
// Each user turn pipes through `runQuery`, which returns the assistant turn
// the UI should append. There is no persona, no first-person voice — the
// agent speaks in third-person action lines ("Searching profiles…",
// "Found 2 profiles matching your description.").

import { extractSignals } from "./conversation";
import { rankProfiles } from "./resonance";

export type Role = "user" | "assistant";

export type AssistantPart =
  | { kind: "status"; key: "results_one" | "results_other" | "no_more"; count?: number }
  | { kind: "cards"; personIds: string[] }
  | { kind: "ack"; key: "ack_saved" | "ack_dismissed" };

export interface Message {
  id: string;
  role: Role;
  t: number;
  // User messages carry plain text; assistant messages carry structured parts.
  text?: string;
  parts?: AssistantPart[];
}

export interface AgentState {
  messages: Message[];
  signals: string[];           // accumulated traits across the conversation
  shownIds: string[];          // every profile id already surfaced
  savedIds: string[];          // user-saved
  dismissedIds: string[];      // user-dismissed (never re-surface)
}

export const EMPTY_STATE: AgentState = {
  messages: [],
  signals: [],
  shownIds: [],
  savedIds: [],
  dismissedIds: [],
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Core actions --------------------------------------------------------

export function userTurn(state: AgentState, text: string): AgentState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const message: Message = { id: uid(), role: "user", t: Date.now(), text: trimmed };
  const nextSignals = Array.from(new Set([...state.signals, ...extractSignals(trimmed)]));
  return { ...state, messages: [...state.messages, message], signals: nextSignals };
}

// Produce the assistant's response for the latest user turn.
// Caller is responsible for awaiting a UI delay between the user turn and
// this call (so the "Searching profiles…" indicator is visible).
export function runQuery(state: AgentState): { state: AgentState; assistant: Message } {
  const matches = rankProfiles(state.signals, {
    limit: 3,
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
    parts.push({ kind: "cards", personIds: matches.map((m) => m.person.id) });
  }

  const assistant: Message = { id: uid(), role: "assistant", t: Date.now(), parts };

  return {
    state: {
      ...state,
      shownIds: [...state.shownIds, ...matches.map((m) => m.person.id)],
      messages: [...state.messages, assistant],
    },
    assistant,
  };
}

// Save / dismiss don't produce a new search turn on their own — they just
// append a short acknowledgement to the transcript and update the index.
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
  return {
    ...state,
    dismissedIds: [...state.dismissedIds, personId],
    savedIds: state.savedIds.filter((id) => id !== personId),
    messages: [...state.messages, ack],
  };
}

export function actUnsave(state: AgentState, personId: string): AgentState {
  return { ...state, savedIds: state.savedIds.filter((id) => id !== personId) };
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:state";
const LEGACY_KEYS = ["iris:conversation", "bloom:state", "muse:state", "kindred:state.v0"];

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
