// Side by Side — the agent that collects an intent, publishes it into the
// pool, and (when the pool has a compatible one) surfaces the match.
//
// The whole flow is: collect → publish → match / nomatch → chat.
// No "waiting for TA to accept". If two intents in the pool line up, that
// IS the match — the user starts talking right there.

import type { ActivityKind, Weekday } from "../types";
import {
  findMatch,
  findNearMisses,
  getIntentById,
  publishMyIntent,
  revokeMyIntent,
  seedPool,
  siblingKinds,
  slotToWhen,
  type Intent,
  type LevelTier,
  type WhenTier,
} from "../intents";

export type { LevelTier, WhenTier } from "../intents";

// ---- Parse layers (unchanged: L1/L2/L3) ---------------------------------

export type ParseLayer = "L1" | "L2" | "L3";

export interface ParseResult {
  layer: ParseLayer;
  kind?: ActivityKind;
  when?: WhenTier;
  level?: LevelTier;
  ambiguousKinds?: ActivityKind[];
  truncated?: boolean;
}

const KIND_WORDS: Record<ActivityKind, string[]> = {
  tennis: ["网球", "打网球", "tennis"],
  run: ["跑步", "夜跑", "晨跑", "慢跑", "run", "running", "jog", "jogging"],
  climb: ["攀岩", "爬岩", "抱石", "climb", "climbing", "bouldering"],
  cook: ["做饭", "下厨", "煮饭", "cook", "cooking", "bake", "baking"],
  exhibition: ["看展", "展览", "美术馆", "博物馆", "exhibit", "exhibition", "gallery", "museum"],
  bookstore: ["书店", "逛书店", "bookstore", "bookshop"],
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
function findKindHits(text: string): ActivityKind[] {
  const hits = new Set<ActivityKind>();
  for (const kind of Object.keys(KIND_WORDS) as ActivityKind[]) {
    for (const w of KIND_WORDS[kind]) {
      const i = text.indexOf(w);
      if (i >= 0 && !isNegated(text, i)) { hits.add(kind); break; }
    }
  }
  return Array.from(hits);
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
  if (!text) return { layer: "L3", truncated };
  const kinds = findKindHits(text);
  const when = findWhen(text);
  if (kinds.length === 0) return { layer: "L3", when, truncated };
  if (kinds.length > 1) return { layer: "L2", ambiguousKinds: kinds, when, truncated };
  const kind = kinds[0];
  const level = LEVEL_KINDS.includes(kind) ? findLevel(text) : undefined;
  return { layer: "L1", kind, when, level, truncated };
}

// ---- Chip actions (dispatched by the route) -----------------------------

export type ChipAction =
  | { type: "resolve_ambiguity"; kind: ActivityKind }
  | { type: "choose_fallback"; kind: ActivityKind }
  | { type: "answer_when"; value: WhenTier }
  | { type: "answer_level"; value: LevelTier | "any" }
  | { type: "start_chat" }
  | { type: "try_near_miss"; intentId: string }
  | { type: "suggest_kind"; kind: ActivityKind }
  | { type: "revoke" };

export interface SideMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  chips?: { id: string; label: string; action: ChipAction }[];
}

export interface ChatMsg { id: string; from: "me" | "them"; text: string; t: number; }

// ---- State --------------------------------------------------------------

export type Stage = "collect" | "match" | "nomatch" | "chat";

export interface Collecting {
  kind?: ActivityKind;
  when?: WhenTier;
  level?: LevelTier;
  rawText: string; // the user's original words (last submitted prompt)
}

export interface SideState {
  collecting: Collecting;
  stage: Stage;

  // parse-layer flags (only meaningful before publish)
  ambiguousKinds: ActivityKind[] | null;
  parseFailed: boolean;
  pendingAsk: "when" | "level" | null;
  askedWhen: boolean;
  askedLevel: boolean;
  truncated: boolean;

  myIntentId: string | null;
  matchIntentId: string | null;
  nearMissIds: string[];

