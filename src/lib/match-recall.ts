import type { Person } from "./types";
import type { RecallOpts, RecallResult, RecalledCandidate } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import { educationRank } from "./match-normalize";
import {
  matchesLocationFilters,
  parsePlaceList,
  placeFromCityLabels,
} from "./geo";
import { buildPreferenceQuery } from "./person-facets";
import { semanticSimilarity } from "./text-similarity";

const DEFAULT_LIMIT = 10;

function personIsActive(p: Person): boolean {
  return (p.status ?? "active") === "active";
}

function personPassesHardFilters(p: Person, opts: RecallOpts): boolean {
  const f = opts.hardFilters;

  if (!personIsActive(p)) return false;
  if (f.ageMin != null && p.age < f.ageMin) return false;
  if (f.ageMax != null && p.age > f.ageMax) return false;

  if (f.genders.length > 0 && !f.genders.includes(p.gender)) return false;
  if (f.excludeGenders.includes(p.gender)) return false;

  const personPlace = placeFromCityLabels(p.city, p.city_zh);
  const include = parsePlaceList(f.cities);
  const exclude = parsePlaceList(f.excludeCities);
  if (!matchesLocationFilters(personPlace, include, exclude)) return false;

  const rank = educationRank(p.educationLevel);
  if (f.educationMin != null && rank < educationRank(f.educationMin)) return false;
  if (f.educationLevels.length > 0 && !f.educationLevels.includes(p.educationLevel))
    return false;
  if (f.excludeEducationLevels.includes(p.educationLevel)) return false;

  return true;
}

function softScore(p: Person, opts: RecallOpts, preferenceQuery: string): number {
  let vectorScore = 0;
  if (preferenceQuery.trim()) {
    vectorScore = semanticSimilarity(preferenceQuery, p.profileText);
    for (const neg of opts.understanding.negative) {
      vectorScore -= semanticSimilarity(neg, p.profileText) * 0.85;
    }
  }

  let s = vectorScore * 10;

  if (opts.shownIds.includes(p.id)) s -= 1.5;
  if (opts.passedIds.includes(p.id)) s -= 4;

  return s;
}

export function recallCandidates(opts: RecallOpts): RecallResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const blocked = new Set(opts.blockedIds);
  const preferenceQuery = buildPreferenceQuery(opts.understanding);
  const pool = opts.pool ?? [];

  const available = pool.filter(
    (p) => !blocked.has(p.id) && !opts.passedIds.includes(p.id),
  );

  const afterHard = available.filter((p) => personPassesHardFilters(p, opts));

  const scored: RecalledCandidate[] = afterHard
    .map((p) => {
      const vectorScore = preferenceQuery.trim()
        ? semanticSimilarity(preferenceQuery, p.profileText)
        : undefined;
      return {
        id: p.id,
        score: softScore(p, opts, preferenceQuery),
        vectorScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    candidates: scored,
    filteredCount: afterHard.length,
    emptyAfterHardFilter: afterHard.length === 0,
  };
}

/** If current hard filters match nobody, relax stepwise before giving up. */
export function ensureMatchableHardFilters(
  filters: MatchHardFilters,
  pool: Person[],
  opts: Omit<RecallOpts, "hardFilters" | "pool" | "limit">,
): MatchHardFilters {
  const probe = (f: MatchHardFilters) =>
    recallCandidates({ ...opts, hardFilters: f, pool, limit: 1 }).filteredCount > 0;

  if (probe(filters)) return filters;

  if (filters.cities.length > 0 || filters.excludeCities.length > 0) {
    const noCity: MatchHardFilters = { ...filters, cities: [], excludeCities: [] };
    if (probe(noCity)) return noCity;
  }

  if (filters.ageMin != null || filters.ageMax != null) {
    const noAge: MatchHardFilters = { ...filters, ageMin: null, ageMax: null };
    if (probe(noAge)) return noAge;
  }

  if (filters.genders.length > 0) {
    const genderOnly: MatchHardFilters = { ...EMPTY_HARD_FILTERS, genders: filters.genders };
    if (probe(genderOnly)) return genderOnly;
  }

  if (probe(EMPTY_HARD_FILTERS)) return { ...EMPTY_HARD_FILTERS };

  return filters;
}

export function personCardLine(p: Person, lang: "en" | "zh-CN", blocked: boolean): string {
  const zh = lang === "zh-CN";
  const name = zh ? p.name_zh : p.name;
  const city = zh ? p.city_zh : p.city;
  const job = zh ? p.occupation_zh : p.occupation;
  const edu = zh ? p.education_zh : p.education;
  const portrait = zh ? p.portrait_zh : p.portrait;
  const tag = blocked ? " [unavailable]" : "";
  return `- id=${p.id} | ${name}, ${p.age}, ${p.gender}, ${city}, ${job}, ${edu} | ${portrait}${tag}`;
}

export function rosterFromIds(
  ids: string[],
  lang: "en" | "zh-CN",
  blocked: Set<string>,
  pool?: Person[],
): string {
  const byId = new Map((pool ?? []).map((p) => [p.id, p]));
  return ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      return personCardLine(p, lang, blocked.has(id));
    })
    .filter(Boolean)
    .join("\n");
}
