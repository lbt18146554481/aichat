// Shared plumbing for the data hooks.
//
// The pattern is deliberately boring: a TanStack Query read keyed per
// domain, plus a repo subscription that invalidates that key. Local adapters
// resolve synchronously-ish today; a remote adapter changes nothing here.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Unsubscribe } from "@/data";

export const dataKeys = {
  profile: ["data", "profile"] as const,
  auth: ["data", "auth"] as const,
  connections: ["data", "connections"] as const,
  connection: (personId: string) => ["data", "connections", personId] as const,
  sessions: ["data", "sessions"] as const,
  intents: ["data", "intents"] as const,
  savedWishes: ["data", "saved", "wishes"] as const,
  savedPeople: ["data", "saved", "people"] as const,
  blocklist: ["data", "blocklist"] as const,
  invites: ["data", "invites"] as const,
};

/** Re-read a domain whenever its repo says the underlying data changed. */
export function useRepoSubscription(
  subscribe: (fn: () => void) => Unsubscribe,
  keys: ReadonlyArray<readonly unknown[]>,
) {
  const qc = useQueryClient();
  useEffect(() => {
    const unsub = subscribe(() => {
      keys.forEach((key) => {
        void qc.invalidateQueries({ queryKey: key });
      });
    });
    return unsub;
    // `keys` is a stable literal at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, subscribe]);
}
