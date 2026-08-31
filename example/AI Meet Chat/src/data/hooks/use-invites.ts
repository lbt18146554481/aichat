// Invites reads/writes for UI code.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repos } from "@/data";
import { dataKeys } from "./internal";

export function useValidateInvite() {
  return useMutation({
    mutationFn: (code: string) => repos.invites.validate(code),
  });
}

export function useMyInvites(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["data", "invites", userId ?? "_"],
    queryFn: () => (userId ? repos.invites.listMine(userId) : Promise.resolve([])),
    initialData: [],
    enabled: !!userId,
  });
}

export function useRemainingInvites(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["data", "invites", "remaining", userId ?? "_"],
    queryFn: () => (userId ? repos.invites.remaining(userId) : Promise.resolve(0)),
    initialData: 0,
    enabled: !!userId,
  });
}

export function useInviteActions() {
  const qc = useQueryClient();
  const refresh = useCallback(
    (userId: string) => {
      void qc.invalidateQueries({ queryKey: ["data", "invites", userId] });
      void qc.invalidateQueries({ queryKey: ["data", "invites", "remaining", userId] });
    },
    [qc],
  );

  const generate = useMutation({
    mutationFn: (userId: string) => repos.invites.generate(userId),
    onSuccess: (_result, userId) => refresh(userId),
  });

  return {
    generate: useCallback(
      async (userId: string) => {
        const result = await generate.mutateAsync(userId);
        return result;
      },
      [generate],
    ),
  };
}
