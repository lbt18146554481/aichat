// Why this person — every reason must point back at a real source.
//
// Three (and only three) sources are allowed:
//   1. same city   → Profile.city  ↔ person.city
//   2. you said    → what the user actually typed in the left chat
//                    (UserUnderstanding.notes) ↔ one of the person's own
//                    Moments (their own words)
//   3. shared      → Profile.interests ↔ person.signals, and
//                    Profile.favorites ↔ person.favorites (same title)
//
// If none hold we return an empty array — the UI then asks the user to say
// one more thing in the chat instead of inventing a reason.

import type { Person } from "./types";
import type { Profile } from "./profile";
import type { UserUnderstanding } from "./understanding";
import type { Lang } from "./i18n";

export type Reason =
  | { kind: "same_city"; city: string }
  | { kind: "you_said"; yours: string; theirs: string }
  | { kind: "shared"; signals: string[]; titles: string[] };

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","is","am","are","was","were","be",
  "i","you","he","she","it","we","they","my","your","his","her","its","our","their","me","him","us","them",
  "this","that","these","those","do","does","did","have","has","had","not","no","yes","so","if","than","then",
  "as","by","from","just","like","when","where","why","how","what","which","who","someone","people","person",
  "的","了","和","或","也","在","是","就","都","会","要","不","没","有","得","着","与","及","但","我","你","他","她","想","找","个","人",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[—.,;:!?'"()[\]{}…/\\]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared++; });
  return shared / (a.size + b.size - shared);
}

function clip(text: string, max = 64): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

function sameCity(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  return norm(a).length > 0 && norm(a) === norm(b);
}

export function buildReasons(
  person: Person,
  profile: Profile,
  understanding: UserUnderstanding,
  lang: Lang,
): Reason[] {
  const zh = lang === "zh-CN";
  const out: Reason[] = [];

  // 1 — same city (structural fact on both sides)
  const personCity = zh ? person.city_zh : person.city;
  if (sameCity(profile.city, person.city) || sameCity(profile.city, person.city_zh)) {
    out.push({ kind: "same_city", city: personCity });
  }

  // 2 — something the user said matched something the person wrote
  const notes = (understanding.notes ?? []).filter((n) => n.trim().length > 0);
  let best: { yours: string; theirs: string; score: number } | null = null;
  for (const note of notes.slice(-6)) {
    const nt = tokens(note);
    for (const m of person.moments) {
      const theirs = zh ? m.answer_zh : m.answer;
      const score = overlap(nt, tokens(theirs));
      if (score > 0 && (!best || score > best.score)) {
        best = { yours: clip(note), theirs: clip(theirs, 88), score };
      }
    }
  }
  if (best) out.push({ kind: "you_said", yours: best.yours, theirs: best.theirs });

  // 3 — shared interests / shared favorite works
  const mine = new Set((profile.interests ?? []).map((s) => s.toLowerCase()));
  const signals = person.signals.filter((s) => mine.has(s.toLowerCase())).slice(0, 4);
  const myTitles = new Map(
    profile.favorites
      .filter((f) => f.title.trim().length > 0)
      .map((f) => [f.title.trim().toLowerCase(), f.title.trim()] as const),
  );
  const titles: string[] = [];
  for (const f of person.favorites ?? []) {
    for (const cand of [f.title, f.title_zh]) {
      const key = cand?.trim().toLowerCase();
      if (key && myTitles.has(key) && !titles.includes(myTitles.get(key)!)) {
        titles.push(myTitles.get(key)!);
      }
    }
  }
  if (signals.length > 0 || titles.length > 0) {
    out.push({ kind: "shared", signals, titles: titles.slice(0, 2) });
  }

  return out.slice(0, 3);
}
