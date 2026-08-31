// Connections (chat) reads/writes for UI code.

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import { hasUnseenFor, type Connection, type HelloFromMe } from "@/lib/connections";
import { dataKeys, useRepoSubscription } from "./internal";

/**
 * @param bootstrap resume adapter-side background work on mount (the old
 *   `rehydrate()` call sites pass true).
 */
export function useConnections(bootstrap = false) {
  const query = useQuery({
    queryKey: dataKeys.connections,
    queryFn: () => repos.connections.list(),
    initialData: [],
  });
  useRepoSubscription(repos.connections.subscribe, [dataKeys.connections]);
  const qc = useQueryClient();
  useEffect(() => {
    if (!bootstrap) return;
    void repos.connections.bootstrap().then(() => {
      void qc.invalidateQueries({ queryKey: dataKeys.connections });
    });
  }, [bootstrap, qc]);
  return query;
}

/** Does any thread have something the user hasn't seen? */
export function hasUnseenIn(items: Connection[]): boolean {
  return items.some((c) => hasUnseenFor(c));
}

export function useConnection(personId: string) {
  const query = useQuery({
    queryKey: dataKeys.connection(personId),
    queryFn: () => repos.connections.get(personId),
    initialData: null,
  });
  useRepoSubscription(repos.connections.subscribe, [
    dataKeys.connections,
    dataKeys.connection(personId),
  ]);
  return query;
}

/** Is the other side typing right now? Re-read on every repo change. */
export function useTyping(personId: string) {
  const query = useQuery({
    queryKey: ["data", "connections", personId, "typing"],
    queryFn: () => repos.connections.isTyping(personId),
    initialData: false,
  });
  useRepoSubscription(repos.connections.subscribe, [["data", "connections", personId, "typing"]]);
  return query;
}

/** Imperative connection actions — for event handlers. */
export function useConnectionActions() {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: dataKeys.connections });
  }, [qc]);

  return {
    sayHello: useCallback(
      async (personId: string, fromMe: HelloFromMe, originSessionId?: string) => {
        const conn = await repos.connections.sayHello(personId, fromMe, originSessionId);
        refresh();
        return conn;
      },
      [refresh],
    ),
    respond: useCallback(
      async (personId: string, fromMe: HelloFromMe) => {
        await repos.connections.respondToIncoming(personId, fromMe);
        refresh();
      },
      [refresh],
    ),
    dismiss: useCallback(
      async (personId: string) => {
        await repos.connections.dismissIncoming(personId);
        refresh();
      },
      [refresh],
    ),
    withdraw: useCallback(
      async (personId: string) => {
        await repos.connections.withdrawSent(personId);
        refresh();
      },
      [refresh],
    ),
    undoFaded: useCallback(
      async (personId: string) => {
        await repos.connections.undoFaded(personId);
        refresh();
      },
      [refresh],
    ),
    removeFaded: useCallback(
      async (personId: string) => {
        await repos.connections.removeFaded(personId);
        refresh();
      },
      [refresh],
    ),
    send: useCallback(
      async (personId: string, text: string) => {
        await repos.connections.send(personId, text);
        refresh();
      },
      [refresh],
    ),
    markSeen: useCallback(
      async (personId: string) => {
        await repos.connections.markSeen(personId);
        refresh();
      },
      [refresh],
    ),
  };
}
