/**
 * Buddy preference matching: query vs publisher profile/traits (scheme 2).
 */

import type { Intent } from "./intents";
import { resolveOwnerSnapshot } from "./owner-snapshot";
import { getPersonById } from "./people-client";
import { semanticSimilarity } from "./text-similarity";
import type { BuddyMatchQuery } from "./wish-match-profile";
import { buddyMatchQueryActive } from "./wish-match-profile";
import type { BuddyHardFilters } from "./buddy-filters";
import { EMPTY_BUDDY_HARD_FILTERS } from "./buddy-filters";

export function ownerProfileTextForMatch(intent: Intent): string {
  const person = getPersonById(intent.ownerId);
  if (person) {
    return [
      person.profileText,
      person.portrait,
      person.portrait_zh,
      person.bio,
      person.bio_zh,
      ...person.traits,
      ...person.interests,
      ...person.signals,
    ]
      .filter(Boolean)
      .join(" ");
  }
  const snap = resolveOwnerSnapshot(intent);
  return [snap.name, snap.name_zh, intent.rawText, intent.rawText_zh].filter(Boolean).join(" ");
}

export function passesBuddyStrictMatch(intent: Intent, query: BuddyMatchQuery): boolean {
  if (!buddyMatchQueryActive(query)) return true;
  const owner = resolveOwnerSnapshot(intent);
  if (query.genderMode === "strict" && query.genders.length > 0) {
    if (!owner.gender || !query.genders.includes(owner.gender)) return false;
  }
  if (query.ageMode === "strict") {
    if (owner.age == null) return false;
    if (query.ageMin != null && owner.age < query.ageMin) return false;
    if (query.ageMax != null && owner.age > query.ageMax) return false;
  }
  return true;
}

export function softBuddyDemographicScore(intent: Intent, query: BuddyMatchQuery): number {
  let s = 0;
  const owner = resolveOwnerSnapshot(intent);
  if (query.genderMode === "soft" && query.genders.length > 0) {
    if (owner.gender && query.genders.includes(owner.gender)) s += 3;
  }
  if (query.ageMode === "soft" && (query.ageMin != null || query.ageMax != null)) {
    if (owner.age != null) {
      const min = query.ageMin ?? 16;
      const max = query.ageMax ?? 99;
      if (owner.age >= min && owner.age <= max) s += 2;
    }
  }
  return s;
}

export function personalityProfileScore(intent: Intent, query: BuddyMatchQuery): number {
  const q = query.personalityQueryText.trim() || query.personalityTags.join(" ");
  if (!q) return 0;
  const ownerText = ownerProfileTextForMatch(intent);
  if (!ownerText.trim()) return 0;
  return semanticSimilarity(q, ownerText) * 12;
}

export function otherReqSimilarityScore(mine: Intent, other: Intent): number {
  const q = mine.otherReqRaw?.trim();
  if (!q) return 0;
  const doc = [
    other.activityDescRaw,
    other.rawText,
    other.rawText_zh,
    other.buddyPrefRaw,
  ]
    .filter(Boolean)
    .join(" ");
  if (!doc.trim()) return 0;
  return semanticSimilarity(q, doc) * 6;
}

/** Legacy hard filters from strict-only buddy query fields. */
export function buddyHardFiltersFromMatchQuery(query: BuddyMatchQuery): BuddyHardFilters {
  if (query.genderMode !== "strict" && query.ageMode !== "strict") {
    return { ...EMPTY_BUDDY_HARD_FILTERS };
  }
  return {
    genders: query.genderMode === "strict" ? [...query.genders] : [],
    excludeGenders: [],
    ageMin: query.ageMode === "strict" ? query.ageMin : null,
    ageMax: query.ageMode === "strict" ? query.ageMax : null,
  };
}
