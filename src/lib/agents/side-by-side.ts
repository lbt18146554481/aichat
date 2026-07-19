// Side by Side — the agent that collects a wish, publishes it into the pool,
// and surfaces the match. One flow:
//
//   user says something → parse → publish (immediately, with whatever we heard)
//        → auto-match against pool
//           ├─ hit  → stage "match" → user taps [start chat] → stage "chat"
//           └─ miss → stage "nomatch" → optional clarify chips (when/level)
//                     → user can also try a near-miss or revoke
//
// Publishing IS waiting. Publishing IS asking. There is no separate "browse"
// mode and no "waiting for TA to accept" — if both wishes are in the pool
// and compatible, that's the match.

import type { ActivityKind, Weekday } from "../types";
import {
  findMatch,
  findNearMisses,
  getIntentById,
  publishMyIntent,
  revokeMyIntent,
  seedPool,
  siblingKinds,
  updateMyIntent,
  type Intent,
  type LevelTier,
  type WhenTier,
} from "../intents";
import { getSession, updateSession, deriveDoSomethingStatus } from "../sessions";
import {
  isSaved as isSavedGlobal,
  removeSaved as removeSavedGlobal,
  removeSavedForSession as removeSavedForSessionGlobal,
  saveIntent as saveIntentGlobal,
} from "../saved-intents";

export type { LevelTier, WhenTier } from "../intents";

// ---- Parse --------------------------------------------------------------

export interface ParseResult {
  kind: ActivityKind;
  when?: WhenTier;
  level?: LevelTier;
  truncated?: boolean;
}

const KIND_WORDS: Record<ActivityKind, string[]> = {
  tennis: ["网球", "打网球", "tennis"],
  run: ["跑步", "夜跑", "晨跑", "慢跑", "run", "running", "jog", "jogging"],
  climb: ["攀岩", "爬岩", "抱石", "climb", "climbing", "bouldering"],
  cook: ["做饭", "下厨", "煮饭", "cook", "cooking", "bake", "baking"],
  exhibition: ["看展", "展览", "美术馆", "博物馆", "exhibit", "exhibition", "gallery", "museum"],
  bookstore: ["书店", "逛书店", "bookstore", "bookshop"],
  other: [],
};
const WHEN_WORDS: Record<WhenTier, string[]> = {
  weekend: ["周末", "周六", "周日", "星期六", "星期日", "礼拜六", "礼拜日", "sat", "sun", "saturday", "sunday", "weekend"],
  weeknight: ["工作日", "平时晚上", "周中", "weekday", "weeknight", "weeknights"],
  any: ["都行", "都可以", "任意", "随时", "anytime", "any time", "flexible", "whenever"],
};
const EVENING_HINTS = ["晚上", "evening", "evenings", "night"];
const LEVEL_WORDS: Record<LevelTier, string[]> = {
  beginner: ["新手", "入门", "初学", "刚学", "菜鸟", "beginner", "new", "novice"],
  intermediate: ["会打", "一般", "中级", "还行", "intermediate", "casual"],
  advanced: ["进阶", "不错", "高手", "老手", "advanced", "experienced", "serious"],
};
const NEGATION_WORDS = ["不想", "不要", "别", "don't", "dont", "do not", "no ", "not "];
const LEVEL_KINDS: ActivityKind[] = ["tennis", "climb"];
const MAX_INPUT_CHARS = 140;

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[,.，。;；:：!！?？、"'()\[\]{}]/g, " ")
    .trim();
}
function isNegated(text: string, i: number): boolean {
  const before = text.slice(Math.max(0, i - 6), i);
  return NEGATION_WORDS.some((n) => before.includes(n));
}
function findKindHit(text: string): ActivityKind | null {
  // First known kind wins — we no longer disambiguate with the user.
  for (const kind of Object.keys(KIND_WORDS) as ActivityKind[]) {
    if (kind === "other") continue;
    for (const w of KIND_WORDS[kind]) {
      const i = text.indexOf(w);
      if (i >= 0 && !isNegated(text, i)) return kind;
    }
  }
  return null;
}
function findWhen(text: string): WhenTier | undefined {
  const flags: Record<WhenTier, boolean> = { weekend: false, weeknight: false, any: false };
  for (const tier of Object.keys(WHEN_WORDS) as WhenTier[]) {
    for (const w of WHEN_WORDS[tier]) { if (text.includes(w)) { flags[tier] = true; break; } }
  }
  if (!flags.weekend && !flags.weeknight && !flags.any) {
    if (EVENING_HINTS.some((w) => text.includes(w))) flags.weeknight = true;
  }
  if (flags.any) return "any";
  if (flags.weekend && flags.weeknight) return "any";
  if (flags.weekend) return "weekend";
  if (flags.weeknight) return "weeknight";
  return undefined;
}
function findLevel(text: string): LevelTier | undefined {
  for (const tier of Object.keys(LEVEL_WORDS) as LevelTier[]) {
    for (const w of LEVEL_WORDS[tier]) { if (text.includes(w)) return tier; }
  }
  return undefined;
}

