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
import { loadProfile } from "../profile";
import {
  findNearMisses,
  getIntentById,
  publishMyIntent,
  revokeMyIntent,
  seedPool,
  siblingKinds,
  updateMyIntent,
  type Intent,
  type LevelTier,
  type MatchQuality,
  type WhenTier,
} from "../intents";
import { recallWishWithRelaxation, pickNextFromRecall } from "../wish-recall";
import {
  advanceSideWishQueue,
  canRetreatSideWishQueue,
  carrierFromSideState,
  matchMetaForIntent,
  retreatSideWishQueue,
  type QueueAdvanceMode,
} from "../side-queue";
import { getSession, updateSession, deriveDoSomethingStatus } from "../sessions";
import {
  removeSaved as removeSavedGlobal,
  removeSavedForSession as removeSavedForSessionGlobal,
  saveIntent as saveIntentGlobal,
} from "../saved-intents";
import type { UserUnderstanding } from "../understanding";
import { emptyUnderstanding, mergeUnderstanding } from "../handoff";
import {
  EMPTY_WISH_HARD_FILTERS,
  emptyWishDraft,
  EMPTY_BUDDY_HARD_FILTERS,
  type WishDraft,
  type WishHardFilters,
} from "../wish-types";
import { draftAsIntent } from "../wish-draft-intent";
import type { SideTurnOutput } from "../side-llm.server";
import { isZh as langIsZh } from "../lang";
import type { WishLane } from "../wish-lane";

export type { LevelTier, WhenTier } from "../intents";

// ---- Parse --------------------------------------------------------------

export interface ParseResult {
  kind: ActivityKind;
  when?: WhenTier;
  level?: LevelTier;
  /** English city label when the user typed one explicitly (e.g. "in Tokyo").
   *  Empty when no city was mentioned — caller falls back to Profile.city. */
  city?: string;
  city_zh?: string;
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
  weekend: [
    "周末",
    "周六",
    "周日",
    "星期六",
    "星期日",
    "礼拜六",
    "礼拜日",
    "sat",
    "sun",
    "saturday",
    "sunday",
    "weekend",
  ],
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
  return text
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[,.，。;；:：!！?？、"'()[\]{}]/g, " ")
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
    for (const w of WHEN_WORDS[tier]) {
      if (text.includes(w)) {
        flags[tier] = true;
        break;
      }
    }
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
    for (const w of LEVEL_WORDS[tier]) {
      if (text.includes(w)) return tier;
    }
  }
  return undefined;
}

/** Known city labels — must line up with the seed people's cities so we
 *  don't accept a city the pool has zero coverage for. Each entry gives
 *  the English + Chinese label plus the trigger words we accept. Order
 *  matters for substring matching: longer/more-specific first. */
const CITY_DICT: Array<{ en: string; zh: string; triggers: string[] }> = [
  {
    en: "New York",
    zh: "纽约",
    triggers: ["new york", "nyc", "manhattan", "brooklyn", "布鲁克林", "纽约"],
  },
  { en: "Mexico City", zh: "墨西哥城", triggers: ["mexico city", "cdmx", "墨西哥城"] },
  { en: "Tel Aviv", zh: "特拉维夫", triggers: ["tel aviv", "特拉维夫"] },
  { en: "Buenos Aires", zh: "布宜诺斯艾利斯", triggers: ["buenos aires", "布宜诺斯艾利斯"] },
  { en: "Lisbon", zh: "里斯本", triggers: ["lisbon", "lisboa", "里斯本"] },
  { en: "Berlin", zh: "柏林", triggers: ["berlin", "柏林"] },
  { en: "Kyoto", zh: "京都", triggers: ["kyoto", "京都"] },
  { en: "Copenhagen", zh: "哥本哈根", triggers: ["copenhagen", "哥本哈根"] },
  { en: "Lagos", zh: "拉各斯", triggers: ["lagos", "拉各斯"] },
  { en: "Edinburgh", zh: "爱丁堡", triggers: ["edinburgh", "爱丁堡"] },
  { en: "Vancouver", zh: "温哥华", triggers: ["vancouver", "温哥华"] },
  { en: "Rome", zh: "罗马", triggers: ["rome", "roma", "罗马"] },
];

function findCity(text: string): { en: string; zh: string } | undefined {
  for (const c of CITY_DICT) {
    for (const w of c.triggers) {
      if (text.includes(w)) return { en: c.en, zh: c.zh };
    }
  }
  return undefined;
}

