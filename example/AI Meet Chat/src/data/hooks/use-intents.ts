// Intents (wishes) reads/writes for UI code.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import type { ActivityKind } from "@/lib/types";
import type { Intent } from "@/lib/intents";
import type { PublishIntentInput, UpdateIntentPatch } from "@/data/ports";
import { dataKeys } from "./internal";

export function useMyIntents() {
  return useQuery({
    queryKey: dataKeys.intents,
    queryFn: () => repos.intents.listMine(),
    initialData: [],
  });
}

export function useIntentPool() {
  return useQuery({
    queryKey: ["data", "intents", "pool"],
    queryFn: () => repos.intents.pool(),
    initialData: [],
  });
}

export function useIntent(intentId: string | null) {
  return useQuery({
    queryKey: ["data", "intents", intentId ?? "_"],
    queryFn: () => (intentId ? repos.intents.getById(intentId) : Promise.resolve(null)),
    initialData: null,
  });
}

/**
 * Synchronous id → Intent lookup, sourced from the data layer.
 *
 * Components used to call `getIntentById()` straight from src/lib; this keeps
 * the same call shape while the actual reads go through the repos.
 */
export function useIntentLookup(): (id: string | null | undefined) => Intent | null {
  const mine = useMyIntents().data;
  const pool = useIntentPool().data;
  return useCallback(
    (id) => {
      if (!id) return null;
      return mine.find((i) => i.id === id) ?? pool.find((i) => i.id === id) ?? null;
    },
    [mine, pool],
  );
}

export function useIntentActions() {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: dataKeys.intents });
  }, [qc]);

  const publish = useMutation({
    mutationFn: (input: PublishIntentInput) => repos.intents.publish(input),
    onSuccess: () => refresh(),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateIntentPatch }) =>
      repos.intents.update(id, patch),
    onSuccess: () => refresh(),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => repos.intents.revoke(id),
    onSuccess: () => refresh(),
  });

  return {
    publish: useCallback(
      async (input: PublishIntentInput) => {
        const result = await publish.mutateAsync(input);
        return result;
      },
      [publish],
    ),
    update: useCallback(
      async (id: string, patch: UpdateIntentPatch) => {
        const result = await update.mutateAsync({ id, patch });
        return result;
      },
      [update],
    ),
    revoke: useCallback(
      async (id: string) => {
        await revoke.mutateAsync(id);
      },
      [revoke],
    ),
  };
}
