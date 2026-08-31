// Sessions (history) reads/writes for UI code.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import type { Session, SessionAgent, SessionStatus } from "@/lib/sessions";
import { dataKeys } from "./internal";

export function useSessions() {
  return useQuery({
    queryKey: dataKeys.sessions,
    queryFn: () => repos.sessions.list(),
    initialData: [],
  });
}

/** Synchronous id → Session lookup, replacing direct `getSession()` calls. */
export function useSessionLookup(): (id: string | null | undefined) => Session | null {
  const items = useSessions().data;
  return useCallback((id) => (id ? (items.find((s) => s.id === id) ?? null) : null), [items]);
}

export function useSessionActions() {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: dataKeys.sessions });
  }, [qc]);

  return {
    create: useCallback(
      async (agent: SessionAgent, seed: string, initialState: unknown) => {
        const s = await repos.sessions.create(agent, seed, initialState);
        refresh();
        return s;
      },
      [refresh],
    ),
    update: useCallback(
      async (id: string, patch: { state?: unknown; status?: SessionStatus; seed?: string }) => {
        await repos.sessions.update(id, patch);
        refresh();
      },
      [refresh],
    ),
    revoke: useCallback(
      async (id: string) => {
        await repos.sessions.revoke(id);
        refresh();
      },
      [refresh],
    ),
  };
}
