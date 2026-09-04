import { recallCandidates } from "./match-recall";
import type { MatchHardFilters } from "./match-types";
import type { Person } from "./types";
import type { UserUnderstanding } from "./understanding";
export const MATCH_QUEUE_LIMIT = 15;

export type QueueAdvanceMode = "pass" | "see";

export function matchPrefsFingerprint(
  u: UserUnderstanding,
  f: MatchHardFilters,
): string {
  return JSON.stringify({
    positive: u.positive,
    negative: u.negative,
    notes: u.notes,
    traits: u.traits ?? [],
    interests: u.interests ?? [],
    occupation: u.occupation ?? [],
    pace: u.pace ?? [],
    ageMin: f.ageMin,
    ageMax: f.ageMax,
    ageStrength: f.ageStrength ?? null,
    genders: f.genders,
    excludeGenders: f.excludeGenders,
    genderStrength: f.genderStrength ?? null,
    cities: f.cities,
    excludeCities: f.excludeCities,
    cityStrength: f.cityStrength ?? null,
    educationMin: f.educationMin,
    educationLevels: f.educationLevels,
    excludeEducationLevels: f.excludeEducationLevels,
    educationStrength: f.educationStrength ?? null,
  });
}

export function recallQueueIds(opts: {
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  pool?: Person[];
}): { ids: string[]; empty: boolean } {
  const recall = recallCandidates({ ...opts, limit: MATCH_QUEUE_LIMIT });
  return {
    ids: recall.candidates.map((c) => c.id),
    empty: recall.emptyAfterHardFilter,
  };
}

/** Keep LLM order; append any recall ids the model omitted. */
export function mergeRankedIds(ranked: string[], allowed: string[]): string[] {
  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ranked) {
    if (!allowedSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of allowed) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

function findNextIndex(
  queue: string[],
  startIndex: number,
  blocked: Set<string>,
  passed: Set<string>,
  skipPassed: boolean,
): number {
  for (let i = Math.max(0, startIndex); i < queue.length; i++) {
    const id = queue[i]!;
    if (blocked.has(id)) continue;
    if (skipPassed && passed.has(id)) continue;
    return i;
  }
  return -1;
}

export interface QueueCarrier {
  rankedQueue: string[];
  queueCursor: number;
  passedIds: string[];
  shownIds: string[];
  currentPersonId: string | null;
}

export function showPersonAtQueueIndex(
  state: QueueCarrier,
  index: number,
): { personId: string | null; cursor: number } {
  if (index < 0 || index >= state.rankedQueue.length) {
    return { personId: null, cursor: state.queueCursor };
  }
  const personId = state.rankedQueue[index]!;
  return { personId, cursor: index };
}

/** Client-side browse: pass = reject current; see = browse without rejecting. */
/** Step back in the ranked queue (review previously browsed people). */
export function retreatMatchmakerQueue(
  state: QueueCarrier,
  blockedIds: string[],
): QueueCarrier & { atStart: boolean } {
  const blocked = new Set(blockedIds);
  let cursor = state.queueCursor - 1;
  while (cursor >= 0) {
    const id = state.rankedQueue[cursor]!;
    if (blocked.has(id)) {
      cursor -= 1;
      continue;
    }
    const shownIds = state.shownIds.includes(id) ? state.shownIds : [...state.shownIds, id];
    return {
      ...state,
      queueCursor: cursor,
      currentPersonId: id,
      shownIds,
      atStart: false,
    };
  }
  return { ...state, atStart: true };
}

export function advanceMatchmakerQueue(
  state: QueueCarrier,
  mode: QueueAdvanceMode,
  blockedIds: string[],
): QueueCarrier & { exhausted: boolean } {
  const blocked = new Set(blockedIds);
  const passed = new Set(state.passedIds);
  let cursor = state.queueCursor;

  if (mode === "pass" && state.currentPersonId) {
    passed.add(state.currentPersonId);
    cursor += 1;
  } else if (mode === "see") {
    cursor += 1;
  }

  const passedArr = [...passed];
  const idx = findNextIndex(
    state.rankedQueue,
    cursor,
    blocked,
    new Set(passedArr),
    mode === "pass",
  );

  if (idx < 0) {
    return {
      ...state,
      passedIds: passedArr,
      queueCursor: cursor,
      currentPersonId: null,
      exhausted: true,
    };
  }

  const personId = state.rankedQueue[idx]!;
  const shownIds = state.shownIds.includes(personId)
    ? state.shownIds
    : [...state.shownIds, personId];

  return {
    ...state,
    passedIds: passedArr,
    queueCursor: idx,
    currentPersonId: personId,
    shownIds,
    exhausted: false,
  };
}

export function queueBrowseReply(lang: "en" | "zh-CN", mode: QueueAdvanceMode): string {
  if (lang === "zh-CN") {
    return mode === "pass" ? "好，我们看下一位。" : "再看看下一位。";
  }
  return mode === "pass" ? "Okay — here's someone else." : "Here's another person to browse.";
}

export function queueExhaustedReply(lang: "en" | "zh-CN"): string {
  return lang === "zh-CN"
    ? "按你现在的条件，我这边暂时就这些了。要不放宽一下年龄、性别、城市或学历，我们再找？"
    : "That's everyone who fits your current filters. Want to loosen age, gender, city, or education?";
}
