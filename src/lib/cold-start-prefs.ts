/**
 * Cold-start soft prefs from the seeker's Profile.
 * Only fills empty dimensions; never overrides user-extracted values.
 * All cold-start strengths are flex (same soft scoring path as user-stated flex).
 */

import type { Profile } from "./profile-shape";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { BuddyHardFilters } from "./buddy-filters";
import { EMPTY_BUDDY_HARD_FILTERS } from "./buddy-filters";
import type { PersonGender } from "./types";
import type { WishDraft, WishHardFilters } from "./wish-types";
import { normalizePlaceSpec, legacyFlagsFromSpec } from "./wish-place";
import type { ConstraintStrength } from "./field-constraint";

const AGE_PAD = 7;

function oppositeGender(g: string): PersonGender | null {
  const t = g.trim().toLowerCase();
  if (t === "male" || t === "男" || t === "男生") return "female";
  if (t === "female" || t === "女" || t === "女生") return "male";
  if (t === "nonbinary" || t === "非二元") return "nonbinary";
  return null;
}

function ageUnset(f: MatchHardFilters): boolean {
  return f.ageMin == null && f.ageMax == null && !f.ageStrength;
}

function genderUnset(f: MatchHardFilters): boolean {
  return f.genders.length === 0 && f.excludeGenders.length === 0 && !f.genderStrength;
}

function cityUnset(f: MatchHardFilters): boolean {
  return f.cities.length === 0 && f.excludeCities.length === 0 && !f.cityStrength;
}

/** Matchmaker: merge profile priors into hardFilters (flex only on empty dims). */
export function applyMatchmakerColdStart(
  profile: Profile | null | undefined,
  filters: MatchHardFilters,
): MatchHardFilters {
  if (!profile) return filters;
  const next: MatchHardFilters = { ...filters };

  if (genderUnset(next)) {
    const pref = oppositeGender(profile.gender ?? "");
    if (pref) {
      next.genders = [pref];
      next.genderStrength = "flex";
    }
  }

  if (ageUnset(next) && typeof profile.age === "number" && profile.age >= 18) {
    next.ageMin = Math.max(18, profile.age - AGE_PAD);
    next.ageMax = profile.age + AGE_PAD;
    next.ageStrength = "flex";
  }

  if (cityUnset(next) && profile.city?.trim()) {
    next.cities = [profile.city.trim()];
    next.cityStrength = "flex";
  }

  return next;
}

function buddyGenderUnset(b: BuddyHardFilters): boolean {
  return b.genders.length === 0 && b.excludeGenders.length === 0;
}

function buddyAgeUnset(b: BuddyHardFilters): boolean {
  return b.ageMin == null && b.ageMax == null;
}

/** Side: buddy hard filters cold-start (flex via draft buddy*Strength). */
export function applySideBuddyColdStart(
  profile: Profile | null | undefined,
  buddy: BuddyHardFilters,
): {
  buddy: BuddyHardFilters;
  buddyGenderStrength: ConstraintStrength | null;
  buddyAgeStrength: ConstraintStrength | null;
} {
  if (!profile) {
    return { buddy, buddyGenderStrength: null, buddyAgeStrength: null };
  }
  const next: BuddyHardFilters = {
    genders: [...buddy.genders],
    excludeGenders: [...buddy.excludeGenders],
    ageMin: buddy.ageMin,
    ageMax: buddy.ageMax,
  };
  let buddyGenderStrength: ConstraintStrength | null = null;
  let buddyAgeStrength: ConstraintStrength | null = null;

  if (buddyGenderUnset(next)) {
    const pref = oppositeGender(profile.gender ?? "");
    if (pref) {
      next.genders = [pref];
      buddyGenderStrength = "flex";
    }
  }

  if (buddyAgeUnset(next) && typeof profile.age === "number" && profile.age >= 18) {
    next.ageMin = Math.max(18, profile.age - AGE_PAD);
    next.ageMax = profile.age + AGE_PAD;
    buddyAgeStrength = "flex";
  }

  return { buddy: next, buddyGenderStrength, buddyAgeStrength };
}

/** Side: place/city soft prior from profile when draft has no place yet. */
export function applySidePlaceColdStart(
  profile: Profile | null | undefined,
  draft: WishDraft,
): WishDraft {
  if (!profile?.city?.trim()) return draft;
  const spec = normalizePlaceSpec(draft);
  const hasPlace =
    spec.placeMode === "online" ||
    spec.placeMode === "any" ||
    Boolean(spec.place?.city && spec.place.city !== "any") ||
    Boolean(draft.city?.trim()) ||
    Boolean(draft.placeRaw?.trim());
  if (hasPlace) return draft;

  const city = profile.city.trim();
  const flags = legacyFlagsFromSpec({
    placeMode: "offline",
    place: { city, labels: { city } },
  });
  return {
    ...draft,
    city,
    city_zh: city,
    placeMode: flags.placeMode,
    placeOnline: flags.placeOnline,
    placeFlex: true,
    place: flags.place ?? undefined,
    placeStrength: "flex",
    placeRaw: draft.placeRaw || city,
  };
}

export function emptyMatchFiltersWithColdStart(profile?: Profile | null): MatchHardFilters {
  return applyMatchmakerColdStart(profile, { ...EMPTY_HARD_FILTERS });
}

export function emptyBuddyWithColdStart(profile?: Profile | null): {
  buddy: BuddyHardFilters;
  buddyGenderStrength: ConstraintStrength | null;
  buddyAgeStrength: ConstraintStrength | null;
} {
  return applySideBuddyColdStart(profile, { ...EMPTY_BUDDY_HARD_FILTERS });
}

/** True if profile can seed at least one soft prior. */
export function profileHasColdStartSignal(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (oppositeGender(profile.gender ?? "")) return true;
  if (typeof profile.age === "number" && profile.age >= 18) return true;
  if (profile.city?.trim()) return true;
  if ((profile.moments ?? []).some((m) => m.answer?.trim())) return true;
  if ((profile.favorites ?? []).some((f) => f.title?.trim())) return true;
  return false;
}
