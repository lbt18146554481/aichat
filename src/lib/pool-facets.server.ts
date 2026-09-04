import { formatPlace, placeFromCityLabels } from "./geo";
import { recallCandidates } from "./match-recall";
import type { MatchHardFilters, MatchmakerLang, RecallOpts } from "./match-types";
import type { EducationLevel, Person, PersonGender } from "./types";
import type { UserUnderstanding } from "./understanding";

export interface PoolFacetBucket {
  label: string;
  count: number;
}

export interface PoolRelaxHint {
  field: string;
  label: string;
  countIfRelaxed: number;
}

export interface PoolFacetsResult {
  totalInPool: number;
  matchingNow: number;
  emptyAfterHardFilter: boolean;
  hardFilters: MatchHardFilters;
  age: { min: number | null; max: number | null; buckets: PoolFacetBucket[] };
  genders: PoolFacetBucket[];
  cities: PoolFacetBucket[];
  education: PoolFacetBucket[];
  relaxHints: PoolRelaxHint[];
  tip: string;
}

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

function recallOpts(
  pool: Person[],
  opts: {
    understanding: UserUnderstanding;
    hardFilters: MatchHardFilters;
    blockedIds: string[];
    shownIds: string[];
    passedIds: string[];
  },
): RecallOpts & { pool: Person[] } {
  return { ...opts, pool, limit: 20 };
}

function ageBuckets(pool: Person[], lang: MatchmakerLang): PoolFacetBucket[] {
  const defs =
    lang === "zh-CN"
      ? [
          { label: "≤24", min: 0, max: 24 },
          { label: "25–29", min: 25, max: 29 },
          { label: "30–34", min: 30, max: 34 },
          { label: "35+", min: 35, max: 200 },
        ]
      : [
          { label: "≤24", min: 0, max: 24 },
          { label: "25–29", min: 25, max: 29 },
          { label: "30–34", min: 30, max: 34 },
          { label: "35+", min: 35, max: 200 },
        ];
  return defs.map((b) => ({
    label: b.label,
    count: pool.filter((p) => p.age >= b.min && p.age <= b.max).length,
  }));
}

