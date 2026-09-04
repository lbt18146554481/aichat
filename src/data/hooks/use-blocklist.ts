import { useQuery } from "@tanstack/react-query";
import { listBlocked, subscribe } from "@/lib/blocklist";
import { dataKeys, useRepoSubscription } from "./internal";

export function useBlocklist() {
  const query = useQuery({
    queryKey: dataKeys.blocklist,
    queryFn: () => listBlocked(),
    initialData: [] as string[],
  });
  useRepoSubscription(subscribe, [dataKeys.blocklist]);
  return query;
}