  // for "swap" — intents we already tried and don't want to see again
  triedIntentIds: string[];

  messages: SideMsg[];    // left-side agent conversation
  chatMessages: ChatMsg[]; // right-side chat with the matched person
}

export const EMPTY: SideState = {
  collecting: { rawText: "" },
  stage: "collect",
  ambiguousKinds: null,
  parseFailed: false,
  pendingAsk: null,
  askedWhen: false,
  askedLevel: false,
  truncated: false,
  myIntentId: null,
  matchIntentId: null,
  nearMissIds: [],
  triedIntentIds: [],
  messages: [],
  chatMessages: [],
};

export type ViewKey = "prompt" | "disambiguate" | "fallback" | "ask" | "match" | "nomatch" | "chat";

export function currentView(s: SideState): ViewKey {
  if (s.stage === "chat") return "chat";
  if (s.stage === "match") return "match";
  if (s.stage === "nomatch") return "nomatch";
  if (s.parseFailed) return "fallback";
  if (s.ambiguousKinds && s.ambiguousKinds.length > 0) return "disambiguate";
  if (s.pendingAsk) return "ask";
  return "prompt";
}

export function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ---- Publish & match ----------------------------------------------------

function attemptPublish(state: SideState): SideState {
  const c = state.collecting;
  if (!c.kind) return state;

  // Ask for missing when if we haven't already
  if (!c.when && !state.askedWhen) {
    return { ...state, stage: "collect", pendingAsk: "when" };
  }
  // Ask for level on level-relevant kinds if we haven't already
  if (LEVEL_KINDS.includes(c.kind) && !c.level && !state.askedLevel) {
    return { ...state, stage: "collect", pendingAsk: "level" };
  }

  // All required slots filled → publish.
  const when: WhenTier = c.when ?? "any";
  const mine = publishMyIntent({
    kind: c.kind,
    when,
    level: c.level,
    rawText: c.rawText,
  });

  const match = findMatch(mine, { exclude: state.triedIntentIds });
  if (match) {
    return {
      ...state,
      stage: "match",
      pendingAsk: null,
      myIntentId: mine.id,
      matchIntentId: match.id,
      nearMissIds: [],
    };
  }

  const nears = findNearMisses(mine, { exclude: state.triedIntentIds });
  return {
    ...state,
    stage: "nomatch",
    pendingAsk: null,
    myIntentId: mine.id,
    matchIntentId: null,
    nearMissIds: nears.map((n) => n.id),
  };
}

// ---- Public actions -----------------------------------------------------

export function start(): SideState { return { ...EMPTY }; }

export function submitPrompt(state: SideState, text: string): SideState {
  const parsed = parseIntent(text);
  // Any new prompt resets collection state (but keeps message log & chat history? no — new prompt
  // means a fresh intent; scrub old intent references but keep chat *only if* we're not leaving a match)
  const base: SideState = {
    ...EMPTY,
    truncated: !!parsed.truncated,
    messages: state.messages,
  };

  if (parsed.layer === "L3") return { ...base, stage: "collect", parseFailed: true };
  if (parsed.layer === "L2") {
    return {
      ...base,
      stage: "collect",
      ambiguousKinds: parsed.ambiguousKinds ?? [],
      collecting: { rawText: text, when: parsed.when, level: parsed.level },
    };
  }

  const collecting: Collecting = {
    kind: parsed.kind,
    when: parsed.when,
    level: parsed.level,
    rawText: text,
  };
  return attemptPublish({ ...base, collecting });
}

export function resolveAmbiguity(state: SideState, kind: ActivityKind): SideState {
  const next: SideState = {
    ...state,
    ambiguousKinds: null,
    parseFailed: false,
    collecting: { ...state.collecting, kind },
  };
  return attemptPublish(next);
}

export function chooseFromFallback(state: SideState, kind: ActivityKind): SideState {
  return attemptPublish({
    ...EMPTY,
    messages: state.messages,
    collecting: { kind, rawText: state.collecting.rawText || "" },
  });
}

