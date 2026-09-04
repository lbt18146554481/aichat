import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPeopleFn } from "@/lib/api/data.functions";
import { setPeopleCache, getPersonById } from "@/lib/people-client";
import type { Person } from "@/lib/types";

export const peopleKeys = {
  all: ["data", "people"] as const,
  one: (id: string) => ["data", "people", id] as const,
};

/** Load the full people pool from the database into React Query + client cache. */
export function usePeopleBootstrap(): Person[] {
  const { data = [] } = useQuery({
    queryKey: peopleKeys.all,
    queryFn: async () => {
      const people = await listPeopleFn();
      if (people.length > 0) setPeopleCache(people);
      return people;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data.length > 0) setPeopleCache(data);
  }, [data]);

  return data;
}

export function usePerson(id: string | null | undefined): Person | null {
  const pool = usePeopleBootstrap();
  return useMemo(() => {
    if (!id) return null;
    return pool.find((p) => p.id === id) ?? null;
  }, [pool, id]);
}

/** Synchronous-style lookup after pool is hydrated (same as legacy getPersonById). */
export function usePeopleLookup(): (id: string) => Person | null {
  usePeopleBootstrap();
  return useMemo(() => (id: string) => getPersonById(id) ?? null, []);
}
