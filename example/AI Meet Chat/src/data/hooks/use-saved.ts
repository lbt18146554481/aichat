// Saved wishes + saved people for UI code.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import { dataKeys, useRepoSubscription } from "./internal";

export function useSavedWishes() {
  const query = useQuery({
    queryKey: dataKeys.savedWishes,
    queryFn: () => repos.saved.listWishes(),
    initialData: [],
  });
  useRepoSubscription(repos.saved.subscribe, [dataKeys.savedWishes, dataKeys.savedPeople]);
  return query;
}

export function useSavedPeople() {
  const query = useQuery({
    queryKey: dataKeys.savedPeople,
    queryFn: () => repos.saved.listPeople(),
    initialData: [],
  });
  useRepoSubscription(repos.saved.subscribe, [dataKeys.savedWishes, dataKeys.savedPeople]);
  return query;
}

export function useSavedActions() {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: dataKeys.savedWishes });
    void qc.invalidateQueries({ queryKey: dataKeys.savedPeople });
  }, [qc]);

  return {
    toggleWish: useCallback(
      async (intentId: string, sessionId: string) => {
        await repos.saved.toggleWish(intentId, sessionId);
        refresh();
      },
      [refresh],
    ),
    removeWish: useCallback(
      async (intentId: string) => {
        await repos.saved.removeWish(intentId);
        refresh();
      },
      [refresh],
    ),
    togglePerson: useCallback(
      async (personId: string, sessionId: string) => {
        await repos.saved.togglePerson(personId, sessionId);
        refresh();
      },
      [refresh],
    ),
    removePerson: useCallback(
      async (personId: string) => {
        await repos.saved.removePerson(personId);
        refresh();
      },
      [refresh],
    ),
  };
}
