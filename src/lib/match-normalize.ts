import type { EducationLevel } from "./types";
import { PEOPLE } from "./people";

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

/** Build city alias → canonical key from the demo pool + common variants. */
function buildCityAliases(): Map<string, string> {
  const map = new Map<string, string>();
  const add = (alias: string, canonical: string) => {
    const k = normalizeToken(alias);
    if (k) map.set(k, normalizeToken(canonical));
  };

  for (const p of PEOPLE) {
    const canon = normalizeToken(p.city);
    add(p.city, canon);
    add(p.city_zh, canon);
    // canonical maps to itself
    map.set(canon, canon);
  }

  // Common CN / EN variants users might type
  add("北京", "beijing");
  add("beijing", "beijing");
  add("上海", "shanghai");
  add("shanghai", "shanghai");
  add("纽约", "new york");
  add("new york", "new york");
  add("brooklyn", "brooklyn");
  add("布鲁克林", "brooklyn");
  add("柏林", "berlin");
  add("berlin", "berlin");
  add("东京", "tokyo");
  add("tokyo", "tokyo");
  add("京都", "kyoto");
  add("kyoto", "kyoto");
  add("伦敦", "london");
  add("london", "london");
  add("巴黎", "paris");
  add("paris", "paris");
  add("温哥华", "vancouver");
  add("vancouver", "vancouver");
  add("罗马", "rome");
  add("rome", "rome");
  add("里斯本", "lisbon");
  add("lisbon", "lisbon");
  add("哥本哈根", "copenhagen");
  add("copenhagen", "copenhagen");
  add("墨西哥城", "mexico city");
  add("mexico city", "mexico city");
  add("特拉维夫", "tel aviv");
  add("tel aviv", "tel aviv");
  add("拉各斯", "lagos");
  add("lagos", "lagos");
  add("布宜诺斯艾利斯", "buenos aires");
  add("buenos aires", "buenos aires");
  add("爱丁堡", "edinburgh");
  add("edinburgh", "edinburgh");

  return map;
}

const CITY_ALIASES = buildCityAliases();

/** Lowercase, trim, collapse spaces, strip common punctuation. */
export function normalizeToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[,.，。;；'"]/g, "")
    .trim();
}

/** Map a user-facing city string to a canonical key for comparison. */
export function normalizeCity(raw: string): string {
  const t = normalizeToken(raw);
  if (!t) return "";
  return CITY_ALIASES.get(t) ?? t;
}

export function personCityKey(city: string, city_zh: string): string {
  return normalizeCity(city) || normalizeCity(city_zh);
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
  // partial match
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

export function normalizeCityList(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const out = new Set<string>();
  for (const c of raw) {
    const k = normalizeCity(c);
    if (k) out.add(k);
  }
  return [...out];
}

export function clampAge(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = Math.round(n);
  if (v < 18 || v > 99) return null;
  return v;
}
