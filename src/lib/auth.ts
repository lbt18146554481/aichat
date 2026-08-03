// Frontend-only auth demo layer.
//
// SCOPE: This is a demo store. Backend/real Supabase wiring is handled by
// the user separately. Everything here lives in localStorage so the UI can
// be built and exercised end-to-end without touching servers.
//
// v1 shape (email/password removed):
//   - Sign in / Sign up only through Google / Apple (WeChat placeholder).
//   - Sign up REQUIRES a valid invite code (validated up front, consumed
//     after the OAuth "success").
//   - Sign in on a fresh browser (no local user yet) throws
//     `account_not_found` so the UI can route the visitor to signup.

import { useEffect, useState } from "react";
import { consumeInvite, validateInvite } from "./invites";

export type AuthProvider = "google" | "apple" | "wechat";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string; // data URL or empty
  provider: AuthProvider | "email"; // "email" kept only to read legacy storage
  createdAt: number;
}

const KEY = "kindred:auth.v1";

type Listener = (u: AuthUser | null) => void;
const listeners = new Set<Listener>();

function uid(): string {
  return "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeUser(u: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (u) window.localStorage.setItem(KEY, JSON.stringify(u));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  listeners.forEach((fn) => fn(u));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Simulate network latency so buttons show a proper loading state. */
function delay(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function providerEmail(provider: AuthProvider): string {
  if (provider === "google") return "you@gmail.com";
  if (provider === "apple") return "you@icloud.com";
  return "you@wechat.app";
}

// -- Sign in ---------------------------------------------------------------

export interface SignInInput {
  provider: AuthProvider;
}

export async function signIn(input: SignInInput): Promise<AuthUser> {
  if (input.provider === "wechat") {
    throw new AuthError("wechat_unavailable", "WeChat sign-in is coming soon.");
  }
  await delay(600);
  const existing = loadUser();
  if (!existing) {
    // v1 rule: sign-in on a fresh device without an account routes the
    // visitor to invite-gated signup instead of silently provisioning one.
    throw new AuthError(
      "account_not_found",
      "No account yet. Join with an invite code to create one.",
    );
  }
  return existing;
}

// -- Sign up ---------------------------------------------------------------

export interface SignUpInput {
  provider: AuthProvider;
  inviteCode: string;
}

export async function signUp(input: SignUpInput): Promise<AuthUser> {
  const code = input.inviteCode.trim().toUpperCase();
  if (!code) throw new AuthError("invite_required", "Invite code is required.");
  // Validate BEFORE the OAuth round-trip so we never burn the network hop
  // (or later, a real invite) on a code the pool has already used.
  if (!validateInvite(code)) {
    throw new AuthError("invite_invalid", "That invite code isn't valid or has been used.");
  }
  if (input.provider === "wechat") {
    throw new AuthError("wechat_unavailable", "WeChat sign-in is coming soon.");
  }
  await delay(600);
  // Consume only after the "OAuth" call succeeds.
  const ok = consumeInvite(code);
  if (!ok) throw new AuthError("invite_invalid", "That invite code isn't valid or has been used.");
  const email = providerEmail(input.provider);
  const user: AuthUser = {
    id: uid(),
    email,
    name: email.split("@")[0],
    avatar: "",
    provider: input.provider,
    createdAt: Date.now(),
  };
  writeUser(user);
  return user;
}

export function signOut() {
  writeUser(null);
}

// -- React hook ------------------------------------------------------------

export function useAuth(): { user: AuthUser | null; hydrated: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setUser(loadUser());
    setHydrated(true);
    const unsub = subscribe(setUser);
    return unsub;
  }, []);
  return { user, hydrated };
}
