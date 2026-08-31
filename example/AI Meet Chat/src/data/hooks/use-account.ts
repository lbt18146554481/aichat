// Auth + blocklist + invites for UI code.

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import type { AuthProvider, AuthUser } from "@/lib/auth";
import { dataKeys, useRepoSubscription } from "./internal";

/** Session-shaped hook: same contract as the legacy useAuth(). */
export function useSession(): { user: AuthUser | null; hydrated: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let alive = true;
    void repos.auth.current().then((u) => {
      if (!alive) return;
      setUser(u);
      setHydrated(true);
    });
    const unsub = repos.auth.subscribe(setUser);
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return { user, hydrated };
}

export function useAuthActions() {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: dataKeys.auth });
    void qc.invalidateQueries({ queryKey: dataKeys.profile });
    void qc.invalidateQueries({ queryKey: dataKeys.invites });
  }, [qc]);

  const signIn = useMutation({
    mutationFn: (input: { provider: AuthProvider }) => repos.auth.signIn(input),
    onSuccess: () => refresh(),
  });

  const signUp = useMutation({
    mutationFn: (input: { provider: AuthProvider; inviteCode: string }) => repos.auth.signUp(input),
    onSuccess: () => refresh(),
  });

  const signOut = useMutation({
    mutationFn: () => repos.auth.signOut(),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries();
    },
  });

  return {
    signIn: useCallback(
      async (provider: AuthProvider) => {
        const user = await signIn.mutateAsync({ provider });
        return user;
      },
      [signIn],
    ),
    signUp: useCallback(
      async (provider: AuthProvider, inviteCode: string) => {
        const user = await signUp.mutateAsync({ provider, inviteCode });
        return user;
      },
      [signUp],
    ),
    signOut: useCallback(async () => {
      await signOut.mutateAsync();
    }, [signOut]),
  };
}

/** Account-level actions (iOS account deletion). */
export function useAccountActions() {
  const qc = useQueryClient();
  const deleteAll = useMutation({
    mutationFn: () => repos.auth.deleteAllData(),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
  return {
    deleteAllData: useCallback(async () => {
      await deleteAll.mutateAsync();
    }, [deleteAll]),
  };
}

export function useBlocklist() {
  const query = useQuery({
    queryKey: dataKeys.blocklist,
    queryFn: () => repos.blocklist.list(),
    initialData: [],
  });
  useRepoSubscription(repos.blocklist.subscribe, [
    dataKeys.blocklist,
    dataKeys.connections,
    dataKeys.savedPeople,
  ]);
  return query;
}

export function useModerationActions() {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: dataKeys.blocklist });
    void qc.invalidateQueries({ queryKey: dataKeys.connections });
    void qc.invalidateQueries({ queryKey: dataKeys.savedPeople });
  }, [qc]);

  return {
    block: useCallback(
      async (personId: string) => {
        await repos.blocklist.block(personId);
        refresh();
      },
      [refresh],
    ),
    unblock: useCallback(
      async (personId: string) => {
        await repos.blocklist.unblock(personId);
        refresh();
      },
      [refresh],
    ),
    report: useCallback(
      async (
        personId: string,
        reason: "spam" | "harassment" | "inappropriate" | "other",
        note?: string,
      ) => {
        await repos.blocklist.report({ personId, reason, note });
        refresh();
      },
      [refresh],
    ),
  };
}
