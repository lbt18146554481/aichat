import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSaved, subscribeSaved } from "@/lib/saved-intents";
import { listSavedPeople, subscribeSavedPeople } from "@/lib/saved-people";
import { dataKeys, useRepoSubscription } from "./internal";

function subscribeSavedAll(fn: () => void) {
  const a = subscribeSaved(fn);
  const b = subscribeSavedPeople(fn);
  return () => {
    a();
    b();
  };
}

export function useSavedWishes() {
  const query = useQuery({
    queryKey: dataKeys.savedWishes,
    queryFn: () => listSaved(),
    initialData: [],
  });
  useRepoSubscription(subscribeSavedAll, [dataKeys.savedWishes, dataKeys.savedPeople]);
  return query;
}

export function useSavedPeople() {
  const query = useQuery({
    queryKey: dataKeys.savedPeople,
    queryFn: () => listSavedPeople(),
    initialData: [],
  });
  useRepoSubscription(subscribeSavedAll, [dataKeys.savedWishes, dataKeys.savedPeople]);
  return query;
}

/** Ensure saved stores are hydrated once hooks mount (after auth cascade). */
export function useSavedBootstrap() {
  useEffect(() => {
    void import("@/lib/saved-intents").then((m) => m.hydrateSavedIntents());
    void import("@/lib/saved-people").then((m) => m.hydrateSavedPeople());
  }, []);
}
