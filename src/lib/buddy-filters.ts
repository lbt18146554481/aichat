import type { PersonGender } from "./types";
import type { OwnerSnapshot } from "./owner-snapshot";
import type { SideLang } from "./wish-types";

/** Hard constraints on activity buddy demographics (not activity fields). */
export interface BuddyHardFilters {
  genders: PersonGender[];
  excludeGenders: PersonGender[];
  ageMin: number | null;
  ageMax: number | null;
}

export const EMPTY_BUDDY_HARD_FILTERS: BuddyHardFilters = {
  genders: [],
  excludeGenders: [],
  ageMin: null,
  ageMax: null,
};

export function buddyFiltersActive(f: BuddyHardFilters): boolean {
  return (
    f.genders.length > 0 ||
    f.excludeGenders.length > 0 ||
    f.ageMin != null ||
    f.ageMax != null
  );
}

export function ownerPassesBuddyHardFilters(
  owner: OwnerSnapshot,
  f: BuddyHardFilters,
): boolean {
  if (!buddyFiltersActive(f)) return true;

  if (f.genders.length > 0) {
    if (!owner.gender || !f.genders.includes(owner.gender)) return false;
  }
  if (f.excludeGenders.length > 0 && owner.gender && f.excludeGenders.includes(owner.gender)) {
    return false;
  }

  if (f.ageMin != null) {
    if (owner.age == null || owner.age < f.ageMin) return false;
  }
  if (f.ageMax != null) {
    if (owner.age == null || owner.age > f.ageMax) return false;
  }

  return true;
}

export function normalizeBuddyHardFilters(
  prev: BuddyHardFilters,
  raw?: Partial<BuddyHardFilters> | null,
): BuddyHardFilters {
  if (!raw) return prev;
  const genders = raw.genders !== undefined ? [...raw.genders] : prev.genders;
  const excludeGenders =
    raw.excludeGenders !== undefined ? [...raw.excludeGenders] : prev.excludeGenders;
  return {
    genders,
    excludeGenders,
    ageMin: raw.ageMin !== undefined ? raw.ageMin : prev.ageMin,
    ageMax: raw.ageMax !== undefined ? raw.ageMax : prev.ageMax,
  };
}

export function buddyFiltersLine(f: BuddyHardFilters, lang: SideLang): string {
  const zh = lang === "zh-CN";
  const parts: string[] = [];
  if (f.genders.length) {
    parts.push(
      zh
        ? `性别 ${f.genders.map((g) => (g === "female" ? "女" : g === "male" ? "男" : "非二元")).join("、")}`
        : `gender ${f.genders.join("/")}`,
    );
  }
  if (f.ageMin != null || f.ageMax != null) {
    parts.push(zh ? `年龄 ${f.ageMin ?? "?"}–${f.ageMax ?? "?"}` : `age ${f.ageMin ?? "?"}–${f.ageMax ?? "?"}`);
  }
  return parts.join(zh ? "；" : "; ");
}
