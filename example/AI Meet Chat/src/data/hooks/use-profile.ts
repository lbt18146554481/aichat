// Profile reads/writes for UI code. Replaces direct
// `loadProfile()` / `saveProfile()` calls inside components.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { dataKeys, useRepoSubscription } from "./internal";

export function useProfile() {
  const query = useQuery({
    queryKey: dataKeys.profile,
    queryFn: () => repos.profile.load(),
    initialData: EMPTY_PROFILE,
  });
  useRepoSubscription(repos.profile.subscribe, [dataKeys.profile]);
  return query;
}

export function useSaveProfile() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (p: Profile) => repos.profile.save(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.profile });
    },
  });
  return useCallback((p: Profile) => mutation.mutateAsync(p), [mutation]);
}
