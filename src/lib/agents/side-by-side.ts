// Side by Side — one-sentence intent → at most one clarifying tap → candidate.
//
// Two hard rules for this agent:
//  1. The user tells us what they want in their own words. We parse locally
//     (no LLM) using a three-layer strategy so any input still routes
//     somewhere useful.
//  2. We ask at most ONE follow-up (when? or level?). Ambiguity resolution
//     (multi-kind, no-kind fallback) does not count against that budget —
//     it's clarifying what was already said, not adding new info.
//
// When the user hits "say hello" we hand off to /connections and terminate.

import { PEOPLE, getPersonById } from "../people";
import type { Activity, ActivityKind, Person, Weekday } from "../types";

// ---- Domain -------------------------------------------------------------

export type WhenTier = "weekend" | "weeknight" | "any";
export type LevelTier = "beginner" | "intermediate" | "advanced";

export interface UserIntent {
  kind: ActivityKind;
  when?: WhenTier;   // undefined = user hasn't said
  level?: LevelTier; // undefined = user hasn't said / doesn't care
}

export interface Candidate {
  personId: string;
  kind: ActivityKind;
  day: Weekday;
  window: "morning" | "midday" | "evening";
  venue: string;
  venue_zh: string;
  reason: string;
  reason_zh: string;
  /** True when the person is also "waiting" on this slot — always true in our
   *  seed data, but the flag keeps the mutual-match contract explicit. */
  mutual: boolean;
}

export interface NearMiss {
  personCount: number;
  slot: { day: Weekday; window: "morning" | "midday" | "evening" };
}

/** Sibling kinds we suggest when a stated intent has no matches at all. */
const KIND_GROUPS: ActivityKind[][] = [
  ["tennis", "run", "climb"],       // active
  ["exhibition", "bookstore"],      // cultural
  ["cook"],                         // homebody (no siblings)
];
function suggestKindsFor(kind: ActivityKind): ActivityKind[] {
  const group = KIND_GROUPS.find((g) => g.includes(kind)) ?? [];
  return group.filter((k) => k !== kind);
}

// ---- Parse layers -------------------------------------------------------

export type ParseLayer = "L1" | "L2" | "L3";

export interface ParseResult {
  layer: ParseLayer;
  kind?: ActivityKind;
  when?: WhenTier;
  level?: LevelTier;
  ambiguousKinds?: ActivityKind[]; // present on L2
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

// Standalone "晚上/evening" tips towards weeknight only when no weekend cue is present.
const EVENING_HINTS = ["晚上", "evening", "evenings", "night"];

const LEVEL_WORDS: Record<LevelTier, string[]> = {
  beginner: ["新手", "入门", "初学", "刚学", "菜鸟", "beginner", "new", "novice"],
  intermediate: ["会打", "一般", "中级", "还行", "intermediate", "casual"],
  advanced: ["进阶", "不错", "高手", "老手", "advanced", "experienced", "serious"],
};

const NEGATION_WORDS = ["不想", "不要", "别", "don't", "dont", "do not", "no ", "not "];

// Only tennis and climb use level as a real matching signal in our dataset.
const LEVEL_KINDS: ActivityKind[] = ["tennis", "climb"];

// Follow-up asks trigger only when the raw candidate pool is above this.
const ASK_THRESHOLD = 2;

const MAX_INPUT_CHARS = 140;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[,.，。;；:：!！?？、"'()\[\]{}]/g, " ")
    .trim();
}

// A keyword hit is negated if a negation word appears within ~6 chars before it.
function isNegated(text: string, hitIndex: number): boolean {
  const before = text.slice(Math.max(0, hitIndex - 6), hitIndex);
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
    for (const w of WHEN_WORDS[tier]) {
      if (text.includes(w)) { flags[tier] = true; break; }
    }
  }
  // Standalone "evening" nudges to weeknight only if weekend isn't also mentioned.
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
    for (const w of LEVEL_WORDS[tier]) {
      if (text.includes(w)) return tier;
    }
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

// ---- State --------------------------------------------------------------

export type ViewKey = "prompt" | "disambiguate" | "fallback" | "ask" | "candidate" | "nearmiss";

/** Chip actions that ride inside assistant messages. Route dispatches these. */
export type ChipAction =
  | { type: "resolve_ambiguity"; kind: ActivityKind }
  | { type: "choose_fallback"; kind: ActivityKind }
  | { type: "answer_when"; value: WhenTier }
  | { type: "answer_level"; value: LevelTier | "any" }
  | { type: "try_near_miss"; slot: { day: Weekday; window: "morning" | "midday" | "evening" } }
  | { type: "suggest_kind"; kind: ActivityKind }
  | { type: "add_to_waitlist" };

export interface SideMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  chips?: { id: string; label: string; action: ChipAction }[];
}

