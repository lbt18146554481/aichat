// Auth client — talks to server via createServerFn; session is httpOnly cookie.

import { useEffect, useState } from "react";
import {
  meFn,
  signInFn,
  signUpFn,
  signOutFn,
  deleteAccountFn,
} from "./api/auth.functions";
import { clearLocalModerationData } from "./blocklist";
import { AuthError, type AuthUser } from "./auth-types";
import { asAuthError } from "./auth-errors";

export type { AuthUser };
export type AuthProvider = "email";
export { AuthError, asAuthError };
export { authErrorMessage } from "./auth-errors";

type Listener = (u: AuthUser | null) => void;
const listeners = new Set<Listener>();
let cachedUser: AuthUser | null = null;
let hydratedOnce = false;

function emit(u: AuthUser | null) {
  cachedUser = u;
  listeners.forEach((fn) => fn(u));
}

export function loadUser(): AuthUser | null {
  return cachedUser;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signIn(input: SignInInput): Promise<AuthUser> {
  try {
    const user = await signInFn({ data: input });
    emit(user);
    await refreshUser();
    return user;
  } catch (e) {
    throw asAuthError(e);
  }
}

export interface SignUpInput {
  email: string;
  password: string;
  inviteCode: string;
  name?: string;
}

export async function signUp(input: SignUpInput): Promise<AuthUser> {
  try {
    const user = await signUpFn({ data: input });
    emit(user);
    await refreshUser();
    return user;
  } catch (e) {
    throw asAuthError(e);
  }
}

export async function signOut() {
  try {
    await signOutFn();
  } finally {
    emit(null);
  }
}

export async function deleteAccount() {
  try {
    await deleteAccountFn();
  } finally {
    clearLocalModerationData();
    emit(null);
  }
}

export async function refreshUser(): Promise<AuthUser | null> {
  try {
    const user = await meFn();
    emit(user);
    if (user) {
      // Hydrate server-backed stores for this session
      void import("./profile").then((m) => m.hydrateProfile());
      void import("./sessions").then((m) => m.hydrateSessions());
      void import("./saved-people").then((m) => m.hydrateSavedPeople());
      void import("./saved-intents").then((m) => m.hydrateSavedIntents());
      void import("./understanding").then((m) => m.hydrateUnderstanding());
      void import("./agent-memory").then((m) => m.hydrateAgentMemory());
      void import("./connections").then((m) => m.hydrateConnections());
      void import("./intents").then((m) => m.hydrateMyIntents());
    }
    return user;
  } catch {
    emit(null);
    return null;
  }
}

export function useAuth(): { user: AuthUser | null; hydrated: boolean } {
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const [hydrated, setHydrated] = useState(hydratedOnce);

  useEffect(() => {
    const unsub = subscribe(setUser);
    let cancelled = false;
    (async () => {
      try {
        const u = await refreshUser();
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) {
          emit(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          hydratedOnce = true;
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { user, hydrated };
}