function cityBuckets(pool: Person[], lang: MatchmakerLang): PoolFacetBucket[] {
  const counts = new Map<string, number>();
  for (const p of pool) {
    const label =
      lang === "zh-CN"
        ? p.city_zh || p.city
        : p.city || p.city_zh;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function genderBuckets(pool: Person[], lang: MatchmakerLang): PoolFacetBucket[] {
  const labels: Record<PersonGender, string> =
    lang === "zh-CN"
      ? { female: "女性", male: "男性", nonbinary: "非二元" }
      : { female: "female", male: "male", nonbinary: "nonbinary" };
  const counts = new Map<PersonGender, number>();
  for (const p of pool) {
    counts.set(p.gender, (counts.get(p.gender) ?? 0) + 1);
  }
  return (["female", "male", "nonbinary"] as PersonGender[])
    .map((g) => ({ label: labels[g], count: counts.get(g) ?? 0 }))
    .filter((b) => b.count > 0);
}

function educationBuckets(pool: Person[]): PoolFacetBucket[] {
  const counts = new Map<EducationLevel, number>();
  for (const p of pool) {
    counts.set(p.educationLevel, (counts.get(p.educationLevel) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function buildRelaxHints(
  pool: Person[],
  opts: {
    lang: MatchmakerLang;
    understanding: UserUnderstanding;
    hardFilters: MatchHardFilters;
    blockedIds: string[];
    shownIds: string[];
    passedIds: string[];
  },
): PoolRelaxHint[] {
  const isZh = zh(opts.lang);
  const base = recallCandidates(recallOpts(pool, opts));
  if (!base.emptyAfterHardFilter) return [];

  const f = opts.hardFilters;
  const probes: Array<{ field: string; label: string; filters: MatchHardFilters }> = [];
  if (f.genders.length || f.excludeGenders.length) {
    probes.push({
      field: "gender",
      label: isZh ? "性别" : "gender",
      filters: { ...f, genders: [], excludeGenders: [] },
    });
  }
  if (f.cities.length) {
    probes.push({ field: "cities", label: isZh ? "地点" : "location", filters: { ...f, cities: [] } });
  }
  if (f.excludeCities.length) {
    probes.push({
      field: "excludeCities",
      label: isZh ? "排除地点" : "exclude location",
      filters: { ...f, excludeCities: [] },
    });
  }
  if (f.ageMin != null || f.ageMax != null) {
    probes.push({
      field: "age",
      label: isZh ? "年龄" : "age",
      filters: { ...f, ageMin: null, ageMax: null },
    });
  }
  if (f.educationMin || f.educationLevels.length || f.excludeEducationLevels.length) {
    probes.push({
      field: "education",
      label: isZh ? "学历" : "education",
      filters: {
        ...f,
        educationMin: null,
        educationLevels: [],
        excludeEducationLevels: [],
      },
    });
  }

  const hints: PoolRelaxHint[] = [];
  for (const probe of probes) {
    const r = recallCandidates(
      recallOpts(pool, {
        ...opts,
        hardFilters: probe.filters,
      }),
    );
    if (r.filteredCount > 0) {
      hints.push({
        field: probe.field,
        label: probe.label,
        countIfRelaxed: r.filteredCount,
      });
    }
  }
  return hints.sort((a, b) => b.countIfRelaxed - a.countIfRelaxed);
}

function buildTip(
  lang: MatchmakerLang,
  pool: Person[],
  matchingNow: number,
  hardFilters: MatchHardFilters,
  relaxHints: PoolRelaxHint[],
): string {
  const isZh = zh(lang);
  if (matchingNow > 0) {
    return isZh
      ? `当前硬条件下有 ${matchingNow} 人（全池 ${pool.length} 人）。`
      : `${matchingNow} match current filters (${pool.length} in pool).`;
  }
  if (relaxHints.length > 0) {
    const top = relaxHints[0]!;
    return isZh
      ? `当前硬条件下 0 人（全池 ${pool.length} 人）。放宽「${top.label}」约可恢复到 ${top.countIfRelaxed} 人。`
      : `Zero under current filters (${pool.length} in pool). Relaxing ${top.label} restores ~${top.countIfRelaxed}.`;
  }
  const ages = pool.map((p) => p.age);
  const minAge = ages.length ? Math.min(...ages) : null;
  const maxAge = ages.length ? Math.max(...ages) : null;
  if (hardFilters.ageMax != null && minAge != null && hardFilters.ageMax < minAge) {
    return isZh
      ? `全池最小年龄 ${minAge} 岁，当前上限 ${hardFilters.ageMax} 岁，因此为 0。`
      : `Pool minimum age is ${minAge}; your max ${hardFilters.ageMax} excludes everyone.`;
  }
  return isZh
    ? `当前硬条件下 0 人；即使放宽常见条件也可能仍为空（或已被跳过/屏蔽）。`
    : `Zero under filters; relaxing common fields may still leave none (or block/pass lists).`;
}

export function buildPoolFacets(
  pool: Person[],
  opts: {
    lang: MatchmakerLang;
    understanding: UserUnderstanding;
    hardFilters: MatchHardFilters;
    blockedIds: string[];
    shownIds: string[];
    passedIds: string[];
  },
): PoolFacetsResult {
  const recall = recallCandidates(recallOpts(pool, opts));
  const ages = pool.map((p) => p.age);
  const relaxHints = buildRelaxHints(pool, opts);

  return {
    totalInPool: pool.length,
    matchingNow: recall.filteredCount,
    emptyAfterHardFilter: recall.emptyAfterHardFilter,
    hardFilters: opts.hardFilters,
    age: {
      min: ages.length ? Math.min(...ages) : null,
      max: ages.length ? Math.max(...ages) : null,
      buckets: ageBuckets(pool, opts.lang),
    },
    genders: genderBuckets(pool, opts.lang),
    cities: cityBuckets(pool, opts.lang),
    education: educationBuckets(pool),
    relaxHints,
    tip: buildTip(opts.lang, pool, recall.filteredCount, opts.hardFilters, relaxHints),
  };
}

/** Summarize a person's place for mismatch reasons (uses pool row). */
export function personPlaceLabel(p: Person, lang: MatchmakerLang): string {
  const place = placeFromCityLabels(p.city, p.city_zh);
  return place ? formatPlace(place, lang) : lang === "zh-CN" ? p.city_zh : p.city;
}
