// Local people directory — reads the seeded demo pool.

import { findSeedPerson, seedPeople } from "./fake/people";
import type { Page, PageQuery, PeopleRepo } from "@/data/ports";
import type { Person } from "@/lib/types";

export const people: PeopleRepo = {
  async get(id) {
    return findSeedPerson(id);
  },
  async getMany(ids) {
    const wanted = new Set(ids);
    return seedPeople.filter((p) => wanted.has(p.id));
  },
  async pool(query?: PageQuery): Promise<Page<Person>> {
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? seedPeople.length;
    const start = (page - 1) * pageSize;
    return {
      items: seedPeople.slice(start, start + pageSize),
      total: seedPeople.length,
      page,
      pageSize,
    };
  },
};
