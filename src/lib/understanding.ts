/**
 * Soft preference fields for Matchmaker ("who they want"), not the seeker's self-profile.
 * `positive` remains a merged bag for legacy callers (angles / reasons).
 */

import { extractSignals } from "./conversation";
import { getPrefsFn, savePrefsFn } from "./api/data.functions";

export interface UserUnderstanding {
  /** @deprecated Prefer traits / interests / occupation / pace — kept as merged bag. */
  positive: string[];
  negative: string[];
  notes: string[];
  /** Desired personality traits (e.g. 安静, 幽默). */
  traits?: string[];
  /** Desired interests (e.g. 徒步, 读书). */
  interests?: string[];
  /** Desired life stage / work (e.g. 设计师, 在上学). */
  occupation?: string[];
  /** Desired pace / vibe (e.g. 慢热, 话少). */
  pace?: string[];
}

export const EMPTY_UNDERSTANDING: UserUnderstanding = {
  positive: [],
  negative: [],
  notes: [],
  traits: [],
  interests: [],
  occupation: [],
  pace: [],
};

export function softPrefLists(u: UserUnderstanding): {
  traits: string[];
  interests: string[];
  occupation: string[];
  pace: string[];
} {
  return {
    traits: (u.traits ?? []).map((s) => s.trim()).filter(Boolean),
    interests: (u.interests ?? []).map((s) => s.trim()).filter(Boolean),
    occupation: (u.occupation ?? []).map((s) => s.trim()).filter(Boolean),
    pace: (u.pace ?? []).map((s) => s.trim()).filter(Boolean),
  };
}

/** True when any structured soft preference (or legacy positive) is present. */
export function softPrefsPresent(u: UserUnderstanding): boolean {
  const s = softPrefLists(u);
  return (
    s.traits.length > 0 ||
    s.interests.length > 0 ||
    s.occupation.length > 0 ||
    s.pace.length > 0 ||
    u.positive.length > 0
  );
}

/** Rebuild legacy `positive` from structured soft fields (+ optional extra likes). */
export function mergePositiveBag(
  u: Pick<UserUnderstanding, "traits" | "interests" | "occupation" | "pace">,
  extra: string[] = [],
): string[] {
  return [
    ...new Set(
      [
        ...(u.traits ?? []),
        ...(u.interests ?? []),
        ...(u.occupation ?? []),
        ...(u.pace ?? []),
        ...extra,
      ]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 24);
}

export function normalizeUnderstandingShape(
  raw: Partial<UserUnderstanding> | null | undefined,
): UserUnderstanding {
  const traits = (raw?.traits ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const interests = (raw?.interests ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const occupation = (raw?.occupation ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const pace = (raw?.pace ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const negative = (raw?.negative ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const notes = (raw?.notes ?? []).map((s) => s.trim()).filter(Boolean).slice(-6);
  const legacyPositive = (raw?.positive ?? []).map((s) => s.trim()).filter(Boolean);
  const positive = mergePositiveBag({ traits, interests, occupation, pace }, legacyPositive);
  return { positive, negative, notes, traits, interests, occupation, pace };
}

let cache: UserUnderstanding = { ...EMPTY_UNDERSTANDING };

export function loadUnderstanding(): UserUnderstanding {
  return cache;
}

export function saveUnderstanding(u: UserUnderstanding) {
  cache = normalizeUnderstandingShape(u);
  void savePrefsFn({ data: { understanding: cache as unknown as Record<string, unknown> } }).catch(
    console.error,
  );
}

export function resetUnderstanding(): UserUnderstanding {
  cache = { ...EMPTY_UNDERSTANDING };
  void savePrefsFn({ data: { understanding: null } }).catch(console.error);
  return cache;
}

export async function hydrateUnderstanding() {
  try {
    const prefs = await getPrefsFn();
    if (prefs.understanding) {
      cache = normalizeUnderstandingShape(prefs.understanding as unknown as UserUnderstanding);
    }
  } catch {
    /* ignore */
  }
  return cache;
}

export function digest(
  u: UserUnderstanding,
  text: string,
): {
  next: UserUnderstanding;
  newPositives: string[];
  newNegatives: string[];
} {
  const base = normalizeUnderstandingShape(u);
  const newPositives = extractSignals(text).filter((s) => !base.positive.includes(s));
  const newNegatives = inferNegatives(text).filter((s) => !base.negative.includes(s));

  const positive = [
    ...base.positive.filter((s) => !newNegatives.includes(s)),
    ...newPositives.filter((s) => !base.negative.includes(s) || newPositives.includes(s)),
  ];
  const negative = [...base.negative.filter((s) => !newPositives.includes(s)), ...newNegatives];
  const fragment = text.trim().length > 80 ? text.trim().slice(0, 78) + "…" : text.trim();
  const notes = [...base.notes, fragment].slice(-6);

  return {
    next: normalizeUnderstandingShape({ ...base, positive, negative, notes }),
    newPositives,
    newNegatives,
  };
}

function inferNegatives(text: string): string[] {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  if (/\btoo (quiet|shy|introvert)/i.test(lower) || /太安静/.test(text)) out.add("quiet");
  if (/\btoo (loud|wild)/i.test(lower)) out.add("funny");
  if (/\btoo (serious|heavy|intense)/i.test(lower) || /太严肃|太沉重/.test(text))
    out.add("ambitious");
  if (/\bless (ambitious|driven|career)/i.test(lower) || /不要太上进/.test(text))
    out.add("ambitious");
  if (/\b(less|not so) outdoors/i.test(lower) || /不要.*户外/.test(text)) out.add("outdoors");
  return Array.from(out);
}

export function removePositive(u: UserUnderstanding, sig: string): UserUnderstanding {
  const next = normalizeUnderstandingShape(u);
  const strip = (arr: string[] | undefined) => (arr ?? []).filter((s) => s !== sig);
  return normalizeUnderstandingShape({
    ...next,
    positive: next.positive.filter((s) => s !== sig),
    traits: strip(next.traits),
    interests: strip(next.interests),
    occupation: strip(next.occupation),
    pace: strip(next.pace),
  });
}

export function removeNegative(u: UserUnderstanding, sig: string): UserUnderstanding {
  return normalizeUnderstandingShape({
    ...u,
    negative: (u.negative ?? []).filter((s) => s !== sig),
  });
}
