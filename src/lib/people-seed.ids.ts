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

/**
 * Curated pool seeded into `premium_people`.
 * Currently mirrors the full seed set so both tables get every demo persona.
 */
export const PREMIUM_SEED_PERSON_IDS = SEED_PERSON_IDS;

export type SeedPersonId = (typeof SEED_PERSON_IDS)[number];
export type PremiumSeedPersonId = SeedPersonId;

export function isSeedPersonId(id: string): id is SeedPersonId {
  return (SEED_PERSON_IDS as readonly string[]).includes(id);
}

export function isPremiumSeedPersonId(id: string): id is PremiumSeedPersonId {
  return isSeedPersonId(id);
}

/** @deprecated Use isSeedPersonId */
export function isAiSeedPerson(personId: string): boolean {
  return isSeedPersonId(personId);
}
