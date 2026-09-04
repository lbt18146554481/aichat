/**
 * Merged free-text preference path for wish scoring (likes/notes/otherReq).
 * Activity core similarity lives in activity-core.ts — keep them separate.
 */

import type { Intent } from "./intents";
import type { UserUnderstanding } from "./understanding";
import { semanticSimilarity } from "./text-similarity";

/** Seeker-side free-text prefs: likes + notes + otherReq (no negatives). */
export function buildWishExtraPrefQuery(
  mine: Intent,
  u: UserUnderstanding,
): string {
  const parts: string[] = [];
  if (u.positive?.length) parts.push(...u.positive);
  if (u.notes?.length) parts.push(...u.notes);
  const other = mine.otherReqRaw?.trim();
  if (other) parts.push(other);
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

/** Candidate free-text (non-activity-core) for extraPref similarity. */
export function buildWishExtraPrefDoc(other: Intent): string {
  return [other.otherReqRaw, other.buddyPrefRaw]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
}

export function extraPrefMatchScore(
  mine: Intent,
  other: Intent,
  u: UserUnderstanding,
): number {
  let s = 0;
  const query = buildWishExtraPrefQuery(mine, u);
  const doc = buildWishExtraPrefDoc(other);
  if (query.trim() && doc.trim()) {
    s += semanticSimilarity(query, doc) * 3;
  }
  if (u.negative?.length && doc.trim()) {
    for (const neg of u.negative) {
      s -= semanticSimilarity(neg, doc) * 0.85;
    }
  }
  return s;
}
