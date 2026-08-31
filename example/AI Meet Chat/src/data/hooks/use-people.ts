// People directory hooks — the only way UI reads person records.
//
// Today resolves against the seeded pool instantly; with a remote adapter the
// same hooks fetch over the network. For render paths that need a person
// synchronously (lists of threads, cards), use usePeopleLookup: it warms the
// cache once and serves getPersonById-style lookups from it.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { repos } from "@/data";
import type { Person } from "@/lib/types";

const peopleKeys = {
  all: ["data", "people"] as const,
  one: (id: string) => ["data", "people", id] as const,
};

/** Read a single person by id. */
export function usePerson(id: string | null | undefined) {
  const { data } = useQuery({
    queryKey: peopleKeys.one(id ?? ""),
    queryFn: () => repos.people.get(id!),
    enabled: !!id,
    staleTime: Infinity, // the local pool is static; remote can tune later
  });
  return data ?? null;
}

/**
 * Synchronous-style lookup map for render paths that already assume the
 * person is known (thread rows, match cards). Prefetches the whole pool once
 * per session and hands out a stable getById function.
 *
 * Returns null for unknown ids, exactly like the old getPersonById.
 */
export function usePeopleLookup(): (id: string) => Person | null {
  const { data } = useQuery({
    queryKey: peopleKeys.all,
    queryFn: async () => (await repos.people.pool()).items,
    staleTime: Infinity,
  });
  const map = useMemo(() => {
    const m = new Map<string, Person>();
    (data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [data]);
  return useMemo(() => (id: string) => map.get(id) ?? null, [map]);
}