export interface SideState {
  intent: UserIntent | null;
  ambiguousKinds: ActivityKind[] | null; // L2 disambiguation pending
  parseFailed: boolean;                  // L3 fallback pending
  pendingAsk: "when" | "level" | null;   // an ask is on screen
  askedWhen: boolean;                    // asked once — never re-asks
  askedLevel: boolean;                   // asked once — never re-asks
  truncated: boolean;                    // last input was truncated
  skipped: string[];
  candidate: Candidate | null;
  nearMisses: NearMiss[];
  suggestKinds: ActivityKind[];          // sibling kinds to offer on no-match
  poolExhausted: boolean;
  waitlistJoinedForCurrent: boolean;     // user tapped "join waitlist" for current intent
  recalledFromWaitlist: boolean;         // this intent was already in the local waitlist
  messages: SideMsg[];
}

export const EMPTY: SideState = {
  intent: null,
  ambiguousKinds: null,
  parseFailed: false,
  pendingAsk: null,
  askedWhen: false,
  askedLevel: false,
  truncated: false,
  skipped: [],
  candidate: null,
  nearMisses: [],
  suggestKinds: [],
  poolExhausted: false,
  waitlistJoinedForCurrent: false,
  recalledFromWaitlist: false,
  messages: [],
};

export function currentView(s: SideState): ViewKey {
  if (s.parseFailed) return "fallback";
  if (s.ambiguousKinds && s.ambiguousKinds.length > 0) return "disambiguate";
  if (s.pendingAsk) return "ask";
  if (!s.intent) return "prompt";
  if (s.candidate) return "candidate";
  return "nearmiss";
}

export function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ---- Matching -----------------------------------------------------------

function slotMatchesWhen(slot: { day: Weekday; window: "morning" | "midday" | "evening" }, when: WhenTier | undefined): boolean {
  if (!when || when === "any") return true;
  if (when === "weekend") return slot.day === "sat" || slot.day === "sun";
  // weeknight = mon-fri evening
  return slot.day !== "sat" && slot.day !== "sun" && slot.window === "evening";
}

function scoreLevel(actLevel: LevelTier, want: LevelTier | undefined): number {
  if (!want) return 0;
  if (actLevel === want) return 3;
  const order: LevelTier[] = ["beginner", "intermediate", "advanced"];
  const diff = Math.abs(order.indexOf(actLevel) - order.indexOf(want));
  return diff === 1 ? 1 : -2;
}

interface RankedMatch {
  person: Person;
  activity: Activity;
  slot: { day: Weekday; window: "morning" | "midday" | "evening" };
  score: number;
}