export function answerSlot(state: SideState, slot: "when" | "level", value: WhenTier | LevelTier | "any"): SideState {
  const next: SideState = { ...state, pendingAsk: null };
  if (slot === "when") {
    next.collecting = { ...state.collecting, when: value as WhenTier };
    next.askedWhen = true;
  } else {
    next.collecting = { ...state.collecting, level: value === "any" ? undefined : (value as LevelTier) };
    next.askedLevel = true;
  }
  return attemptPublish(next);
}

/** User clicked "try this other slot" from near-miss — pivot my intent to that time/level. */
export function tryNearMiss(state: SideState, intentId: string): SideState {
  const other = getIntentById(intentId);
  if (!other || !state.collecting.kind) return state;
  // Revoke old intent (if any), reset and re-publish with pivoted when/level
  if (state.myIntentId) revokeMyIntent(state.myIntentId);
  const when = slotToWhen(other.day, other.window);
  const next: SideState = {
    ...EMPTY,
    messages: state.messages,
    collecting: {
      kind: state.collecting.kind,
      when,
      level: other.level,
      rawText: state.collecting.rawText,
    },
    askedWhen: true,
    askedLevel: true,
    triedIntentIds: state.triedIntentIds,
  };
  return attemptPublish(next);
}

/** Move from match → chat. The pool records are the source; here we open a canvas chat. */
export function startChat(state: SideState): SideState {
  if (state.stage !== "match" || !state.matchIntentId) return state;
  const other = getIntentById(state.matchIntentId);
  if (!other) return state;
  const opener = buildTheirOpener(other);
  const first: ChatMsg = { id: uid(), from: "them", text: opener, t: Date.now() };
  return { ...state, stage: "chat", chatMessages: [first] };
}

/** Send a message in the right-side chat. Simulates a canned reply. */
export function sendChatMessage(state: SideState, text: string): SideState {
  if (state.stage !== "chat") return state;
  const mine: ChatMsg = { id: uid(), from: "me", text, t: Date.now() };
  return { ...state, chatMessages: [...state.chatMessages, mine] };
}

export function receiveSimulatedReply(state: SideState): SideState {
  if (state.stage !== "chat" || !state.matchIntentId) return state;
  const other = getIntentById(state.matchIntentId);
  if (!other) return state;
  const replies = [
    other.rawText_zh.startsWith("想") ? "好啊，那就那个时候？" : "Works for me — that time?",
    "Cool. I'm usually there anyway.",
    "定了。到时候见 👍",
  ];
  const pick = replies[state.chatMessages.length % replies.length];
  const reply: ChatMsg = { id: uid(), from: "them", text: pick, t: Date.now() };
  return { ...state, chatMessages: [...state.chatMessages, reply] };
}

/** Revoke my published intent and go back to the empty prompt state. */
export function revokeAndReset(state: SideState): SideState {
  if (state.myIntentId) revokeMyIntent(state.myIntentId);
  return { ...EMPTY, messages: state.messages };
}

export function restart(): SideState { return { ...EMPTY }; }

// ---- Their opener (for the seeded chat) ---------------------------------

function buildTheirOpener(other: Intent): string {
  // Use the person's own published rawText as their first message — that's
  // the "already-recorded" source the user can trust.
  return other.rawText_zh || other.rawText;
}

// ---- Persistence --------------------------------------------------------

const KEY = "kindred:sidebyside.v4";
export function load(): SideState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<SideState>) };
  } catch { return EMPTY; }
}
export function save(s: SideState) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* noop */ }
}
export function reset(): SideState {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return EMPTY;
}

export const ALL_KINDS: ActivityKind[] = ["tennis", "run", "climb", "cook", "exhibition", "bookstore"];

// Silence type-only imports for consumers that used to import these.
export type _KeepSeedFn = typeof seedPool;
export type _KeepIntent = Intent;
export type _KeepWeekday = Weekday;
export { siblingKinds, getIntentById };
