/**
 * Wish match scoring pipeline (after hard filters):
 * 1) Enum soft — mid-tier flex prefs (when / place / level / gender / age)
 * 2) Vector — activity-core similarity + merged extraPref + personality
 * 3) Weighted sum (+ small aux: freshness, shown/passed)
 *
 * High-tier hard constraints (placeMode, activity τ, hard when/place/buddy)
 * are applied in wish-recall hard filters, not here.
 */

import type { Intent, LevelTier, WhenTier } from "./intents";
import { levelCompatible, sameCity, slotToWhen, whenCompatible } from "./intents";
import {
  buddyFiltersActive,
  ownerPassesBuddyHardFilters,
  type BuddyHardFilters,
} from "./buddy-filters";
import { resolveOwnerSnapshot } from "./owner-snapshot";
import type { UserUnderstanding } from "./understanding";
import { datesCompatible, intentDateRange } from "./wish-date";
import {
  isFlexConstrained,
  resolveLevelConstraint,
  resolvePlaceCityConstraint,
  resolveWhenConstraint,
} from "./wish-constraints";
import { placeDetailSoftScore, resolvePlaceOnline } from "./wish-place";
import type { BuddyMatchQuery } from "./wish-match-profile";
import { personalityProfileScore, softBuddyDemographicScore } from "./buddy-match";
import { activityCoreMatchScore } from "./activity-core";
import { extraPrefMatchScore } from "./wish-extra-pref";

/** Relative weights for the final score (tunable). */
export const WISH_SCORE_WEIGHTS = {
  /** Mid: flex structured prefs */
  enumSoft: 1.0,
  /** Low–mid: activity core + merged extraPref + personality */
  vector: 0.85,
  /** Low: freshness / exploration penalties */
  aux: 0.35,
} as const;

export interface WishScoreBreakdown {
  enumSoft: number;
  vector: number;
  aux: number;
  total: number;
}

function freshnessScore(it: Intent): number {
  const age = Date.now() - (it.createdAt || 0);
  const day = 86_400_000;
  if (age <= 7 * day) return 2;
  if (age <= 30 * day) return 1;
  return 0;
}

/**
 * Soft score for fields with discrete / structured values.
 * Includes flex constraints and soft agreement on when/level/place/gender/age.
 */
export function enumSoftMatchScore(
  mine: Intent,
  other: Intent,
  buddy: BuddyHardFilters,
  buddyQ: BuddyMatchQuery | null,
): number {
  let s = 0;
  const mineWhen: WhenTier | undefined = mine.whenAny ? undefined : slotToWhen(mine.day, mine.window);
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;
  const theirLevel: LevelTier | undefined = other.levelAny ? undefined : other.level;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;

  const whenC = resolveWhenConstraint(mine);
  const levelC = resolveLevelConstraint(mine);
  const placeC = resolvePlaceCityConstraint(mine);

  // Time / dates
  if (mine.day === other.day && mine.window === other.window) s += 5;
  else if (whenCompatible(mineWhen, theirWhen)) s += 2;
  const mineDates = intentDateRange(mine);
  const otherDates = intentDateRange(other);
  if (mineDates && otherDates && mineDates.start === otherDates.start && mineDates.end === otherDates.end) {
    s += 4;
  } else if (mineDates && otherDates && datesCompatible(mine, other)) {
    s += 2;
  }
  if (isFlexConstrained(whenC)) {
    const ok =
      Boolean(mineDates && otherDates && datesCompatible(mine, other)) ||
      whenCompatible(whenC.value as WhenTier, theirWhen);
    s += ok ? 4 : -2;
  }

  // Level
  if (mine.level === other.level) s += 3;
  else if (levelCompatible(kind, mineLevel, theirLevel ?? "intermediate")) s += 1;
  if (isFlexConstrained(levelC)) {
    const ok = !other.levelAny && other.level === levelC.value;
    s += ok ? 3 : -1;
  }

  // Place
  if (resolvePlaceOnline(mine) && resolvePlaceOnline(other)) s += 4;
  else if (!resolvePlaceOnline(mine) && sameCity(mine, other)) s += 3;
  s += placeDetailSoftScore(mine, other);
  if (isFlexConstrained(placeC)) {
    s += sameCity(mine, other) ? 4 : -2;
  }

  // Buddy demographics (gender / age)
  if (buddyQ) {
    s += softBuddyDemographicScore(other, buddyQ);
  }
  if (buddyFiltersActive(buddy) && mine.buddyGenderStrength === "flex") {
    s += ownerPassesBuddyHardFilters(resolveOwnerSnapshot(other), buddy) ? 4 : -2;
  }

  return s;
}

/**
 * Vector score: activity-core ↔ core, merged extraPref, buddy personality.
 * Does not double-count understanding × otherReq against full activity sentences.
 */
export function vectorMatchScore(
  mine: Intent,
  other: Intent,
  u: UserUnderstanding,
  buddyQ: BuddyMatchQuery | null,
): number {
  let s = 0;
  s += activityCoreMatchScore(mine, other);
  s += extraPrefMatchScore(mine, other, u);
  if (buddyQ) {
    s += personalityProfileScore(other, buddyQ);
  }
  return s;
}

export function auxMatchScore(
  other: Intent,
  opts: { shownIds?: string[]; passedIds?: string[] },
): number {
  let s = freshnessScore(other);
  if (opts.shownIds?.includes(other.id)) s -= 1.5;
  if (opts.passedIds?.includes(other.id)) s -= 4;
  return s;
}

export function scoreWishCandidate(
  mine: Intent,
  other: Intent,
  u: UserUnderstanding,
  opts: {
    buddyHardFilters: BuddyHardFilters;
    buddyMatchQuery?: BuddyMatchQuery | null;
    shownIds?: string[];
    passedIds?: string[];
    weights?: Partial<typeof WISH_SCORE_WEIGHTS>;
  },
): WishScoreBreakdown {
  const w = { ...WISH_SCORE_WEIGHTS, ...opts.weights };
  const buddyQ = opts.buddyMatchQuery ?? null;
  const enumSoft = enumSoftMatchScore(mine, other, opts.buddyHardFilters, buddyQ);
  const vector = vectorMatchScore(mine, other, u, buddyQ);
  const aux = auxMatchScore(other, opts);
  const total = w.enumSoft * enumSoft + w.vector * vector + w.aux * aux;
  return { enumSoft, vector, aux, total };
}