function findAllMatches(state: SideState, intent: UserIntent): RankedMatch[] {
  const out: RankedMatch[] = [];
  for (const p of PEOPLE) {
    if (state.skipped.includes(p.id)) continue;
    for (const act of p.activities) {
      if (act.kind !== intent.kind) continue;
      const slot = act.slots.find((s) => slotMatchesWhen(s, intent.when));
      if (!slot) continue;
      const score = 10 + scoreLevel(act.level, intent.level);
      out.push({ person: p, activity: act, slot, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Count of raw candidates for gating "do we need to ask?"
function poolSize(state: SideState, intent: UserIntent): number {
  let n = 0;
  for (const p of PEOPLE) {
    if (state.skipped.includes(p.id)) continue;
    for (const act of p.activities) {
      if (act.kind !== intent.kind) continue;
      if (act.slots.some((s) => slotMatchesWhen(s, intent.when))) { n += 1; break; }
    }
  }
  return n;
}

function toCandidate(person: Person, activity: Activity, slot: RankedMatch["slot"]): Candidate {
  return {
    personId: person.id,
    kind: activity.kind,
    day: slot.day,
    window: slot.window,
    venue: activity.venue,
    venue_zh: activity.venue_zh,
    reason: reasonFor(activity, "en"),
    reason_zh: reasonFor(activity, "zh-CN"),
    mutual: true,
  };
}

function reasonFor(a: Activity, lang: "en" | "zh-CN"): string {
  if (lang === "zh-CN") {
    return `TA 每周也在这个时段${kindZh(a.kind)}，常去${a.area_zh}。你们大概率会遇上，只是这次有人把这件事说开。`;
  }
  return `They ${kindEn(a.kind)} at that same slot most weeks, usually around ${a.area}. You'd probably cross paths eventually — this time someone's putting it on the table.`;
}
function kindEn(k: ActivityKind) {
  return ({ tennis: "play tennis", run: "run", climb: "climb", cook: "cook", exhibition: "hit shows", bookstore: "haunt bookstores" } as const)[k];
}
function kindZh(k: ActivityKind) {
  return ({ tennis: "打网球", run: "跑步", climb: "攀岩", cook: "做饭", exhibition: "看展", bookstore: "逛书店" } as const)[k];
}

// ---- Near-misses --------------------------------------------------------

function findNearMisses(state: SideState, intent: UserIntent): NearMiss[] {
  const key = (s: { day: Weekday; window: "morning" | "midday" | "evening" }) => `${s.day}-${s.window}`;
  const buckets = new Map<string, NearMiss>();
  for (const p of PEOPLE) {
    if (state.skipped.includes(p.id)) continue;
    for (const act of p.activities) {
      if (act.kind !== intent.kind) continue;
      for (const slot of act.slots) {
        if (slotMatchesWhen(slot, intent.when)) continue;
        const k = key(slot);
        const existing = buckets.get(k);
        if (existing) existing.personCount += 1;
        else buckets.set(k, { slot, personCount: 1 });
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.personCount - a.personCount);
}

// ---- Decide next step ---------------------------------------------------

/**
 * True if asking `slot` might actually narrow the candidate pool.
 * If every possible answer yields the same pool, the ask is noise — skip it.
 */
function askWouldHelp(state: SideState, slot: "when" | "level"): boolean {
  if (!state.intent) return false;
  const answers: (WhenTier | LevelTier)[] =
    slot === "when" ? ["weekend", "weeknight", "any"] : ["beginner", "intermediate", "advanced"];
  const sizes = new Set<number>();
  for (const a of answers) {
    const probeIntent: UserIntent = { ...state.intent };
    if (slot === "when") probeIntent.when = a as WhenTier;
    else probeIntent.level = a as LevelTier;
    sizes.add(findAllMatches({ ...state, intent: probeIntent }, probeIntent).length);
  }
  return sizes.size > 1;
}

function decide(state: SideState): SideState {
  // Fallback / disambiguation take precedence and are decided upstream.
  if (state.parseFailed || (state.ambiguousKinds && state.ambiguousKinds.length > 0)) {
    return { ...state, candidate: null, nearMisses: [], suggestKinds: [], poolExhausted: false, pendingAsk: null };
  }
  if (!state.intent) {
    return { ...state, candidate: null, nearMisses: [], suggestKinds: [], poolExhausted: false, pendingAsk: null };
  }

  // Gate: do we need a clarifying tap? Up to two, one for when, one for level.
  if (!state.pendingAsk) {
    const size = poolSize(state, state.intent);
    if (size > ASK_THRESHOLD) {
      if (!state.askedWhen && !state.intent.when && askWouldHelp(state, "when")) {
        return { ...state, pendingAsk: "when", candidate: null, nearMisses: [], suggestKinds: [] };
      }
      if (
        !state.askedLevel &&
        LEVEL_KINDS.includes(state.intent.kind) &&
        !state.intent.level &&
        askWouldHelp(state, "level")
      ) {
        return { ...state, pendingAsk: "level", candidate: null, nearMisses: [], suggestKinds: [] };
      }
    }
  }

  const matches = findAllMatches(state, state.intent);
  if (matches.length === 0) {
    const totalForKind = poolSize({ ...state, skipped: [] }, state.intent);
    const exhausted = totalForKind > 0 && state.skipped.length >= totalForKind;
    return {
      ...state,
      candidate: null,
      nearMisses: findNearMisses(state, state.intent),
      suggestKinds: suggestKindsFor(state.intent.kind),
      poolExhausted: exhausted,
      pendingAsk: null,
    };
  }
  const m = matches[0];
  return {
    ...state,
    candidate: toCandidate(m.person, m.activity, m.slot),
    nearMisses: [],
    suggestKinds: [],
    poolExhausted: false,
    pendingAsk: null,
  };
}

// ---- Public API ---------------------------------------------------------

export function start(): SideState { return { ...EMPTY }; }

export function submitPrompt(state: SideState, text: string): SideState {
  const parsed = parseIntent(text);
  // Any new prompt resets skipped/candidate — but keep chat history.
  const base: SideState = {
    ...EMPTY,
    truncated: !!parsed.truncated,
    messages: state.messages,
  };
  if (parsed.layer === "L3") {
    return { ...base, parseFailed: true };
  }
  if (parsed.layer === "L2") {
    return { ...base, ambiguousKinds: parsed.ambiguousKinds ?? [], intent: parsed.when || parsed.level ? { kind: (parsed.ambiguousKinds ?? [])[0], when: parsed.when, level: parsed.level } : null };
    // NOTE: intent is scratch — resolveAmbiguity overwrites kind. Keeping when/level so we don't lose the tier the user already said.
  }
  const intent: UserIntent = { kind: parsed.kind!, when: parsed.when, level: parsed.level };
  return decide({ ...base, intent });
}

export function resolveAmbiguity(state: SideState, kind: ActivityKind): SideState {
  // Carry over any when/level we already parsed from the original sentence.
  const carry = state.intent ?? { kind } as UserIntent;
  const intent: UserIntent = { kind, when: carry.when, level: carry.level };
  return decide({ ...state, intent, ambiguousKinds: null, parseFailed: false });
}

export function chooseFromFallback(state: SideState, kind: ActivityKind): SideState {
  const intent: UserIntent = { kind };
  return decide({ ...EMPTY, intent, messages: state.messages });
}

export function answerSlot(state: SideState, slot: "when" | "level", value: WhenTier | LevelTier | "any"): SideState {
  if (!state.intent) return state;
  const nextIntent: UserIntent = { ...state.intent };
  if (slot === "when") {
    nextIntent.when = value as WhenTier;
  } else {
    nextIntent.level = value === "any" ? undefined : (value as LevelTier);
  }
  const nextState: SideState = {
    ...state,
    intent: nextIntent,
    pendingAsk: null,
    askedWhen: slot === "when" ? true : state.askedWhen,
    askedLevel: slot === "level" ? true : state.askedLevel,
  };
  return decide(nextState);
}

export function swap(state: SideState): SideState {
  if (!state.candidate || !state.intent) return state;
  return decide({ ...state, skipped: [...state.skipped, state.candidate.personId], candidate: null });
}

// Return to the prompt view, keeping nothing (chat cleared too).
export function restart(): SideState { return { ...EMPTY }; }

// Try a specific near-miss slot: reuse the current kind but shift `when` to
// match the suggested slot.
export function tryNearMiss(state: SideState, slot: { day: Weekday; window: "morning" | "midday" | "evening" }): SideState {
  if (!state.intent) return state;
  const tier: WhenTier = (slot.day === "sat" || slot.day === "sun")
    ? "weekend"
    : (slot.window === "evening" ? "weeknight" : "any");
  const intent: UserIntent = { ...state.intent, when: tier };
  return decide({ ...EMPTY, intent, messages: state.messages });
}


// The opener text used to seed the connections thread.
export function makeOpener(candidate: Candidate, intent: UserIntent, lang: "en" | "zh-CN"): string {
  const kindZhMap: Record<ActivityKind, string> = {
    tennis: "打网球", run: "跑步", climb: "攀岩", cook: "做饭", exhibition: "看展", bookstore: "逛书店",
  };
  const kindEnMap: Record<ActivityKind, string> = {
    tennis: "play tennis", run: "go running", climb: "climb", cook: "cook", exhibition: "hit exhibitions", bookstore: "hang around bookstores",
  };
  const dayZh = { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" }[candidate.day];
  const dayEn = { mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays", sun: "Sundays" }[candidate.day];
  const winZh = { morning: "上午", midday: "中午", evening: "晚上" }[candidate.window];
  const winEn = { morning: "morning", midday: "midday", evening: "evening" }[candidate.window];
  if (lang === "zh-CN") {
    return `看到你也在${dayZh}${winZh}${kindZhMap[intent.kind]}——我常在${candidate.venue_zh}。要不要一起？`;
  }
  return `Saw you also ${kindEnMap[intent.kind]} on ${dayEn} ${winEn}s — I'm often at ${candidate.venue}. Want to go together?`;
}

// ---- Persistence --------------------------------------------------------

const KEY = "kindred:sidebyside.v3";
export function load(): SideState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SideState>;
    const base: SideState = { ...EMPTY, ...parsed };
    return base.intent ? decide(base) : base;
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

// Silence unused import warning.
export type _KeepPeopleFn = typeof getPersonById;
