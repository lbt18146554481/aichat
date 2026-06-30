// Shared "what the system has learned about you" store.
//
// Both Agents (Matchmaker / Side by Side) read and write here. In addition
// to positive/negative signals + verbatim notes, this now stores the user's
// own Moments — their answers to a small set of moment prompts that get
// quoted back to them inside other people's "say hello" cards.

import { extractSignals } from "./conversation";

export interface UserMoment {
  promptId: string;
  answer: string;     // user's own words; stored as-is
  t: number;          // when answered
}

export interface UserUnderstanding {
  positive: string[];
  negative: string[];
  notes: string[];
  userMoments: UserMoment[];
}

export const EMPTY_UNDERSTANDING: UserUnderstanding = {
  positive: [],
  negative: [],
  notes: [],
  userMoments: [],
};

const KEY = "kindred:understanding.v1";

export function loadUnderstanding(): UserUnderstanding {
  if (typeof window === "undefined") return EMPTY_UNDERSTANDING;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_UNDERSTANDING;
    return { ...EMPTY_UNDERSTANDING, ...(JSON.parse(raw) as Partial<UserUnderstanding>) };
  } catch {
    return EMPTY_UNDERSTANDING;
  }
}

export function saveUnderstanding(u: UserUnderstanding) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* noop */ }
}

export function resetUnderstanding(): UserUnderstanding {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return EMPTY_UNDERSTANDING;
}

export function addUserMoment(u: UserUnderstanding, promptId: string, answer: string): UserUnderstanding {
  const trimmed = answer.trim();
  if (!trimmed) return u;
  const existing = u.userMoments.filter((m) => m.promptId !== promptId);
  return { ...u, userMoments: [...existing, { promptId, answer: trimmed, t: Date.now() }] };
}

// Update from a free-text user message. Returns { next, newPositives, newNegatives }.
export function digest(u: UserUnderstanding, text: string): {
  next: UserUnderstanding;
  newPositives: string[];
  newNegatives: string[];
} {
  const newPositives = extractSignals(text).filter((s) => !u.positive.includes(s));
  const newNegatives = inferNegatives(text).filter((s) => !u.negative.includes(s));

  const positive = [
    ...u.positive.filter((s) => !newNegatives.includes(s)),
    ...newPositives.filter((s) => !u.negative.includes(s) || newPositives.includes(s)),
  ];
  const negative = [
    ...u.negative.filter((s) => !newPositives.includes(s)),
    ...newNegatives,
  ];
  const fragment = text.trim().length > 80 ? text.trim().slice(0, 78) + "…" : text.trim();
  const notes = [...u.notes, fragment].slice(-6);

  return { next: { ...u, positive, negative, notes }, newPositives, newNegatives };
}

function inferNegatives(text: string): string[] {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  if (/\btoo (quiet|shy|introvert)/i.test(lower) || /太安静/.test(text)) out.add("quiet");
  if (/\btoo (loud|wild)/i.test(lower)) out.add("funny");
  if (/\btoo (serious|heavy|intense)/i.test(lower) || /太严肃|太沉重/.test(text)) out.add("ambitious");
  if (/\bless (ambitious|driven|career)/i.test(lower) || /不要太上进/.test(text)) out.add("ambitious");
  if (/\b(less|not so) outdoors/i.test(lower) || /不要.*户外/.test(text)) out.add("outdoors");
  return Array.from(out);
}

export function removePositive(u: UserUnderstanding, sig: string): UserUnderstanding {
  return { ...u, positive: u.positive.filter((s) => s !== sig) };
}
export function removeNegative(u: UserUnderstanding, sig: string): UserUnderstanding {
  return { ...u, negative: u.negative.filter((s) => s !== sig) };
}
