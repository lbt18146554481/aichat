/**
 * Side-by-side people recall: personFit (Matchmaker softScore) + activityFit
 * (activity query vs person profileText), 50/50 after per-batch min-max norm.
 */

import type { Person } from "./types";
import type { MatchHardFilters, RecallOpts } from "./match-types";
import type { UserUnderstanding } from "./understanding";
import type { WishDraft } from "./wish-types";
import type { Profile } from "./profile-shape";
import { buildPreferenceQuery } from "./person-facets";
import { semanticSimilarity } from "./text-similarity";
import { softScore, personPassesHardFilters } from "./match-recall";
import { activityCoreFromKind, kindFromActivityCore } from "./activity-core";
import { EMPTY_HARD_FILTERS } from "./match-types";

export const SIDE_RECALL_LIMIT = 10;
/** Half day in ms — hanging invite rematch interval. */
export const SIDE_HANG_REMATCH_MS = 12 * 60 * 60 * 1000;

export interface SidePeopleRecallOpts {
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  wishDraft: WishDraft;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  pool: Person[];
  seekerProfile?: Profile | null;
  limit?: number;
}

export interface SidePeopleCandidate {
  id: string;
  personScore: number;
  activityScore: number;
  total: number;
}

export interface SidePeopleRecallResult {
  candidates: SidePeopleCandidate[];
  filteredCount: number;
  emptyAfterHardFilter: boolean;
}

/** Build activity query string from invite draft. Empty dims contribute nothing. */
export function buildActivityQuery(draft: WishDraft): string {
  const parts: string[] = [];
  const core =
    draft.activityCore?.trim() ||
    activityCoreFromKind(draft.kind) ||
    (draft.kind && draft.kind !== "other" ? String(draft.kind) : "");
  if (core) parts.push(core);
  if (draft.kind && draft.kind !== "other") {
    const fromKind = activityCoreFromKind(draft.kind);
    if (fromKind && fromKind !== core) parts.push(fromKind);
  }
  if (draft.rawText?.trim()) parts.push(draft.rawText.trim());
  if (draft.when && draft.when !== "any") parts.push(draft.when);
  if (draft.placeRaw?.trim()) parts.push(draft.placeRaw.trim());
  else if (draft.city_zh?.trim() || draft.city?.trim()) {
    parts.push(draft.city_zh?.trim() || draft.city!.trim());
  }
  // Infer kind label from free text when enum missing
  if (!draft.kind || draft.kind === "other") {
    const inferred = kindFromActivityCore(draft.activityCore || draft.rawText || "");
    const label = activityCoreFromKind(inferred);
    if (label) parts.push(label);
  }
  return parts.join(" ");
}

/**
 * Activity fit 0..1 — bag similarity vs profileText.
 * Missing query or empty profileText → 0 (no neutral fill).
 */
export function activityFitScore(activityQuery: string, person: Person): number {
  const q = activityQuery.trim();
  if (!q) return 0;
  const doc = (person.profileText || "").trim();
  if (!doc) return 0;
  return semanticSimilarity(q, doc);
}

function minMaxNorm(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 1e-9) return values.map(() => (max === 0 ? 0 : 0.5));
  return values.map((v) => (v - min) / (max - min));
}

/** Place must be hard for Side people search (no cross-city relax). */
export function sidePlaceHardFilters(
  draft: WishDraft,
  profile: Profile | null | undefined,
  base?: MatchHardFilters,
): MatchHardFilters {
  const next: MatchHardFilters = { ...(base ?? EMPTY_HARD_FILTERS) };
  const place =
    draft.placeRaw?.trim() ||
    draft.city_zh?.trim() ||
    draft.city?.trim() ||
    profile?.city?.trim() ||
    "";
  if (place && (next.cities.length === 0 || !next.cityStrength)) {
    next.cities = [place];
    next.cityStrength = "hard";
  } else if (next.cities.length > 0 && !next.cityStrength) {
    next.cityStrength = "hard";
  }
  return next;
}

export function recallSidePeople(opts: SidePeopleRecallOpts): SidePeopleRecallResult {
  const limit = opts.limit ?? SIDE_RECALL_LIMIT;
  const blocked = new Set(opts.blockedIds);
  const shown = new Set(opts.shownIds);
  const passed = new Set(opts.passedIds);
  const preferenceQuery = buildPreferenceQuery(opts.understanding);
  const activityQuery = buildActivityQuery(opts.wishDraft);

  const recallOpts: RecallOpts = {
    understanding: opts.understanding,
    hardFilters: opts.hardFilters,
    blockedIds: opts.blockedIds,
    shownIds: opts.shownIds,
    passedIds: opts.passedIds,
    pool: opts.pool,
    seekerProfile: opts.seekerProfile,
    limit,
  };

  const available = opts.pool.filter(
    (p) => !blocked.has(p.id) && !shown.has(p.id) && !passed.has(p.id),
  );
  const afterHard = available.filter((p) => personPassesHardFilters(p, recallOpts));

  if (afterHard.length === 0) {
    return {
      candidates: [],
      filteredCount: 0,
      emptyAfterHardFilter: available.length > 0 || opts.pool.length > 0,
    };
  }

  const raw = afterHard.map((p) => {
    const personScore = softScore(p, recallOpts, preferenceQuery);
    const activityScore = activityFitScore(activityQuery, p);
    return { id: p.id, personScore, activityScore };
  });

  const pNorm = minMaxNorm(raw.map((r) => r.personScore));
  const aNorm = minMaxNorm(raw.map((r) => r.activityScore));

  const candidates: SidePeopleCandidate[] = raw
    .map((r, i) => ({
      id: r.id,
      personScore: r.personScore,
      activityScore: r.activityScore,
      total: 0.5 * (pNorm[i] ?? 0) + 0.5 * (aNorm[i] ?? 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return {
    candidates,
    filteredCount: afterHard.length,
    emptyAfterHardFilter: false,
  };
}
