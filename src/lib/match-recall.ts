import type { Person } from "./types";
import type { MatchHardFilters, RecallOpts, RecallResult, RecalledCandidate } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import { educationRank } from "./match-normalize";
import {
  matchesLocationFilters,
  parsePlaceList,
  placeFromCityLabels,
} from "./geo";
import { buildPreferenceQuery, facetLabels } from "./person-facets";
import { semanticSimilarity } from "./text-similarity";
import { softPrefLists, softPrefsPresent } from "./understanding";
import type { UserUnderstanding } from "./understanding";
import { cultureAffinityScoreFromProfilePerson } from "./culture-affinity";
import { mixEmbeddingLexical } from "./similarity-mix";
import { embedMany, vectorCosine } from "./embeddings.server";

const DEFAULT_LIMIT = 10;

/** Soft-score weights — chat (explicit) ≫ cold-start / affinity. */
export const RECALL_SOFT_WEIGHTS = {
  chatQuery: 11,
  chatTraits: 5,
  chatInterests: 5,
  chatOccupation: 3.5,
  chatPace: 2.5,
  chatNeg: 0.85,
  chatFlexGender: 4,
  chatFlexCity: 3,
  chatFlexAge: 3,
  chatFlexEdu: 3,
  /** Cold-start-only flex ≈ 0.4× chat flex */
  coldFlexScale: 0.4,
  culture: 1,
  shown: 1.5,
  passed: 6,
} as const;

function personIsActive(p: Person): boolean {
  return (p.status ?? "active") === "active";
}

function ageInRange(p: Person, f: MatchHardFilters): boolean {
  if (f.ageMin != null && p.age < f.ageMin) return false;
  if (f.ageMax != null && p.age > f.ageMax) return false;
  return true;
}

function educationMatches(p: Person, f: MatchHardFilters): boolean {
  const rank = educationRank(p.educationLevel);
  if (f.educationMin != null && rank < educationRank(f.educationMin)) return false;
  if (f.educationLevels.length > 0 && !f.educationLevels.includes(p.educationLevel))
    return false;
  if (f.excludeEducationLevels.includes(p.educationLevel)) return false;
  return true;
}

export function personPassesHardFilters(p: Person, opts: RecallOpts): boolean {
  const f = opts.hardFilters;

  if (!personIsActive(p)) return false;

  if (f.ageStrength !== "flex" && !ageInRange(p, f)) return false;

  if (f.genders.length > 0 && f.genderStrength !== "flex" && !f.genders.includes(p.gender)) {
    return false;
  }
  if (f.excludeGenders.includes(p.gender)) return false;

  const personPlace = placeFromCityLabels(p.city, p.city_zh);
  const include = parsePlaceList(f.cities);
  const exclude = parsePlaceList(f.excludeCities);
  if (f.cityStrength === "flex") {
    if (exclude.length > 0 && !matchesLocationFilters(personPlace, [], exclude)) return false;
  } else if (!matchesLocationFilters(personPlace, include, exclude)) {
    return false;
  }

  if (f.educationStrength !== "flex" && !educationMatches(p, f)) return false;

  return true;
}

function ageFlexScoreRaw(p: Person, f: MatchHardFilters): number {
  if (f.ageStrength !== "flex") return 0;
  if (f.ageMin == null && f.ageMax == null) return 0;
  if (ageInRange(p, f)) return 1;
  let dist = 0;
  if (f.ageMin != null && p.age < f.ageMin) dist = Math.max(dist, f.ageMin - p.age);
  if (f.ageMax != null && p.age > f.ageMax) dist = Math.max(dist, p.age - f.ageMax);
  if (dist <= 3) return 0.33;
  if (dist <= 7) return -0.33;
  return -0.67;
}

function educationFlexScoreRaw(p: Person, f: MatchHardFilters): number {
  if (f.educationStrength !== "flex") return 0;
  const has =
    f.educationMin != null || f.educationLevels.length > 0 || f.excludeEducationLevels.length > 0;
  if (!has) return 0;
  return educationMatches(p, f) ? 1 : -0.33;
}

function listSimilarity(query: string[], docParts: string[]): number {
  const q = query.map((s) => s.trim()).filter(Boolean).join(" ");
  const d = docParts.map((s) => s.trim()).filter(Boolean).join(" ");
  if (!q || !d) return 0;
  return semanticSimilarity(q, d);
}

/** Document text for embedding / lexical person match. */
export function personMatchDoc(p: Person): string {
  const traits = [...(p.traits ?? []), ...facetLabels(p.traits ?? [], "zh-CN"), ...facetLabels(p.traits ?? [], "en")];
  const interests = [
    ...(p.interests ?? []),
    ...facetLabels(p.interests ?? [], "zh-CN"),
    ...facetLabels(p.interests ?? [], "en"),
  ];
  return [p.profileText, traits.join(" "), interests.join(" "), p.occupation_zh, p.occupation]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n");
}

