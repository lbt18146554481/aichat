/**
 * Stable ids for demo AI personas inserted by `npm run db:seed`.
 * Use for pruning: `DELETE FROM people WHERE id = ANY($1)` or `scripts/db-prune-seed.ts`.
 */
export const SEED_PERSON_IDS = [
  "isa",
  "june",
  "theo",
  "mira",
  "hugo",
  "noa",
  "soren",
  "amara",
  "leo",
  "wren",
  "kai",
  "elena",
  "lin",
  "hao",
  "yue",
  "min",
] as const;

export type SeedPersonId = (typeof SEED_PERSON_IDS)[number];

export function isSeedPersonId(id: string): id is SeedPersonId {
  return (SEED_PERSON_IDS as readonly string[]).includes(id);
}

/** @deprecated Use isSeedPersonId */
export function isAiSeedPerson(personId: string): boolean {
  return isSeedPersonId(personId);
}
