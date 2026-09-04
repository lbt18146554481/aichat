import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  hasUnseenFor,
  hydrateConnections,
  list,
  rehydrate,
  subscribe,
  type Connection,
} from "@/lib/connections";
import { dataKeys, useRepoSubscription } from "./internal";

export function useConnections(bootstrap = false) {
  const query = useQuery({
    queryKey: dataKeys.connections,
    queryFn: () => list(),
    initialData: [] as Connection[],
  });
  useRepoSubscription(subscribe, [dataKeys.connections]);
  useEffect(() => {
    if (!bootstrap) return;
    rehydrate();
    void hydrateConnections().then(() => {
      /* invalidation happens via subscribe after hydrate */
    });
  }, [bootstrap]);
  return query;
}

export function hasUnseenIn(items: Connection[]): boolean {
  return items.some((c) => hasUnseenFor(c));
}
