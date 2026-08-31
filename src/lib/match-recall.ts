import { PEOPLE } from "./people";
import type { Person } from "./types";
import type { RecallOpts, RecallResult, RecalledCandidate } from "./match-types";
import {
  educationRank,
  normalizeCity,
  personCityKey,
} from "./match-normalize";

const DEFAULT_LIMIT = 10;

function personPassesHardFilters(p: Person, opts: RecallOpts): boolean {
  const f = opts.hardFilters;

  if (f.ageMin != null && p.age < f.ageMin) return false;
  if (f.ageMax != null && p.age > f.ageMax) return false;

  const cityKey = personCityKey(p.city, p.city_zh);
  if (f.cities.length > 0 && !f.cities.some((c) => c === cityKey)) return false;
  if (f.excludeCities.length > 0 && f.excludeCities.some((c) => c === cityKey)) return false;

  const rank = educationRank(p.educationLevel);
  if (f.educationMin != null && rank < educationRank(f.educationMin)) return false;
  if (f.educationLevels.length > 0 && !f.educationLevels.includes(p.educationLevel))
    return false;
  if (f.excludeEducationLevels.includes(p.educationLevel)) return false;

  return true;
}

function softScore(p: Person, opts: RecallOpts): number {
  const u = opts.understanding;
  let s = 0;
  const pos = new Set(u.positive);
  const neg = new Set(u.negative);

  for (const sig of p.signals) {
    if (pos.has(sig)) s += 2;
    if (neg.has(sig)) s -= 3;
  }

  const notesText = u.notes.join(" ").toLowerCase();
  const portrait = `${p.portrait} ${p.portrait_zh} ${p.occupation} ${p.occupation_zh}`.toLowerCase();
  for (const note of u.notes) {
    const words = note.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (portrait.includes(w)) s += 1;
    }
  }

  if (opts.shownIds.includes(p.id)) s -= 2;
  if (opts.passedIds.includes(p.id)) s -= 5;

  return s;
}

export function recallCandidates(opts: RecallOpts): RecallResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const blocked = new Set(opts.blockedIds);

  const available = PEOPLE.filter(
    (p) => !blocked.has(p.id) && !opts.passedIds.includes(p.id),
  );

  const afterHard = available.filter((p) => personPassesHardFilters(p, opts));

  const scored: RecalledCandidate[] = afterHard
    .map((p) => ({ id: p.id, score: softScore(p, opts) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    candidates: scored,
    filteredCount: afterHard.length,
    emptyAfterHardFilter: afterHard.length === 0,
  };
}

export function personCardLine(p: Person, lang: "en" | "zh-CN", blocked: boolean): string {
  const zh = lang === "zh-CN";
  const name = zh ? p.name_zh : p.name;
  const city = zh ? p.city_zh : p.city;
  const job = zh ? p.occupation_zh : p.occupation;
  const edu = zh ? p.education_zh : p.education;
  const portrait = zh ? p.portrait_zh : p.portrait;
  const tag = blocked ? " [unavailable]" : "";
  return `- id=${p.id} | ${name}, ${p.age}, ${city}, ${job}, ${edu} | ${portrait}${tag}`;
}

export function rosterFromIds(
  ids: string[],
  lang: "en" | "zh-CN",
  blocked: Set<string>,
): string {
  const byId = new Map(PEOPLE.map((p) => [p.id, p]));
  return ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      return personCardLine(p, lang, blocked.has(id));
    })
    .filter(Boolean)
    .join("\n");
}