export function parseIntent(raw: string): ParseResult {
  const truncated = raw.length > MAX_INPUT_CHARS;
  const text = normalize(truncated ? raw.slice(0, MAX_INPUT_CHARS) : raw);
  const kind = findKindHit(text) ?? "other";
  const when = findWhen(text);
  const level = LEVEL_KINDS.includes(kind) ? findLevel(text) : undefined;
  const cityHit = findCity(text);
  return {
    kind,
    when,
    level,
    truncated,
    ...(cityHit ? { city: cityHit.en, city_zh: cityHit.zh } : {}),
  };
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
  | { type: "switch_to_publish" }
  | { type: "check_back" };

export interface SideMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  kind?: "handoff";
  handoffAgent?: import("../handoff").HandoffTargetAgent;
  chips?: { id: string; label: string; action: ChipAction }[];
  /** Inline "补充 / 确认" card attached to an assistant message. */
  ask?: import("@/components/agent-ask").AgentAsk;
  /** When set, the ask is treated as resolved and shown as a collapsed pill. */
  askResolvedLabel?: string;
}

export interface ChatMsg {
  id: string;
  from: "me" | "them";
  text: string;
  t: number;
  kind?: "text" | "wish_card";
  /** Referenced wish when kind is wish_card. */
  wishIntentId?: string;
}

export type Stage = "prompt" | "published" | "chat";

export interface SideState {
  stage: Stage;
  /** browse = search pool; publish = post wish; unset = not chosen yet. */
  wishLane?: WishLane;
  /** Browse lane completed at least one recall (left-side nomatch chips when empty). */
  browseSearched?: boolean;
  /** After publish, agent lightly offered to find a buddy — waiting for yes/no. */
  pendingOfferMatch?: boolean;
  myIntentId: string | null;
  matchIntentId: string | null;
  /** How closely the current match lines up with the wish. Undefined when
   *  no candidate is on screen. Drives the "CLOSE MATCH" label + reason. */
  matchQuality?: MatchQuality;
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
  /** Intent id shown as dismissable quote in the TA chat composer (first message). */
  composerWishQuoteId?: string | null;
  /** When true, the next user message in the left composer is treated as
   *  a "what kind of person do you want" answer (feeds Agent memory + skips). */
  awaitingTrait?: boolean;
  /** Pending user-supplied wish text stashed while we ask for missing profile
   *  fields (currently: city). Replayed via submitPrompt after resolution. */
  pendingWishText?: string;
  titleMilestoneDone?: boolean;
  handoff?: import("../handoff").HandoffContext;
  handoffCount?: number;
  parentSessionId?: string;
  suspended?: boolean;
  /** After detect handoff: ask user whether to revoke published wish before leaving. */
  pendingHandoff?: {
    target: "matchmaker";
    summary: string;
    transitionReply: string;
    userMessage: string;
    /** Detect was unsure — confirm before switching. */
    clarify?: boolean;
  };
  /** LLM-extracted wish draft before publish. */
  wishDraft?: WishDraft;
  hardFilters?: WishHardFilters;
  buddyHardFilters?: import("../wish-types").BuddyHardFilters;
  understanding?: UserUnderstanding;
  /** One-sentence confirm line waiting for user yes (publish). */
  pendingConfirm?: string | null;
  /** One-sentence confirm before browse search (browse lane). */
  pendingBrowseConfirm?: string | null;
  /** One-sentence confirm before first buddy match. */
  pendingMatchConfirm?: string | null;
  matchReason?: string;
  crossCityMatch?: boolean;
  /** LLM-ranked wish ids for current search / match batch. */
  rankedQueue?: string[];
  queueCursor?: number;
  queueFingerprint?: string | null;
  passedIntentIds?: string[];
  shownIntentIds?: string[];
  canvasSwapKey?: number;
  /** LLM reply suggestions for the left composer. */
  suggestions?: string[];
  /** Place validation error from the last publish attempt — shown on the canvas form. */
  publishPlaceError?: string | null;
  /** User submitted publish; waiting for server — keep right pane on published wish card. */
  publishPending?: boolean;
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
  handoffCount: 0,
  wishDraft: emptyWishDraft(),
  hardFilters: { ...EMPTY_WISH_HARD_FILTERS },
  buddyHardFilters: { ...EMPTY_BUDDY_HARD_FILTERS },
  understanding: emptyUnderstanding(),
  pendingConfirm: null,
  pendingBrowseConfirm: null,
  pendingMatchConfirm: null,
  wishLane: "unset",
  browseSearched: false,
  pendingOfferMatch: false,
  rankedQueue: [],
  queueCursor: 0,
  queueFingerprint: null,
  passedIntentIds: [],
  shownIntentIds: [],
  suggestions: [],
  publishPending: false,
};

