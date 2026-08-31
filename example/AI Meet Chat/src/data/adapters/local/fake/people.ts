// Fake backend — the curated demo people pool.
//
// Everything in `adapters/local/fake/` exists only because there is no server
// yet. When the remote adapter goes live this whole folder is deleted; no page,
// component, hook or port signature changes with it.
//
// The arrays still physically live in src/lib/people.ts because a few domain
// modules (matchmaker scoring, seeded connections) read them synchronously.
// This module is the single seam the data layer uses, so moving the arrays here
// later is a one-file change.

import { PEOPLE } from "@/lib/people";
import type { Person } from "@/lib/types";

export const seedPeople: Person[] = PEOPLE;

export function findSeedPerson(id: string): Person | null {
  return seedPeople.find((p) => p.id === id) ?? null;
}
