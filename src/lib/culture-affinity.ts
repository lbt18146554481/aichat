/**
 * Culture affinity: shared Favorites + Moments text similarity.
 * Kept separate from traits/interests preference fields.
 */

import type { Profile, Favorite, ProfileMoment } from "./profile-shape";
import type { Person } from "./types";
import { semanticSimilarity } from "./text-similarity";

/** Soft score weights (aligned with other flex demographic boosts). */
export const CULTURE_SCORE = {
  sharedFavorite: 6,
  momentSim: 5,
} as const;

export function normFavoriteTitle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[《》【】\[\]（）()·・.\s]+/g, "")
    .replace(/[:：].*$/, "");
}

export function favoriteTitlesFromProfile(p: Profile | null | undefined): string[] {
  return (p?.favorites ?? [])
    .map((f) => f.title?.trim())
    .filter(Boolean) as string[];
}

export function favoriteTitlesFromPerson(p: Person): string[] {
  const out: string[] = [];
  for (const f of p.favorites ?? []) {
    if (f.title?.trim()) out.push(f.title.trim());
    if (f.title_zh?.trim()) out.push(f.title_zh.trim());
  }
  return out;
}

export function momentBlobFromProfile(p: Profile | null | undefined): string {
  const parts: string[] = [];
  for (const m of p?.moments ?? []) {
    if (m.answer?.trim()) parts.push(m.answer.trim());
  }
  for (const f of p?.favorites ?? []) {
    if (f.why?.trim()) parts.push(f.why.trim());
    if (f.title?.trim()) parts.push(f.title.trim());
  }
  return parts.join(" ");
}

export function momentBlobFromPerson(p: Person): string {
  const parts: string[] = [];
  for (const m of p.moments ?? []) {
    if (m.answer?.trim()) parts.push(m.answer.trim());
    if (m.answer_zh?.trim()) parts.push(m.answer_zh.trim());
  }
  for (const f of p.favorites ?? []) {
    if (f.why?.trim()) parts.push(f.why.trim());
    if (f.why_zh?.trim()) parts.push(f.why_zh.trim());
    if (f.title?.trim()) parts.push(f.title.trim());
    if (f.title_zh?.trim()) parts.push(f.title_zh.trim());
  }
  if (p.portrait?.trim()) parts.push(p.portrait.trim());
  if (p.portrait_zh?.trim()) parts.push(p.portrait_zh.trim());
  return parts.join(" ");
}

/** +CULTURE_SCORE.sharedFavorite if any normalized title overlaps. */
export function sharedFavoriteScore(mineTitles: string[], theirTitles: string[]): number {
  const mine = new Set(mineTitles.map(normFavoriteTitle).filter(Boolean));
  if (!mine.size) return 0;
  for (const t of theirTitles) {
    const key = normFavoriteTitle(t);
    if (key && mine.has(key)) return CULTURE_SCORE.sharedFavorite;
  }
  return 0;
}

/** Moments/favorites-why text similarity soft score. */
export function momentAffinityScore(mineBlob: string, theirBlob: string): number {
  const a = mineBlob.trim();
  const b = theirBlob.trim();
  if (!a || !b) return 0;
  return semanticSimilarity(a, b) * CULTURE_SCORE.momentSim;
}

export function cultureAffinityScoreFromProfilePerson(
  profile: Profile | null | undefined,
  person: Person,
): number {
  if (!profile) return 0;
  let s = 0;
  s += sharedFavoriteScore(favoriteTitlesFromProfile(profile), favoriteTitlesFromPerson(person));
  s += momentAffinityScore(momentBlobFromProfile(profile), momentBlobFromPerson(person));
  return s;
}

/** Lightweight culture score when only occupation/city text is known (wish owner). */
export function cultureAffinityScoreFromProfileText(
  profile: Profile | null | undefined,
  theirText: string,
): number {
  if (!profile) return 0;
  return momentAffinityScore(momentBlobFromProfile(profile), theirText);
}

export type { Favorite, ProfileMoment };