export type ViewKey = "empty" | "match" | "nomatch" | "chat" | "publish" | "mine";

export function currentView(s: SideState): ViewKey {
  if (s.stage === "chat") return "chat";
  if (s.matchIntentId) return "match";
  if (s.pendingConfirm && !s.myIntentId && s.wishLane !== "browse") return "publish";
  if ((s.myIntentId || s.publishPending) && !s.matchIntentId) return "mine";
  if (s.wishLane === "browse" && s.browseSearched) return "nomatch";
  return "empty";
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function resolveMineForQueue(state: SideState): Intent | null {
  if (state.myIntentId) return getIntentById(state.myIntentId);
  if (state.wishDraft?.kind) {
    return draftAsIntent(state.wishDraft, {
      profile: loadProfile(),
      hardFilters: state.hardFilters ?? EMPTY_WISH_HARD_FILTERS,
    });
  }
  return null;
}

export function healSideWishQueue(state: SideState): SideState {
  if (state.matchIntentId || (state.rankedQueue?.length ?? 0) === 0) return state;
  const queue = state.rankedQueue!;
  const cursor = Math.min(state.queueCursor ?? 0, queue.length - 1);
  const id = queue[cursor] ?? queue[0]!;
  const mine = resolveMineForQueue(state);
  const meta = mine ? matchMetaForIntent(mine, id) : null;
  const shown = state.shownIntentIds ?? [];
  return {
    ...state,
    matchIntentId: id,
    queueCursor: cursor,
    shownIntentIds: shown.includes(id) ? shown : [...shown, id],
    triedIntentIds: shown.includes(id) ? state.triedIntentIds : [...(state.triedIntentIds ?? []), id],
    matchQuality: meta?.quality ?? state.matchQuality,
    crossCityMatch: meta?.crossCity ?? state.crossCityMatch,
  };
}

function applyQueueCarrier(
  state: SideState,
  carrier: ReturnType<typeof carrierFromSideState>,
  matchIntentId: string | null,
  mine: Intent | null,
): SideState {
  const meta = matchIntentId && mine ? matchMetaForIntent(mine, matchIntentId) : null;
  let triedOwnerIds = state.triedOwnerIds ?? [];
  if (matchIntentId && state.matchIntentId && matchIntentId !== state.matchIntentId) {
    const prev = getIntentById(state.matchIntentId);
    if (prev && carrier.passedIntentIds.includes(state.matchIntentId)) {
      if (!triedOwnerIds.includes(prev.ownerId)) {
        triedOwnerIds = [...triedOwnerIds, prev.ownerId];
      }
    }
  }
  return {
    ...state,
    rankedQueue: carrier.rankedQueue,
    queueCursor: carrier.queueCursor,
    passedIntentIds: carrier.passedIntentIds,
    shownIntentIds: carrier.shownIntentIds,
    triedIntentIds: carrier.shownIntentIds,
    triedOwnerIds,
    matchIntentId,
    matchQuality: meta?.quality ?? (matchIntentId ? state.matchQuality : undefined),
    crossCityMatch: meta?.crossCity ?? (matchIntentId ? state.crossCityMatch : false),
  };
}

export function advanceSideQueueSilent(
  state: SideState,
  mode: QueueAdvanceMode,
  mine: Intent | null,
): SideState {
  if ((state.rankedQueue?.length ?? 0) === 0) return state;
  const advanced = advanceSideWishQueue(carrierFromSideState(state), mode);
  const next = applyQueueCarrier(state, advanced, advanced.matchIntentId, mine);
  return {
    ...next,
    canvasSwapKey: (state.canvasSwapKey ?? 0) + 1,
  };
}

export function retreatSideQueueSilent(state: SideState, mine: Intent | null): SideState & { atStart: boolean } {
  if ((state.rankedQueue?.length ?? 0) === 0) return { ...state, atStart: true };
  const retreated = retreatSideWishQueue(carrierFromSideState(state));
  if (retreated.atStart) return { ...state, atStart: true };
  const next = applyQueueCarrier(state, retreated, retreated.matchIntentId, mine);
  return {
    ...next,
    canvasSwapKey: (state.canvasSwapKey ?? 0) + 1,
    atStart: false,
  };
}

export function canRetreatSideQueue(state: SideState): boolean {
  return canRetreatSideWishQueue(carrierFromSideState(state));
}

// ---- Core actions -------------------------------------------------------

function rematchAfterUpdate(state: SideState, intentId: string): SideState {
  const mine = getIntentById(intentId);
  if (!mine) return state;
  const recall = recallWishWithRelaxation(
    {
      mine,
      hardFilters: state.hardFilters ?? { ...EMPTY_WISH_HARD_FILTERS },
      buddyHardFilters: state.buddyHardFilters ?? { ...EMPTY_BUDDY_HARD_FILTERS },
      buddyMatchQuery: mine.buddyMatchQuery ?? state.wishDraft?.buddyMatchQuery,
      understanding: state.understanding ?? emptyUnderstanding(),
      exclude: state.triedIntentIds ?? [],
      excludeOwnerIds: state.triedOwnerIds ?? [],
      shownIds: state.triedIntentIds ?? [],
      passedIds: state.triedIntentIds ?? [],
    },
    "zh-CN",
  );
  const pick = pickNextFromRecall(recall, state.matchIntentId);
  if (pick) {
    return {
      ...state,
      stage: "published",
      matchIntentId: pick.id,
      matchQuality: pick.quality,
      nearMissIds: recall.nearMissIds,
      crossCityMatch: pick.crossCity,
    };
  }
  const nears = findNearMisses(mine, {
    exclude: state.triedIntentIds ?? [],
    excludeOwnerIds: state.triedOwnerIds ?? [],
  });
  return {
    ...state,
    stage: "published",
    matchIntentId: null,
    matchQuality: undefined,
    nearMissIds: nears.map((n) => n.id),
  };
}

export function start(): SideState {
  return { ...EMPTY };
}

export function submitPrompt(
  state: SideState,
  text: string,
  opts?: { cityOverride?: string },
): SideState {
  // Revoke any prior wish — one active wish at a time keeps the demo legible.
  if (state.myIntentId) revokeMyIntent(state.myIntentId);
  const parsed = parseIntent(text);
  // City precedence: explicit override passed in (from a one-shot Agent ask,
  // never persisted to Profile) > city mentioned inline in the text >
  // Profile.city. The route guards on there being SOME city before we run.
  const profile = loadProfile();
  const overrideCity = opts?.cityOverride?.trim();
  const cityEn = overrideCity || parsed.city || profile.city;
  const cityZh = overrideCity || parsed.city_zh || profile.city;
  const mine = publishMyIntent({
    kind: parsed.kind,
    when: parsed.when,
    level: parsed.level,
    rawText: text,
    city: cityEn,
    city_zh: cityZh,
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

/** Edit my published wish (any subset of when/level/city) and rematch.
 *  Editing shifts the candidate pool; keep the global Saved list untouched
 *  (that's a cross-wish shelf), but reset the session-scoped mirror so the
 *  card state stays consistent. Empty-string city → fall back to Profile.city. */
export function editWish(
  state: SideState,
  patch: { when?: WhenTier; level?: LevelTier; city?: string },
): SideState {
  if (!state.myIntentId) return state;
  const applied: { when?: WhenTier; level?: LevelTier; city?: string; city_zh?: string } = {};
  if (patch.when !== undefined) applied.when = patch.when;
  if (patch.level !== undefined) applied.level = patch.level;
  if (patch.city !== undefined) {
    const trimmed = patch.city.trim();
    const target = trimmed || loadProfile().city;
    applied.city = target;
    applied.city_zh = target;
  }
  updateMyIntent(state.myIntentId, applied);
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
  const triedOwners =
    other && !(state.triedOwnerIds ?? []).includes(other.ownerId)
      ? [...(state.triedOwnerIds ?? []), other.ownerId]
      : (state.triedOwnerIds ?? []);
  const next: SideState = {
    ...state,
    triedIntentIds: tried,
    triedOwnerIds: triedOwners,
    matchIntentId: null,
  };
  return rematchAfterUpdate(next, state.myIntentId);
}

/** Toggle: bookmark the currently shown match, or un-bookmark it if already saved.
 *  Writes to the GLOBAL saved-intents store so it survives session changes,
 *  chat, and page navigation. Session-scoped mirror kept for legacy readers.
 *  Does NOT advance to the next candidate — Save and See next are independent. */
export function saveCurrent(state: SideState, sessionId?: string | null): SideState {
  if (!state.myIntentId || !state.matchIntentId) return state;
  const id = state.matchIntentId;
  const currentSaved = state.savedIntentIds ?? [];
  // Truth for the toggle is in-memory state, not the global store.
  // React StrictMode double-invokes state updaters in dev; deriving from
  // localStorage would flip the save on the second run and cancel it out.
  const already = currentSaved.includes(id);
  if (already) {
    removeSavedGlobal(id); // idempotent
    return { ...state, savedIntentIds: currentSaved.filter((x) => x !== id) };
  }
  saveIntentGlobal(id, sessionId || state.myIntentId || id); // idempotent
  return { ...state, savedIntentIds: [...currentSaved, id] };
}

/** Remove from saved list and put the person back into the pool as the
 *  current candidate (if nothing else is currently shown). */
export function unsave(state: SideState, intentId: string): SideState {
  removeSavedGlobal(intentId);
  const saved = (state.savedIntentIds ?? []).filter((id) => id !== intentId);
  const target = getIntentById(intentId);
  const tried = (state.triedIntentIds ?? []).filter((id) => id !== intentId);
  const triedOwners = target
    ? (state.triedOwnerIds ?? []).filter((id) => id !== target.ownerId)
    : (state.triedOwnerIds ?? []);
  const next: SideState = {
    ...state,
    savedIntentIds: saved,
    triedIntentIds: tried,
    triedOwnerIds: triedOwners,
  };
  if (!state.myIntentId) return next;
  // If no candidate is on screen right now, surface this one immediately.
  if (!state.matchIntentId) {
    return { ...rematchAfterUpdate(next, state.myIntentId), matchIntentId: intentId };
  }
  return next;
}

/** Start chatting with a specific saved candidate. */
export function chatWithSaved(state: SideState, intentId: string, draft?: string, lang?: string): SideState {
  const target = getIntentById(intentId);
  if (!target) return state;
  const armed: SideState = { ...state, stage: "published", matchIntentId: intentId };
  return startChat(armed, draft, lang);
}

/** Pivot my published wish to a near-miss person's slot and rematch. */
export function tryNearMiss(state: SideState, intentId: string): SideState {
  const other = getIntentById(intentId);
  if (!other || !state.myIntentId) return state;
  const mineWhen: WhenTier =
    other.day === "sat" || other.day === "sun"
      ? "weekend"
      : other.window === "evening"
        ? "weeknight"
        : "any";
  updateMyIntent(state.myIntentId, { when: mineWhen, level: other.level });
  return rematchAfterUpdate(
    {
      ...state,
      triedIntentIds: [...(state.triedIntentIds ?? [])],
      triedOwnerIds: [...(state.triedOwnerIds ?? [])],
    },
    state.myIntentId,
  );
}

export function startChat(state: SideState, draft?: string, _lang?: string): SideState {
  if (!state.matchIntentId) return state;
  if (state.stage === "chat") return state;
  removeSavedGlobal(state.matchIntentId);
  const remainingSaved = (state.savedIntentIds ?? []).filter((x) => x !== state.matchIntentId);
  return {
    ...state,
    stage: "chat",
    chatMessages: [],
    composerWishQuoteId: state.matchIntentId,
    savedIntentIds: remainingSaved,
    ...(draft ? { pendingDraft: draft } : {}),
  };
}

export function sendChatMessage(
  state: SideState,
  text: string,
  opts?: { attachWishCard?: boolean; wishIntentId?: string },
): SideState {
  if (state.stage !== "chat") return state;
  const trimmed = text.trim();
  const attach = Boolean(opts?.attachWishCard && opts?.wishIntentId);
  if (!trimmed && !attach) return state;

  const msgs: ChatMsg[] = [...state.chatMessages];
  if (attach && opts?.wishIntentId) {
    msgs.push({
      id: uid(),
      from: "me",
      kind: "wish_card",
      wishIntentId: opts.wishIntentId,
      text: "",
      t: Date.now(),
    });
  }
  if (trimmed) {
    msgs.push({ id: uid(), from: "me", text: trimmed, kind: "text", t: Date.now() });
  }
  return {
    ...state,
    chatMessages: msgs,
    composerWishQuoteId: null,
  };
}

export function receiveSimulatedReply(state: SideState, lang?: string): SideState {
  if (state.stage !== "chat" || !state.matchIntentId) return state;
  const replies = langIsZh(lang)
    ? ["好啊，那就那个时候？", "我也常去那边。", "定了，到时候见。"]
    : ["Sounds good — that time works?", "Cool. I'm usually there anyway.", "It's a date. See you then."];
  const pick = replies[state.chatMessages.length % replies.length];
  const reply: ChatMsg = { id: uid(), from: "them", text: pick, t: Date.now() };
  return { ...state, chatMessages: [...state.chatMessages, reply] };
}

export function switchToPublishLane(state: SideState): SideState {
  return {
    ...state,
    wishLane: "publish",
    browseSearched: false,
    matchIntentId: null,
    matchQuality: undefined,
    matchReason: undefined,
    crossCityMatch: false,
    nearMissIds: [],
    pendingBrowseConfirm: null,
    rankedQueue: [],
    queueCursor: 0,
    queueFingerprint: null,
    passedIntentIds: [],
    shownIntentIds: [],
    suggestions: [],
    stage: state.myIntentId ? state.stage : "prompt",
  };
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
  return { ...state, stage: "published", chatMessages: [], composerWishQuoteId: null };
}

export function setAwaitingTrait(state: SideState, v: boolean): SideState {
  return { ...state, awaitingTrait: v };
}

/** Patch wish fields without rematching — caller runs LLM rematch. */
export function patchWish(
  state: SideState,
  patch: { when?: WhenTier; level?: LevelTier; city?: string },
): SideState {
  if (!state.myIntentId) return state;
  const applied: { when?: WhenTier; level?: LevelTier; city?: string; city_zh?: string } = {};
  if (patch.when !== undefined) applied.when = patch.when;
  if (patch.level !== undefined) applied.level = patch.level;
  if (patch.city !== undefined) {
    const trimmed = patch.city.trim();
    const target = trimmed || loadProfile().city;
    applied.city = target;
    applied.city_zh = target;
  }
  updateMyIntent(state.myIntentId, applied);
  return { ...state, savedIntentIds: [], matchIntentId: null, matchQuality: undefined, rankedQueue: [], queueCursor: 0, queueFingerprint: null, passedIntentIds: [], shownIntentIds: [] };
}

/** Record skip without rule-based rematch — caller runs LLM rematch. */
export function prepareSkipMatch(state: SideState): SideState {
  if (!state.matchIntentId) return state;
  const other = getIntentById(state.matchIntentId);
  const tried = (state.triedIntentIds ?? []).includes(state.matchIntentId)
    ? (state.triedIntentIds ?? [])
    : [...(state.triedIntentIds ?? []), state.matchIntentId];
  const triedOwners =
    other && !(state.triedOwnerIds ?? []).includes(other.ownerId)
      ? [...(state.triedOwnerIds ?? []), other.ownerId]
      : (state.triedOwnerIds ?? []);
  return {
    ...state,
    triedIntentIds: tried,
    triedOwnerIds: triedOwners,
    matchIntentId: null,
    matchQuality: undefined,
  };
}

export function applyMatchPreview(
  state: SideState,
  preview: import("../side-llm.server").SideMatchPreview,
): SideState {
  let next: SideState = {
    ...state,
    wishLane: preview.wishLane ?? state.wishLane,
    browseSearched: preview.browseSearched,
    pendingBrowseConfirm: preview.pendingBrowseConfirm,
    crossCityMatch: preview.crossCityMatch,
    matchReason: preview.matchReason,
    nearMissIds: preview.nearMissIds,
    rankedQueue: preview.rankedQueue ?? state.rankedQueue ?? [],
    queueCursor: preview.queueCursor ?? state.queueCursor ?? 0,
    queueFingerprint: preview.queueFingerprint ?? state.queueFingerprint ?? null,
    passedIntentIds: preview.passedIntentIds ?? state.passedIntentIds ?? [],
    shownIntentIds: preview.shownIntentIds ?? state.shownIntentIds ?? state.triedIntentIds ?? [],
  };
  if (preview.matchIntentId) {
    next = {
      ...next,
      matchIntentId: preview.matchIntentId,
      matchQuality: preview.matchQuality,
      canvasSwapKey: (state.canvasSwapKey ?? 0) + 1,
    };
  } else if (preview.recallEmpty && preview.browseSearched) {
    next = { ...next, matchIntentId: null, matchQuality: undefined };
  }
  return next;
}

export function applyTurnResult(
  state: SideState,
  userText: string | null,
  output: SideTurnOutput,
  opts?: {
    skipUser?: boolean;
    skipAssistant?: boolean;
    skipAssistant?: boolean;
    replaceLastAssistant?: boolean;
    twoPhaseStreamed?: boolean;
  },
): SideState {
  let next: SideState = {
    ...state,
    understanding: output.understanding,
    hardFilters: output.hardFilters,
    buddyHardFilters: output.buddyHardFilters,
    wishDraft: output.wishDraft,
    wishLane: output.wishLane ?? state.wishLane ?? "unset",
    browseSearched: output.browseSearched ?? state.browseSearched ?? false,
    pendingOfferMatch: output.pendingOfferMatch ?? state.pendingOfferMatch ?? false,
    pendingConfirm: output.pendingConfirm,
    pendingBrowseConfirm: output.pendingBrowseConfirm,
    pendingMatchConfirm: output.pendingMatchConfirm,
    crossCityMatch: output.crossCityMatch,
    matchReason: output.matchReason,
    nearMissIds: output.nearMissIds,
    rankedQueue: output.rankedQueue ?? state.rankedQueue ?? [],
    queueCursor: output.queueCursor ?? state.queueCursor ?? 0,
    queueFingerprint: output.queueFingerprint ?? state.queueFingerprint ?? null,
    passedIntentIds: output.passedIntentIds ?? state.passedIntentIds ?? [],
    shownIntentIds: output.shownIntentIds ?? state.shownIntentIds ?? state.triedIntentIds ?? [],
    suggestions: output.suggestions?.length
      ? output.suggestions.slice(0, 4)
      : (output.followUpReply || opts?.replaceLastAssistant) && (state.suggestions?.length ?? 0) > 0
        ? state.suggestions!.slice(0, 4)
        : [],
    publishPlaceError: output.publishPlaceError ?? null,
  };

  if (userText?.trim() && !opts?.skipUser) {
    next = {
      ...next,
      messages: [...next.messages, { id: uid(), role: "user", t: Date.now(), text: userText.trim() }],
    };
  }

  if (output.myIntentId) {
    next = {
      ...next,
      stage: "published",
      myIntentId: output.myIntentId,
      truncated: state.truncated,
    };
  }

  if (output.stage === "published") {
    next = { ...next, stage: "published" };
  }

  if (output.matchIntentId) {
    next = {
      ...next,
      matchIntentId: output.matchIntentId,
      matchQuality: output.matchQuality ?? next.matchQuality,
      triedIntentIds: output.shownIntentIds ?? next.triedIntentIds,
    };
  } else if ((output.recallEmpty || output.rankedQueue?.length === 0) && output.browseSearched) {
    next = { ...next, matchIntentId: null, matchQuality: undefined };
  } else if (output.myIntentId && output.recallEmpty) {
    next = { ...next, matchIntentId: null, matchQuality: undefined };
  }

  if (output.followUpReply) {
    const msgs = [...next.messages];
    if (opts?.twoPhaseStreamed && opts?.skipAssistant) {
      const assistantIdxs = msgs
        .map((m, i) => (m.role === "assistant" ? i : -1))
        .filter((i) => i >= 0);
      if (assistantIdxs.length >= 2) {
        const last = assistantIdxs[assistantIdxs.length - 1]!;
        const prev = assistantIdxs[assistantIdxs.length - 2]!;
        msgs[last] = { ...msgs[last], text: output.followUpReply };
        if (output.reply?.trim()) {
          msgs[prev] = { ...msgs[prev], text: output.reply };
        }
      } else if (assistantIdxs.length === 1) {
        msgs.push({
          id: uid(),
          role: "assistant",
          t: Date.now(),
          text: output.followUpReply,
        });
        if (output.reply?.trim()) {
          msgs[assistantIdxs[0]!] = { ...msgs[assistantIdxs[0]!], text: output.reply };
        }
      }
      next = { ...next, messages: msgs };
    } else if (opts?.twoPhaseStreamed) {
      const assistantIdxs = msgs
        .map((m, i) => (m.role === "assistant" ? i : -1))
        .filter((i) => i >= 0);
      if (assistantIdxs.length >= 2) {
        const last = assistantIdxs[assistantIdxs.length - 1]!;
        const prev = assistantIdxs[assistantIdxs.length - 2]!;
        msgs[last] = { ...msgs[last], text: output.followUpReply };
        msgs[prev] = { ...msgs[prev], text: output.reply };
      } else {
        msgs.push({
          id: uid(),
          role: "assistant",
          t: Date.now(),
          text: output.followUpReply,
        });
      }
      next = { ...next, messages: msgs };
    } else if (opts?.replaceLastAssistant) {
      const last = msgs.length - 1;
      if (msgs[last]?.role === "assistant") {
        msgs[last] = { ...msgs[last], text: output.reply };
      }
      msgs.push({
        id: uid(),
        role: "assistant",
        t: Date.now(),
        text: output.followUpReply,
      });
      next = { ...next, messages: msgs };
    } else if (!opts?.skipAssistant) {
      next = {
        ...next,
        messages: [
          ...next.messages,
          { id: uid(), role: "assistant", t: Date.now(), text: output.reply },
          { id: uid(), role: "assistant", t: Date.now(), text: output.followUpReply },
        ],
      };
    }
  } else if (opts?.replaceLastAssistant) {
    const msgs = [...next.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      msgs[msgs.length - 1] = { ...last, text: output.reply };
      next = { ...next, messages: msgs };
    } else {
      next = {
        ...next,
        messages: [
          ...next.messages,
          { id: uid(), role: "assistant", t: Date.now(), text: output.reply },
        ],
      };
    }
  } else if (!opts?.skipAssistant) {
    next = {
      ...next,
      messages: [
        ...next.messages,
        { id: uid(), role: "assistant", t: Date.now(), text: output.reply },
      ],
    };
  }

  return next;
}

export function patchLastAssistant(state: SideState, text: string): SideState {
  const msgs = [...state.messages];
  const last = msgs[msgs.length - 1];
  if (last?.role === "assistant") {
    msgs[msgs.length - 1] = { ...last, text };
    return { ...state, messages: msgs };
  }
  return {
    ...state,
    messages: [...state.messages, { id: uid(), role: "assistant", t: Date.now(), text }],
  };
}

export function appendUserMessage(state: SideState, userText: string): SideState {
  const t = userText.trim();
  if (!t) return state;
  return {
    ...state,
    messages: [...state.messages, { id: uid(), role: "user", t: Date.now(), text: t }],
  };
}

export function beginAssistantStream(state: SideState): SideState {
  return {
    ...state,
    messages: [...state.messages, { id: uid(), role: "assistant", t: Date.now(), text: "" }],
  };
}

export function beginStreamingTurn(state: SideState, userText: string | null): SideState {
  let next = state;
  if (userText?.trim()) next = appendUserMessage(next, userText);
  return beginAssistantStream(next);
}

/**
 * Whether mount should auto-fire the opening `start` turn.
 * History resume must not re-run — only empty sessions or handoff grafts
 * that have not yet received a reply after the handoff divider.
 */
export function sessionNeedsBootStart(state: SideState): boolean {
  if (state.myIntentId) return false;
  if (state.messages.length === 0) return true;

  const fromHandoff =
    state.handoff?.from === "orchestrator" || state.handoff?.from === "matchmaker";
  if (!fromHandoff) return false;

  const handoffIdx = state.messages.findLastIndex((m) => m.kind === "handoff");
  const afterHandoff =
    handoffIdx >= 0 ? state.messages.slice(handoffIdx + 1) : state.messages;

  return !afterHandoff.some((m) => m.role === "assistant" && m.text.trim());
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
    if (s) {
      const partial = s.state as Partial<SideState>;
      return healSideWishQueue({
        ...EMPTY,
        ...partial,
        hardFilters: { ...EMPTY_WISH_HARD_FILTERS, ...partial.hardFilters },
        buddyHardFilters: { ...EMPTY_BUDDY_HARD_FILTERS, ...partial.buddyHardFilters },
        wishDraft: partial.wishDraft ?? emptyWishDraft(),
        understanding: mergeUnderstanding(emptyUnderstanding(), partial.understanding),
        pendingConfirm: partial.pendingConfirm ?? null,
        pendingBrowseConfirm: partial.pendingBrowseConfirm ?? null,
        pendingMatchConfirm: partial.pendingMatchConfirm ?? null,
        pendingOfferMatch: partial.pendingOfferMatch ?? false,
        publishPending: partial.publishPending ?? false,
        wishLane: partial.wishLane ?? "unset",
        browseSearched: partial.browseSearched ?? false,
        rankedQueue: partial.rankedQueue ?? [],
        queueCursor: partial.queueCursor ?? 0,
        queueFingerprint: partial.queueFingerprint ?? null,
        passedIntentIds: partial.passedIntentIds ?? [],
        shownIntentIds: partial.shownIntentIds ?? partial.triedIntentIds ?? [],
      });
    }
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

export const ALL_KINDS: ActivityKind[] = [
  "tennis",
  "run",
  "climb",
  "cook",
  "exhibition",
  "bookstore",
];

// Silence type-only imports for consumers that used to import these.
export type _KeepSeedFn = typeof seedPool;
export type _KeepIntent = Intent;
export type _KeepWeekday = Weekday;
export { siblingKinds, getIntentById };