export function parseIntent(raw: string): ParseResult {
  const truncated = raw.length > MAX_INPUT_CHARS;
  const text = normalize(truncated ? raw.slice(0, MAX_INPUT_CHARS) : raw);
  const kind = findKindHit(text) ?? "other";
  const when = findWhen(text);
  const level = LEVEL_KINDS.includes(kind) ? findLevel(text) : undefined;
  return { kind, when, level, truncated };
}

// ---- Messages / state ---------------------------------------------------

export type ChipAction =
  | { type: "refine_when"; value: WhenTier }
  | { type: "refine_level"; value: LevelTier }
  | { type: "start_chat" }
  | { type: "start_chat_with_draft"; text: string }
  | { type: "use_draft"; text: string }
  | { type: "ask_about_person" }
  | { type: "ask_opener" }
  | { type: "request_new_type" }
  | { type: "try_near_miss"; intentId: string }
  | { type: "revoke" }
  | { type: "check_back" };

export interface SideMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  chips?: { id: string; label: string; action: ChipAction }[];
}

export interface ChatMsg { id: string; from: "me" | "them"; text: string; t: number; }

export type Stage = "prompt" | "published" | "chat";

export interface SideState {
  stage: Stage;
  myIntentId: string | null;
  matchIntentId: string | null;
  nearMissIds: string[];
  triedIntentIds: string[];
  /** People already skipped for this wish. See-next must change the person, not just the slot. */
  triedOwnerIds: string[];
  /** Candidates the user parked as "look again later". Session-scoped;
   *  cleared when the wish is revoked, edited, or chat starts. */
  savedIntentIds: string[];
  truncated: boolean;
  messages: SideMsg[];
  chatMessages: ChatMsg[];
  /** Text the left Agent has drafted, to be pre-filled into the right-side
   *  TA composer when it renders. Cleared once consumed. */
  pendingDraft?: string;
  /** When true, the next user message in the left composer is treated as
   *  a "what kind of person do you want" answer (feeds Agent memory + skips). */
  awaitingTrait?: boolean;
}

export const EMPTY: SideState = {
  stage: "prompt",
  myIntentId: null,
  matchIntentId: null,
  nearMissIds: [],
  triedIntentIds: [],
  triedOwnerIds: [],
  savedIntentIds: [],
  truncated: false,
  messages: [],
  chatMessages: [],
};

export type ViewKey = "empty" | "match" | "nomatch" | "chat";

export function currentView(s: SideState): ViewKey {
  if (s.stage === "chat") return "chat";
  if (s.stage === "published" && s.matchIntentId) return "match";
  if (s.stage === "published") return "nomatch";
  return "empty";
}

export function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ---- Core actions -------------------------------------------------------

function rematchAfterUpdate(state: SideState, intentId: string): SideState {
  const mine = getIntentById(intentId);
  if (!mine) return state;
  const match = findMatch(mine, {
    exclude: state.triedIntentIds ?? [],
    excludeOwnerIds: state.triedOwnerIds ?? [],
  });
  if (match) {
    return { ...state, stage: "published", matchIntentId: match.id, nearMissIds: [] };
  }
  const nears = findNearMisses(mine, {
    exclude: state.triedIntentIds ?? [],
    excludeOwnerIds: state.triedOwnerIds ?? [],
  });
  return {
    ...state,
    stage: "published",
    matchIntentId: null,
    nearMissIds: nears.map((n) => n.id),
  };
}

export function start(): SideState { return { ...EMPTY }; }

export function submitPrompt(state: SideState, text: string): SideState {
  // Revoke any prior wish — one active wish at a time keeps the demo legible.
  if (state.myIntentId) revokeMyIntent(state.myIntentId);
  const parsed = parseIntent(text);
  const mine = publishMyIntent({
    kind: parsed.kind,
    when: parsed.when,
    level: parsed.level,
    rawText: text,
  });
  const base: SideState = {
    ...EMPTY,
    truncated: !!parsed.truncated,
    messages: state.messages,
    myIntentId: mine.id,
  };
  return rematchAfterUpdate(base, mine.id);
}

