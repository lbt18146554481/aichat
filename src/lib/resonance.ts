import { PEOPLE } from "./people";
import type { Person } from "./types";

export interface Match {
  person: Person;
  shared: string[];
  score: number;
}

// Rank PEOPLE by overlap with the accumulated query signals.
// Returns up to `limit` matches with at least one shared signal; falls back
// to the first few profiles when nothing matches yet (cold-start path).
export function rankProfiles(
  signals: string[],
  options: { limit?: number; exclude?: string[] } = {},
): Match[] {
  const { limit = 3, exclude = [] } = options;
  const excludeSet = new Set(exclude);

  if (signals.length === 0) {
    return PEOPLE.filter((p) => !excludeSet.has(p.id))
      .slice(0, limit)
      .map((person) => ({ person, shared: [], score: 0 }));
  }

  const scored = PEOPLE.filter((p) => !excludeSet.has(p.id))
    .map((person) => {
      const shared = person.signals.filter((s) => signals.includes(s));
      return { person, shared, score: shared.length };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

// Legacy alias kept so older imports don't break during the transition.
export const findResonant = rankProfiles;
