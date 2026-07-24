// Frontend-only auth demo layer.
//
// SCOPE: This is a demo store. Backend/real Supabase wiring is handled by
// the user separately. Everything here lives in localStorage so the UI can
// be built and exercised end-to-end without touching servers.
//
// Public API is intentionally small so swapping in a real backend later
// only means rewriting this file:
//   - loadUser() / subscribe()
//   - signIn({ provider|email, password })
//   - signUp({ email, password, name, inviteCode, provider })
//   - signOut()
//   - useAuth()          — React hook backed by subscribe()

import { useEffect, useState } from "react";
import { consumeInvite } from "./invites";

export type AuthProvider = "google" | "apple" | "wechat" | "email";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;       // data URL or empty
  provider: AuthProvider;
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
  } catch { return null; }
}

function writeUser(u: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (u) window.localStorage.setItem(KEY, JSON.stringify(u));
    else window.localStorage.removeItem(KEY);
  } catch { /* noop */ }
  listeners.forEach((fn) => fn(u));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Simulate network latency so buttons show a proper loading state. */
function delay(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

export class AuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// -- Sign in ---------------------------------------------------------------

export interface SignInInput {
  provider: AuthProvider;
  email?: string;
  password?: string;
}

export async function signIn(input: SignInInput): Promise<AuthUser> {
  await delay(600);
  if (input.provider === "wechat") {
    throw new AuthError("wechat_unavailable", "WeChat sign-in is coming soon.");
  }
  const existing = loadUser();
  if (existing) return existing; // demo: only one account slot
  // Demo user shape.
  const email =
    input.email?.trim() ||
    (input.provider === "google" ? "you@gmail.com"
      : input.provider === "apple" ? "you@icloud.com"
      : "you@kindred.app");
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

// -- Sign up ---------------------------------------------------------------

export interface SignUpInput {
  provider: AuthProvider;
  inviteCode: string;
  email?: string;
  password?: string;
  name?: string;
}

export async function signUp(input: SignUpInput): Promise<AuthUser> {
  const code = input.inviteCode.trim();
  if (!code) throw new AuthError("invite_required", "Invite code is required.");
  await delay(600);
  const ok = consumeInvite(code);
  if (!ok) throw new AuthError("invite_invalid", "That invite code isn't valid or has been used.");
  if (input.provider === "wechat") {
    throw new AuthError("wechat_unavailable", "WeChat sign-in is coming soon.");
  }
  const email =
    input.email?.trim() ||
    (input.provider === "google" ? "you@gmail.com"
      : input.provider === "apple" ? "you@icloud.com"
      : "you@kindred.app");
  const user: AuthUser = {
    id: uid(),
    email,
    name: (input.name?.trim() || email.split("@")[0]),
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
