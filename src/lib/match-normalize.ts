import type { EducationLevel, PersonGender } from "./types";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import { canonicalCityId, parsePlace } from "./geo";

export { canonicalCityId as normalizeCity } from "./geo";
export { parsePlace, parsePlaceList, placeFromCityLabels, matchesLocationFilters, formatPlaceList } from "./geo";

/** Education level ordering for min/max comparisons. */
export const EDUCATION_ORDER: EducationLevel[] = [
  "high_school",
  "associate",
  "bachelor",
  "master",
  "doctorate",
];

export function educationRank(level: EducationLevel): number {
  return EDUCATION_ORDER.indexOf(level);
}

/** @deprecated prefer placeFromCityLabels — kept for older call sites. */
export function personCityKey(city: string, city_zh: string): string {
  return canonicalCityId(city) || canonicalCityId(city_zh);
}

export function normalizeToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[,.，。;；'"]/g, "")
    .trim();
}

const EDUCATION_ALIASES: Record<string, EducationLevel> = {
  high_school: "high_school",
  "high school": "high_school",
  hs: "high_school",
  高中: "high_school",
  中学: "high_school",
  associate: "associate",
  associates: "associate",
  专科: "associate",
  大专: "associate",
  bachelor: "bachelor",
  bachelors: "bachelor",
  ba: "bachelor",
  bs: "bachelor",
  本科: "bachelor",
  学士: "bachelor",
  大学: "bachelor",
  master: "master",
  masters: "master",
  ma: "master",
  ms: "master",
  硕士: "master",
  研究生: "master",
  doctorate: "doctorate",
  doctoral: "doctorate",
  phd: "doctorate",
  md: "doctorate",
  博士: "doctorate",
  博士学历: "doctorate",
};

export function normalizeEducationLevel(raw: string): EducationLevel | null {
  const t = normalizeToken(raw).replace(/['']/g, "");
  if (!t) return null;
  if (EDUCATION_ALIASES[t]) return EDUCATION_ALIASES[t];
  for (const [alias, level] of Object.entries(EDUCATION_ALIASES)) {
    if (t.includes(alias) || alias.includes(t)) return level;
  }
  return null;
}

export function normalizeEducationLevels(raw: string[] | undefined): EducationLevel[] {
  if (!raw?.length) return [];
  const out = new Set<EducationLevel>();
  for (const item of raw) {
    const level = normalizeEducationLevel(item);
    if (level) out.add(level);
  }
  return [...out];
}

/**
 * Normalize location phrases for hardFilters.cities.
 * Keeps a stable display/storage token: prefer city id, else country id, else original tok.
 * Hierarchical matching uses parsePlace on these strings at recall time.
 */
export function normalizeCityList(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const out = new Set<string>();
  for (const c of raw) {
    const p = parsePlace(c);
    if (!p) continue;
    const key = p.city ?? p.admin1 ?? p.country ?? p.continent;
    if (key) out.add(key);
  }
  return [...out];
}

export function clampAge(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = Math.round(n);
  if (v < 18 || v > 99) return null;
  return v;
}

const GENDER_ALIASES: Record<string, PersonGender> = {
  female: "female",
  woman: "female",
  women: "female",
  girl: "female",
  f: "female",
  女: "female",
  女生: "female",
  女性: "female",
  女孩: "female",
  女的: "female",
  male: "male",
  man: "male",
  men: "male",
  boy: "male",
  m: "male",
  男: "male",
  男生: "male",
  男性: "male",
  男孩: "male",
  男的: "male",
  nonbinary: "nonbinary",
  "non-binary": "nonbinary",
  nb: "nonbinary",
  enby: "nonbinary",
  非二元: "nonbinary",
  非二元性别: "nonbinary",
};

export function normalizeGender(raw: string): PersonGender | null {
  const t = normalizeToken(raw);
  if (!t) return null;
  if (GENDER_ALIASES[t]) return GENDER_ALIASES[t];
  for (const [alias, gender] of Object.entries(GENDER_ALIASES)) {
    if (t.includes(alias) || alias.includes(t)) return gender;
  }
  return null;
}

export function normalizeGenders(raw: string[] | undefined): PersonGender[] {
  if (!raw?.length) return [];
  const out = new Set<PersonGender>();
  for (const item of raw) {
    const g = normalizeGender(item);
    if (g) out.add(g);
  }
  return [...out];
}

/** User wants to drop hard filters — keep gender if they said so. */
export function relaxHardFiltersFromMessage(
  message: string,
  filters: MatchHardFilters,
): MatchHardFilters {
  const t = message.trim();
  if (!t) return filters;

  const relaxBroad =
    /都放宽|全部放宽|放宽所有|不限(年龄|城市|地点|学历)|去掉(年龄|城市|学历|地点)|啥都行|什么都行|没有(别的)?要求|只要是(女生|女性|男的|男生)/i.test(
      t,
    );
  const genderOnly =
    /只要(是)?(女生|女性|女孩|女的)|只要(是)?(男生|男性|男孩|男的)|only\s+(women|men|female|male)/i.test(
      t,
    );

  if (genderOnly || relaxBroad) {
    const next: MatchHardFilters = { ...EMPTY_HARD_FILTERS };
    if (/女/.test(t) || filters.genders.includes("female")) {
      next.genders = ["female"];
      return next;
    }
    if (/男/.test(t) && !/女/.test(t)) {
      next.genders = ["male"];
      return next;
    }
    if (filters.genders.length) next.genders = [...filters.genders];
    if (filters.excludeGenders.length) next.excludeGenders = [...filters.excludeGenders];
    return next;
  }

  const next: MatchHardFilters = { ...filters };
  if (/放宽.*年龄|不限年龄|年龄.*放宽|年龄不限/i.test(t)) {
    next.ageMin = null;
    next.ageMax = null;
  }
  if (/放宽.*(城市|地点)|不限.*(城市|地点)|不限地点/i.test(t)) {
    next.cities = [];
    next.excludeCities = [];
  }
  if (/放宽.*学历|不限学历/i.test(t)) {
    next.educationMin = null;
    next.educationLevels = [];
    next.excludeEducationLevels = [];
  }
  return next;
}
