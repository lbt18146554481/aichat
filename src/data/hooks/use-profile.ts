import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@/lib/profile-shape";
import { hydrateProfile, loadProfile, subscribeProfile } from "@/lib/profile";
import { dataKeys } from "./internal";

export function useProfile() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: dataKeys.profile,
    queryFn: async (): Promise<Profile> => {
      await hydrateProfile();
      return loadProfile();
    },
    initialData: () => loadProfile(),
    staleTime: 30_000,
  });

  // Sync cache updates from saveProfile — must NOT invalidate here or
  // hydrateProfile's emit() creates a fetch loop with queryFn.
  useEffect(() => {
    return subscribeProfile(() => {
      qc.setQueryData(dataKeys.profile, loadProfile());
    });
  }, [qc]);

  return query;
}
