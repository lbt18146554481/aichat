import { extractSignals } from "./conversation";
import { getPrefsFn, savePrefsFn } from "./api/data.functions";

export interface UserUnderstanding {
  positive: string[];
  negative: string[];
  notes: string[];
}

export const EMPTY_UNDERSTANDING: UserUnderstanding = {
  positive: [],
  negative: [],
  notes: [],
};

let cache: UserUnderstanding = { ...EMPTY_UNDERSTANDING };

export function loadUnderstanding(): UserUnderstanding {
  return cache;
}

export function saveUnderstanding(u: UserUnderstanding) {
  cache = u;
  void savePrefsFn({ data: { understanding: u as unknown as Record<string, unknown> } }).catch(
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
      cache = { ...EMPTY_UNDERSTANDING, ...(prefs.understanding as UserUnderstanding) };
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
  const newPositives = extractSignals(text).filter((s) => !u.positive.includes(s));
  const newNegatives = inferNegatives(text).filter((s) => !u.negative.includes(s));

  const positive = [
    ...u.positive.filter((s) => !newNegatives.includes(s)),
    ...newPositives.filter((s) => !u.negative.includes(s) || newPositives.includes(s)),
  ];
  const negative = [...u.negative.filter((s) => !newPositives.includes(s)), ...newNegatives];
  const fragment = text.trim().length > 80 ? text.trim().slice(0, 78) + "…" : text.trim();
  const notes = [...u.notes, fragment].slice(-6);

  return { next: { ...u, positive, negative, notes }, newPositives, newNegatives };
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
  return { ...u, positive: u.positive.filter((s) => s !== sig) };
}
export function removeNegative(u: UserUnderstanding, sig: string): UserUnderstanding {
  return { ...u, negative: u.negative.filter((s) => s !== sig) };
}
