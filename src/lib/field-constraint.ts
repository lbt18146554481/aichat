/**
 * Unified field constraint semantics for Side (wish) and Matchmaker (people).
 *
 * - null / unset: not collected yet
 * - "any": user said unrestricted
 * - specific value + "hard": must match (filter out)
 * - specific value + "flex": preferred ("最好是") — soft score only
 */

export const CONSTRAINT_ANY = "any" as const;
export type ConstraintAny = typeof CONSTRAINT_ANY;

/** How strongly a concrete value should bind matching. */
export type ConstraintStrength = "hard" | "flex";

export type Constrained<T> = {
  /** Concrete value, unrestricted, or not collected. */
  value: T | ConstraintAny | null;
  /**
   * Only meaningful when `value` is a concrete (non-any) value.
   * Defaults: legacy strict* → hard; otherwise flex for soft prefs.
   */
  strength: ConstraintStrength | null;
};

export function isConstraintAny(value: unknown): boolean {
  if (value == null) return false;
  const t = String(value).trim().toLowerCase();
  return t === CONSTRAINT_ANY || t === "不限" || t === "anywhere";
}

export function isConstraintUnset(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

export function isConstraintSpecific<T>(value: T | ConstraintAny | null | undefined): value is T {
  return !isConstraintUnset(value) && !isConstraintAny(value);
}

/**
 * Normalize legacy any/strict flags into Constrained<T>.
 * Precedence: explicit strength > strictFlag→hard > defaultStrength (flex).
 */
export function constrainedFromLegacy<T>(opts: {
  value?: T | ConstraintAny | null;
  strength?: ConstraintStrength | null;
  anyFlag?: boolean;
  strictFlag?: boolean;
  /** When value is specific and no strength/strict given. */
  defaultStrength?: ConstraintStrength;
}): Constrained<T> {
  if (opts.anyFlag || isConstraintAny(opts.value)) {
    return { value: CONSTRAINT_ANY, strength: null };
  }
  if (isConstraintUnset(opts.value)) {
    return { value: null, strength: null };
  }
  const value = opts.value as T;
  if (opts.strength === "hard" || opts.strength === "flex") {
    return { value, strength: opts.strength };
  }
  if (opts.strictFlag) return { value, strength: "hard" };
  return { value, strength: opts.defaultStrength ?? "flex" };
}

export function isHardConstrained<T>(c: Constrained<T>): boolean {
  return isConstraintSpecific(c.value) && c.strength === "hard";
}

export function isFlexConstrained<T>(c: Constrained<T>): boolean {
  return isConstraintSpecific(c.value) && c.strength === "flex";
}

/** Hard gate: only fails when mine is hard-specific and other does not satisfy. */
export function passesHardConstraint<T>(
  mine: Constrained<T>,
  otherSatisfies: boolean,
): boolean {
  if (!isHardConstrained(mine)) return true;
  return otherSatisfies;
}

/** Soft score: +hit when flex matches; 0 otherwise (caller may subtract on miss). */
export function flexConstraintScore<T>(
  mine: Constrained<T>,
  otherSatisfies: boolean,
  hitScore: number,
  missScore = 0,
): number {
  if (!isFlexConstrained(mine)) return 0;
  return otherSatisfies ? hitScore : missScore;
}

export function parseStrength(raw: unknown): ConstraintStrength | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "hard" || t === "必须" || t === "strict" || t === "required") return "hard";
  if (t === "flex" || t === "软" || t === "最好" || t === "prefer" || t === "preferred") return "flex";
  return null;
}
