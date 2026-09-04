import { useQuery } from "@tanstack/react-query";
import { ensureSessionsHydrated, listSessions, subscribeSessions } from "@/lib/sessions";
import { dataKeys, useRepoSubscription } from "./internal";

export function useSessions() {
  const query = useQuery({
    queryKey: dataKeys.sessions,
    queryFn: async () => {
      await ensureSessionsHydrated();
      return listSessions();
    },
    initialData: [],
  });
  useRepoSubscription(subscribeSessions, [dataKeys.sessions]);
  return query;
}