function chatSoft(opts: RecallOpts): UserUnderstanding {
  return opts.chatUnderstanding ?? opts.understanding;
}

function structuredSoftScoreFrom(
  p: Person,
  u: UserUnderstanding,
  weights: { traits: number; interests: number; occupation: number; pace: number },
): number {
  const soft = softPrefLists(u);
  let s = 0;

  if (soft.traits.length) {
    const traitDoc = [...(p.traits ?? []), ...facetLabels(p.traits ?? [], "zh-CN")].join(" ");
    s +=
      (traitDoc.trim()
        ? listSimilarity(soft.traits, [traitDoc, ...facetLabels(soft.traits, "zh-CN")])
        : listSimilarity(soft.traits, [p.profileText])) * weights.traits;
  }

  if (soft.interests.length) {
    const interestDoc = [
      ...(p.interests ?? []),
      ...facetLabels(p.interests ?? [], "zh-CN"),
    ].join(" ");
    s +=
      (interestDoc.trim()
        ? listSimilarity(soft.interests, [interestDoc])
        : listSimilarity(soft.interests, [p.profileText])) * weights.interests;
  }

  if (soft.occupation.length) {
    const job = `${p.occupation ?? ""} ${p.occupation_zh ?? ""}`.trim();
    s += listSimilarity(soft.occupation, [job || p.profileText]) * weights.occupation;
  }

  if (soft.pace.length) {
    const paceDoc = [p.socialPace ?? "", p.portrait, p.portrait_zh, p.profileText]
      .filter(Boolean)
      .join(" ");
    s += listSimilarity(soft.pace, [paceDoc]) * weights.pace;
  }

  return s;
}

function flexDimActive(f: MatchHardFilters, dim: "gender" | "city" | "age" | "education"): boolean {
  if (dim === "gender") return f.genderStrength === "flex" && f.genders.length > 0;
  if (dim === "city") return f.cityStrength === "flex" && f.cities.length > 0;
  if (dim === "age")
    return f.ageStrength === "flex" && (f.ageMin != null || f.ageMax != null);
  return (
    f.educationStrength === "flex" &&
    (f.educationMin != null || f.educationLevels.length > 0 || f.excludeEducationLevels.length > 0)
  );
}

function chatOwnsFlex(opts: RecallOpts, dim: "gender" | "city" | "age" | "education"): boolean {
  const chat = opts.chatHardFilters;
  if (!chat) return false;
  return flexDimActive(chat, dim);
}

function flexScores(p: Person, opts: RecallOpts): number {
  const w = RECALL_SOFT_WEIGHTS;
  const effective = opts.hardFilters;
  const chat = opts.chatHardFilters;
  let s = 0;

  // Gender
  if (flexDimActive(effective, "gender")) {
    const hit = effective.genders.includes(p.gender) ? 1 : -0.25;
    const scale = chatOwnsFlex(opts, "gender") ? w.chatFlexGender : w.chatFlexGender * w.coldFlexScale;
    s += hit * scale;
  }
  // City
  if (flexDimActive(effective, "city")) {
    const personPlace = placeFromCityLabels(p.city, p.city_zh);
    const include = parsePlaceList(effective.cities);
    const hit = matchesLocationFilters(personPlace, include, []) ? 1 : -0.33;
    const scale = chatOwnsFlex(opts, "city") ? w.chatFlexCity : w.chatFlexCity * w.coldFlexScale;
    s += hit * scale;
  }
  // Age
  if (flexDimActive(effective, "age")) {
    const raw = ageFlexScoreRaw(p, effective);
    const scale = chatOwnsFlex(opts, "age") ? w.chatFlexAge : w.chatFlexAge * w.coldFlexScale;
    s += raw * scale;
  }
  // Education
  if (flexDimActive(effective, "education")) {
    const raw = educationFlexScoreRaw(p, effective);
    const scale = chatOwnsFlex(opts, "education") ? w.chatFlexEdu : w.chatFlexEdu * w.coldFlexScale;
    s += raw * scale;
  }

  void chat;
  return s;
}

/**
 * Sync soft score (lexical only) — used by tests and sync recallCandidates.
 * Prefer `softScoreAsync` on server paths when embeddings are available.
 */
export function softScore(p: Person, opts: RecallOpts, preferenceQuery: string): number {
  const w = RECALL_SOFT_WEIGHTS;
  const chatU = chatSoft(opts);
  const query = preferenceQuery.trim() || buildPreferenceQuery(chatU);

  let vectorScore = 0;
  if (query) {
    vectorScore = semanticSimilarity(query, personMatchDoc(p));
    for (const neg of chatU.negative) {
      vectorScore -= semanticSimilarity(neg, personMatchDoc(p)) * w.chatNeg;
    }
  }

  let s = vectorScore * w.chatQuery;
  if (softPrefsPresent(chatU)) {
    s += structuredSoftScoreFrom(p, chatU, {
      traits: w.chatTraits,
      interests: w.chatInterests,
      occupation: w.chatOccupation,
      pace: w.chatPace,
    });
  }

  s += flexScores(p, opts);
  s += cultureAffinityScoreFromProfilePerson(opts.seekerProfile, p) * w.culture;

  if (opts.shownIds.includes(p.id)) s -= w.shown;
  if (opts.passedIds.includes(p.id)) s -= w.passed;

  return s;
}