export function refineWhen(state: SideState, when: WhenTier): SideState {
  if (!state.myIntentId) return state;
  updateMyIntent(state.myIntentId, { when });
  return rematchAfterUpdate(state, state.myIntentId);
}

export function refineLevel(state: SideState, level: LevelTier): SideState {
  if (!state.myIntentId) return state;
  updateMyIntent(state.myIntentId, { level });
  return rematchAfterUpdate(state, state.myIntentId);
}

/** Edit my published wish (any subset of when/level/location) and rematch.
 *  Editing shifts the candidate pool; keep the global Saved list untouched
 *  (that's a cross-wish shelf), but reset the session-scoped mirror so the
 *  card state stays consistent. */
export function editWish(
  state: SideState,
  patch: { when?: WhenTier; level?: LevelTier; location?: string },
): SideState {
  if (!state.myIntentId) return state;
  updateMyIntent(state.myIntentId, patch);
  const cleared: SideState = { ...state, savedIntentIds: [] };
  return rematchAfterUpdate(cleared, state.myIntentId);
}

/** Skip the currently shown match — add to triedIntentIds and re-run findMatch. */
export function skipMatch(state: SideState): SideState {
  if (!state.myIntentId || !state.matchIntentId) return state;
  const other = getIntentById(state.matchIntentId);
  const tried = (state.triedIntentIds ?? []).includes(state.matchIntentId)
    ? (state.triedIntentIds ?? [])
    : [...(state.triedIntentIds ?? []), state.matchIntentId];
  const triedOwners = other && !(state.triedOwnerIds ?? []).includes(other.ownerId)
    ? [...(state.triedOwnerIds ?? []), other.ownerId]
    : (state.triedOwnerIds ?? []);
  const next: SideState = { ...state, triedIntentIds: tried, triedOwnerIds: triedOwners, matchIntentId: null };
  return rematchAfterUpdate(next, state.myIntentId);
}

/** Toggle: bookmark the currently shown match, or un-bookmark it if already saved.
 *  Writes to the GLOBAL saved-intents store so it survives session changes,
 *  chat, and page navigation. Session-scoped mirror kept for legacy readers.
 *  Does NOT advance to the next candidate — Save and See next are independent. */
export function saveCurrent(state: SideState, sessionId?: string | null): SideState {
  if (!state.myIntentId || !state.matchIntentId) return state;
  const id = state.matchIntentId;
  const already = isSavedGlobal(id);
  if (already) {
    removeSavedGlobal(id);
  } else {
    // Always write globally so the Header entry lights up — sessionId is only
    // used as an optional back-link for the drawer, never a gate.
    saveIntentGlobal(id, sessionId || state.myIntentId || id);
  }
  const saved = already
    ? state.savedIntentIds.filter((x) => x !== id)
    : state.savedIntentIds.includes(id)
      ? state.savedIntentIds
      : [...state.savedIntentIds, id];
  return { ...state, savedIntentIds: saved };
}


/** Remove from saved list and put the person back into the pool as the
 *  current candidate (if nothing else is currently shown). */
export function unsave(state: SideState, intentId: string): SideState {
  removeSavedGlobal(intentId);
  const saved = state.savedIntentIds.filter((id) => id !== intentId);
  const target = getIntentById(intentId);
  const tried = (state.triedIntentIds ?? []).filter((id) => id !== intentId);
  const triedOwners = target
    ? (state.triedOwnerIds ?? []).filter((id) => id !== target.ownerId)
    : (state.triedOwnerIds ?? []);
  const next: SideState = { ...state, savedIntentIds: saved, triedIntentIds: tried, triedOwnerIds: triedOwners };
  if (!state.myIntentId) return next;
  // If no candidate is on screen right now, surface this one immediately.
  if (!state.matchIntentId) {
    return { ...rematchAfterUpdate(next, state.myIntentId), matchIntentId: intentId };
  }
  return next;
}

/** Start chatting with a specific saved candidate. */
export function chatWithSaved(state: SideState, intentId: string, draft?: string): SideState {
  const target = getIntentById(intentId);
  if (!target) return state;
  const armed: SideState = { ...state, stage: "published", matchIntentId: intentId };
  return startChat(armed, draft);
}





