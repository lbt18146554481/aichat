import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const dataKeys = {
  profile: ["data", "profile"] as const,
  connections: ["data", "connections"] as const,
  connection: (personId: string) => ["data", "connections", personId] as const,
  connectionTyping: (personId: string) => ["data", "connections", personId, "typing"] as const,
  sessions: ["data", "sessions"] as const,
  savedWishes: ["data", "saved", "wishes"] as const,
  savedPeople: ["data", "saved", "people"] as const,
  blocklist: ["data", "blocklist"] as const,
  intents: ["data", "intents"] as const,
};

type Unsubscribe = () => void;

/** Re-read a domain whenever its lib store emits a change. */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, subscribe]);
}
