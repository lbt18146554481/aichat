import type { Person } from "./types";

let byId = new Map<string, Person>();

/** Hydrate client-side person lookups after listPeopleFn. */
export function setPeopleCache(people: Person[]): void {
  byId = new Map(people.map((p) => [p.id, p]));
}

export function clearPeopleCache(): void {
  byId = new Map();
}

export function getPeoplePool(): Person[] {
  return [...byId.values()];
}

export function getPersonById(id: string): Person | undefined {
  return byId.get(id);
}
