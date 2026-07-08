// Side by Side — waitlist storage. Kept intentionally tiny and SSR-safe.
//
// Each entry captures a stated intent that had no match at the time.
// Later, if the user re-asks for the same thing and still gets no match,
// the agent can recall that we've already logged it.

import type { ActivityKind } from "./types";
import type { LevelTier, UserIntent, WhenTier } from "./agents/side-by-side";

export interface WaitEntry {
  id: string;
  kind: ActivityKind;
  when?: WhenTier;
  level?: LevelTier;
  addedAt: number;
}

const KEY = "kindred:sidebyside.waitlist.v1";

export function intentId(intent: UserIntent): string {
  return `${intent.kind}|${intent.when ?? "*"}|${intent.level ?? "*"}`;
}

export function loadWaitlist(): WaitEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WaitEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWaitlist(entries: WaitEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* noop */
  }
}

export function hasEntry(intent: UserIntent): boolean {
  const id = intentId(intent);
  return loadWaitlist().some((e) => e.id === id);
}

export function addEntry(intent: UserIntent): WaitEntry[] {
  const id = intentId(intent);
  const now = Date.now();
  const existing = loadWaitlist();
  if (existing.some((e) => e.id === id)) return existing;
  const next: WaitEntry[] = [
    ...existing,
    { id, kind: intent.kind, when: intent.when, level: intent.level, addedAt: now },
  ];
  saveWaitlist(next);
  return next;
}

export function waitlistCount(): number {
  return loadWaitlist().length;
}
