import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hydrateMyIntents, loadMyIntents, subscribeMyIntents } from "@/lib/intents";
import { dataKeys } from "./internal";

export function useMyIntents(bootstrap = false) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: dataKeys.intents,
    queryFn: async () => {
      await hydrateMyIntents();
      return loadMyIntents();
    },
    initialData: () => loadMyIntents(),
    staleTime: 30_000,
    enabled: bootstrap,
  });

  // Local publish/revoke updates — setQueryData only; invalidating here loops with queryFn.
  useEffect(() => {
    return subscribeMyIntents(() => {
      qc.setQueryData(dataKeys.intents, loadMyIntents());
    });
  }, [qc]);

  useEffect(() => {
    if (!bootstrap) return;
    void hydrateMyIntents().then(() => {
      qc.setQueryData(dataKeys.intents, loadMyIntents());
    });
  }, [bootstrap, qc]);

  return query;
}