/** Pivot my published wish to a near-miss person's slot and rematch. */
export function tryNearMiss(state: SideState, intentId: string): SideState {
  const other = getIntentById(intentId);
  if (!other || !state.myIntentId) return state;
  const mineWhen: WhenTier =
    other.day === "sat" || other.day === "sun" ? "weekend"
    : other.window === "evening" ? "weeknight"
    : "any";
  updateMyIntent(state.myIntentId, { when: mineWhen, level: other.level });
  return rematchAfterUpdate(
    { ...state, triedIntentIds: [...state.triedIntentIds] },
    state.myIntentId,
  );
}

export function startChat(state: SideState, draft?: string): SideState {
  if (state.stage !== "published" || !state.matchIntentId) return state;
  const other = getIntentById(state.matchIntentId);
  if (!other) return state;
  const opener = other.rawText_zh || other.rawText;
  const first: ChatMsg = { id: uid(), from: "them", text: opener, t: Date.now() };
  // Starting a chat with TA removes just TA from the global saved shelf —
  // other saved candidates remain across pages/sessions.
  removeSavedGlobal(state.matchIntentId);
  const remainingSaved = state.savedIntentIds.filter((x) => x !== state.matchIntentId);
  return {
    ...state,
    stage: "chat",
    chatMessages: [first],
    savedIntentIds: remainingSaved,
    ...(draft ? { pendingDraft: draft } : {}),
  };
}

export function sendChatMessage(state: SideState, text: string): SideState {
  if (state.stage !== "chat") return state;
  const mine: ChatMsg = { id: uid(), from: "me", text, t: Date.now() };
  return { ...state, chatMessages: [...state.chatMessages, mine] };
}

export function receiveSimulatedReply(state: SideState): SideState {
  if (state.stage !== "chat" || !state.matchIntentId) return state;
  const replies = ["好啊，那就那个时候？", "Cool. I'm usually there anyway.", "定了。到时候见 👍"];
  const pick = replies[state.chatMessages.length % replies.length];
  const reply: ChatMsg = { id: uid(), from: "them", text: pick, t: Date.now() };
  return { ...state, chatMessages: [...state.chatMessages, reply] };
}

export function revokeAndReset(state: SideState, sessionId?: string | null): SideState {
  if (state.myIntentId) revokeMyIntent(state.myIntentId);
  // Withdrawing the wish clears anything the user saved under it.
  if (sessionId) removeSavedForSessionGlobal(sessionId);
  return { ...EMPTY, messages: state.messages };
}

/** Set a draft the right-side TA composer should pre-fill with. */
export function setPendingDraft(state: SideState, text: string): SideState {
  return { ...state, pendingDraft: text };
}

export function clearPendingDraft(state: SideState): SideState {
  if (!state.pendingDraft) return state;
  const { pendingDraft: _drop, ...rest } = state;
  return rest as SideState;
}

/** Return to the candidate card view without ending the wish. TA chat resets. */
export function backToCandidate(state: SideState): SideState {
  if (state.stage !== "chat") return state;
  return { ...state, stage: "published", chatMessages: [] };
}

export function setAwaitingTrait(state: SideState, v: boolean): SideState {
  return { ...state, awaitingTrait: v };
}


// ---- Persistence -------------------------------------------------------
//
// All state lives in the sessions store, keyed by sessionId. A caller
// without a sessionId gets EMPTY on load and no-op on save — the route
// (/side-by-side) redirects to "/" in that case, so this path should
// never be hit in normal use.

export function load(sessionId?: string | null): SideState {
  if (typeof window === "undefined") return EMPTY;
  if (sessionId) {
    const s = getSession(sessionId);
    if (s) return { ...EMPTY, ...(s.state as Partial<SideState>) };
  }
  return EMPTY;
}

export function save(s: SideState, sessionId?: string | null) {
  if (typeof window === "undefined") return;
  if (!sessionId) return;
  updateSession(sessionId, { state: s, status: deriveDoSomethingStatus(s) });
}

export function reset(): SideState {
  return EMPTY;
}


export const ALL_KINDS: ActivityKind[] = ["tennis", "run", "climb", "cook", "exhibition", "bookstore"];

// Silence type-only imports for consumers that used to import these.
export type _KeepSeedFn = typeof seedPool;
export type _KeepIntent = Intent;
export type _KeepWeekday = Weekday;
export { siblingKinds, getIntentById };
