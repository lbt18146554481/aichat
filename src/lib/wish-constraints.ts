/**
 * Resolve unified constraints from WishDraft / Intent (with legacy *Any / strict* compat).
 */

import type { Intent, LevelTier, WhenTier } from "./intents";
import { levelCompatible, slotToWhen, whenCompatible } from "./intents";
import {
  CONSTRAINT_ANY,
  constrainedFromLegacy,
  flexConstraintScore,
  isConstraintAny,
  isFlexConstrained,
  isHardConstrained,
  passesHardConstraint,
  type Constrained,
  type ConstraintStrength,
} from "./field-constraint";
import { datesCompatible, intentDateRange } from "./wish-date";
import type { WishDraft } from "./wish-types";
import {
  isPlaceAny,
  isPlaceLevelSpecific,
  normalizePlaceSpec,
  type PlaceFields,
} from "./wish-place";
import type { BuddyHardFilters } from "./buddy-filters";
import type { PersonGender } from "./types";

export function resolveWhenConstraint(
  item: Pick<WishDraft | Intent, "whenAny" | "whenStrength" | "strictWhen"> & {
    when?: WhenTier;
    day?: Intent["day"];
    window?: Intent["window"];
  },
): Constrained<WhenTier> {
  let when: WhenTier | typeof CONSTRAINT_ANY | null | undefined = item.when;
  if ("day" in item && item.day && item.window && !item.whenAny && !when) {
    when = slotToWhen(item.day, item.window);
  }
  return constrainedFromLegacy<WhenTier>({
    value: when ?? null,
    strength: item.whenStrength,
    anyFlag: item.whenAny || when === "any",
    strictFlag: item.strictWhen,
    defaultStrength: "flex",
  });
}

export function resolveLevelConstraint(
  item: Pick<WishDraft | Intent, "level" | "levelAny" | "levelStrength" | "strictLevel">,
): Constrained<LevelTier> {
  return constrainedFromLegacy<LevelTier>({
    value: item.level ?? null,
    strength: item.levelStrength,
    anyFlag: item.levelAny,
    strictFlag: item.strictLevel,
    defaultStrength: "flex",
  });
}

export function resolvePlaceCityConstraint(
  item: PlaceFields & { placeStrength?: ConstraintStrength | null },
): Constrained<string> {
  const spec = normalizePlaceSpec(item);
  if (spec.placeMode === "online" || spec.placeMode === "any") {
    return { value: CONSTRAINT_ANY, strength: null };
  }
  const city = spec.place?.city;
  if (isPlaceAny(city)) return { value: CONSTRAINT_ANY, strength: null };
  if (!isPlaceLevelSpecific(city)) return { value: null, strength: null };
  return constrainedFromLegacy<string>({
    value: String(city),
    strength: item.placeStrength,
    // Legacy offline city filters were hard by default.
    defaultStrength: "hard",
  });
}

export function resolveBuddyGenderConstraint(
  buddy: BuddyHardFilters,
  strength?: ConstraintStrength | null,
): Constrained<PersonGender[]> {
  if (!buddy.genders.length) {
    return { value: null, strength: null };
  }
  return constrainedFromLegacy<PersonGender[]>({
    value: buddy.genders,
    strength,
    defaultStrength: "hard",
  });
}

/** Mirror strength back onto legacy bools for older readers. */
export function legacyFlagsFromWhenLevel(opts: {
  when: Constrained<WhenTier>;
  level: Constrained<LevelTier>;
}): {
  whenAny: boolean;
  levelAny: boolean;
  strictWhen: boolean;
  strictLevel: boolean;
  whenStrength: ConstraintStrength | null;
  levelStrength: ConstraintStrength | null;
} {
  return {
    whenAny: isConstraintAny(opts.when.value) || opts.when.value == null,
    levelAny: isConstraintAny(opts.level.value) || opts.level.value == null,
    strictWhen: isHardConstrained(opts.when),
    strictLevel: isHardConstrained(opts.level),
    whenStrength: opts.when.strength,
    levelStrength: opts.level.strength,
  };
}

export function passesWhenHardFilter(mine: Intent, other: Intent): boolean {
  const c = resolveWhenConstraint(mine);
  if (!isHardConstrained(c)) return true;
  const mineRange = intentDateRange(mine);
  if (mineRange && !datesCompatible(mine, other)) return false;
  if (mineRange) return true;
  const mineWhen = c.value as WhenTier;
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  return whenCompatible(mineWhen, theirWhen);
}

export function passesLevelHardFilter(mine: Intent, other: Intent): boolean {
  const c = resolveLevelConstraint(mine);
  if (!isHardConstrained(c)) return true;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;
  if (!["tennis", "climb"].includes(kind)) return true;
  if (other.levelAny) return false;
  return mine.level === other.level;
}

export function passesPlaceCityHardFilter(
  mine: Intent,
  other: Intent,
  respectCity: boolean,
  sameCityFn: (a: Intent, b: Intent) => boolean,
): boolean {
  if (!respectCity) return true;
  const c = resolvePlaceCityConstraint(mine);
  if (!isHardConstrained(c)) return true;
  // Other side unrestricted city → ok
  const otherC = resolvePlaceCityConstraint(other);
  if (isConstraintAny(otherC.value) || other.placeFlex) return true;
  return sameCityFn(mine, other);
}

export function whenLevelPlaceSoftScore(
  mine: Intent,
  other: Intent,
  sameCityFn: (a: Intent, b: Intent) => boolean,
): number {
  let s = 0;
  const whenC = resolveWhenConstraint(mine);
  if (isFlexConstrained(whenC)) {
    const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
    const ok =
      Boolean(intentDateRange(mine) && intentDateRange(other) && datesCompatible(mine, other)) ||
      whenCompatible(whenC.value as WhenTier, theirWhen);
    s += flexConstraintScore(whenC, ok, 4, -1);
  }
  const levelC = resolveLevelConstraint(mine);
  if (isFlexConstrained(levelC)) {
    const ok = !other.levelAny && other.level === levelC.value;
    s += flexConstraintScore(levelC, ok, 3, -0.5);
  }
  const placeC = resolvePlaceCityConstraint(mine);
  if (isFlexConstrained(placeC)) {
    const otherC = resolvePlaceCityConstraint(other);
    const ok = isConstraintAny(otherC.value) || sameCityFn(mine, other);
    s += flexConstraintScore(placeC, ok, 3, -1);
  }
  return s;
}

export {
  isHardConstrained,
  isFlexConstrained,
  passesHardConstraint,
  flexConstraintScore,
  CONSTRAINT_ANY,
};