export async function softScoreAsync(
  p: Person,
  opts: RecallOpts,
  preferenceQuery: string,
  precomputed?: {
    queryVec?: number[] | null;
    docVec?: number[] | null;
    negVecs?: Array<number[] | null>;
  },
): Promise<{ score: number; vectorScore: number }> {
  const w = RECALL_SOFT_WEIGHTS;
  const chatU = chatSoft(opts);
  const query = preferenceQuery.trim() || buildPreferenceQuery(chatU);
  const doc = personMatchDoc(p);

  let vectorScore = 0;
  if (query) {
    const lexical = semanticSimilarity(query, doc);
    let embed: number | null = null;
    if (precomputed?.queryVec && precomputed?.docVec) {
      embed = vectorCosine(precomputed.queryVec, precomputed.docVec);
    }
    vectorScore = mixEmbeddingLexical(embed, lexical);

    for (let i = 0; i < chatU.negative.length; i++) {
      const neg = chatU.negative[i]!;
      const negLex = semanticSimilarity(neg, doc);
      let negEmbed: number | null = null;
      const nv = precomputed?.negVecs?.[i];
      if (nv && precomputed?.docVec) negEmbed = vectorCosine(nv, precomputed.docVec);
      vectorScore -= mixEmbeddingLexical(negEmbed, negLex) * w.chatNeg;
    }
  }

  let s = vectorScore * w.chatQuery;
  if (softPrefsPresent(chatU)) {
    s += structuredSoftScoreFrom(p, chatU, {
      traits: w.chatTraits,
      interests: w.chatInterests,
      occupation: w.chatOccupation,
      pace: w.chatPace,
    });
  }

  s += flexScores(p, opts);
  s += cultureAffinityScoreFromProfilePerson(opts.seekerProfile, p) * w.culture;

  if (opts.shownIds.includes(p.id)) s -= w.shown;
  if (opts.passedIds.includes(p.id)) s -= w.passed;

  return { score: s, vectorScore };
}

/** Lexical-only recall (tests / probes). */
export function recallCandidates(opts: RecallOpts): RecallResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const blocked = new Set(opts.blockedIds);
  const chatU = chatSoft(opts);
  const preferenceQuery = buildPreferenceQuery(chatU);
  const pool = opts.pool ?? [];

  const available = pool.filter((p) => !blocked.has(p.id));
  const afterHard = available.filter((p) => personPassesHardFilters(p, opts));

  const scored: RecalledCandidate[] = afterHard
    .map((p) => {
      const vectorScore = preferenceQuery.trim()
        ? semanticSimilarity(preferenceQuery, personMatchDoc(p))
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

/** Server recall: batch embeddings + chat-priority soft weights. */
export async function recallCandidatesAsync(opts: RecallOpts): Promise<RecallResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const blocked = new Set(opts.blockedIds);
  const chatU = chatSoft(opts);
  const preferenceQuery = buildPreferenceQuery(chatU);
  const pool = opts.pool ?? [];

  const available = pool.filter((p) => !blocked.has(p.id));
  const afterHard = available.filter((p) => personPassesHardFilters(p, opts));

  if (afterHard.length === 0) {
    return { candidates: [], filteredCount: 0, emptyAfterHardFilter: true };
  }

  const docs = afterHard.map(personMatchDoc);
  const negTexts = chatU.negative.map((n) => n.trim()).filter(Boolean);
  const toEmbed: string[] = [];
  if (preferenceQuery.trim()) toEmbed.push(preferenceQuery);
  toEmbed.push(...docs);
  toEmbed.push(...negTexts);

  const vectors = await embedMany(toEmbed);
  let offset = 0;
  const queryVec = preferenceQuery.trim() ? vectors[offset++] ?? null : null;
  const docVecs = docs.map(() => vectors[offset++] ?? null);
  const negVecs = negTexts.map(() => vectors[offset++] ?? null);

  const scored: RecalledCandidate[] = [];
  for (let i = 0; i < afterHard.length; i++) {
    const p = afterHard[i]!;
    const { score, vectorScore } = await softScoreAsync(p, opts, preferenceQuery, {
      queryVec,
      docVec: docVecs[i] ?? null,
      negVecs,
    });
    scored.push({
      id: p.id,
      score,
      vectorScore: preferenceQuery.trim() ? vectorScore : undefined,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    candidates: scored.slice(0, limit),
    filteredCount: afterHard.length,
    emptyAfterHardFilter: false,
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
    const noAge: MatchHardFilters = {
      ...filters,
      ageMin: null,
      ageMax: null,
      ageStrength: null,
    };
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
