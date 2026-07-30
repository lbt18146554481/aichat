// Why this person — every reason must quote a real source.
//
// Three (and only three) kinds, all traceable back to text a human wrote:
//   1. you_said  → what the user typed in the left chat (UserUnderstanding
//                  .notes) ↔ one of this person's public Moments.
//   2. favorite  → a work BOTH sides listed under Favorites.
//   3. values    → one of this person's "values" Moments (defend /
//                  remembered), shown only when it actually overlaps with
//                  something the user said they're looking for.
//
// No interest tags, no system-authored blurbs, no city small talk. If
// nothing holds we return an empty array and the UI says so honestly.

import type { Person } from "./types";
import type { Profile } from "./profile";
import type { UserUnderstanding } from "./understanding";
import type { Lang } from "./i18n";
import { getMomentPromptById } from "./questions";

export type Reason =
  | { kind: "you_said"; yours: string; theirs: string; prompt: string | null }
  | { kind: "favorite"; title: string; theirWhy: string }
  | { kind: "values"; prompt: string; theirs: string };

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","is","am","are","was","were","be",
  "i","you","he","she","it","we","they","my","your","his","her","its","our","their","me","him","us","them",
  "this","that","these","those","do","does","did","have","has","had","not","no","yes","so","if","than","then",
  "as","by","from","just","like","when","where","why","how","what","which","who","someone","people","person",
  "want","looking","really","very","much","would","could","should","one","get","go","make","think","feel",
  "的","了","和","或","也","在","是","就","都","会","要","不","没","有","得","着","与","及","但","我","你","他","她","想","找","个","人","很","更","那","这","能","可以",
]);

/** Word-ish tokens. CJK has no spaces, so we also emit character bigrams —
 *  a single shared character is noise, two in a row is a real word. */
/** Crude stem so "reads" / "reading" / "read" count as the same word.
 *  Deliberately conservative — we're matching real words, not guessing. */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  const clean = text.toLowerCase().replace(/[—.,;:!?'"“”‘’()[\]{}…/\\、。，！？：；]/g, " ");
  for (const w of clean.split(/\s+/)) {
    if (w.length > 1 && !STOP.has(w) && !/^[\u4e00-\u9fff]+$/.test(w)) out.add(stem(w));
  }
  const cjk = clean.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i + 1 < cjk.length; i++) {
    const bigram = cjk.slice(i, i + 2);
    if (!STOP.has(bigram)) out.add(bigram);
  }
  return out;
}


function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  a.forEach((w) => { if (b.has(w)) n++; });
  return n;
}

function clip(text: string, max = 72): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

function normTitle(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildReasons(
  person: Person,
  profile: Profile,
  understanding: UserUnderstanding,
  lang: Lang,
): Reason[] {
  const zh = lang === "zh-CN";
  const out: Reason[] = [];

  const notes = (understanding.notes ?? []).filter((n) => n.trim().length > 0).slice(-6);
  const wantText = [...notes, ...(understanding.positive ?? [])].join(" ");
  const wantTokens = tokens(wantText);

  // 1 — something the user said ↔ something this person wrote.
  let best: { yours: string; theirs: string; promptId: string; score: number } | null = null;
  for (const note of notes) {
    const nt = tokens(note);
    for (const m of person.moments) {
      const theirs = zh ? m.answer_zh : m.answer;
      const score = sharedCount(nt, tokens(theirs));
      if (score >= 1 && (!best || score > best.score)) {
        best = { yours: clip(note), theirs: clip(theirs, 96), promptId: m.promptId, score };
      }
    }
  }
  if (best) {
    const p = getMomentPromptById(best.promptId);
    out.push({
      kind: "you_said",
      yours: best.yours,
      theirs: best.theirs,
      prompt: p ? (zh ? p.text_zh : p.text) : null,
    });
  }

  // 2 — a work you BOTH listed.
  const mine = new Map<string, string>();
  for (const f of profile.favorites ?? []) {
    const key = normTitle(f.title);
    if (key) mine.set(key, f.title.trim());
  }
  for (const f of person.favorites ?? []) {
    for (const cand of [f.title, f.title_zh]) {
      const key = normTitle(cand);
      if (key && mine.has(key)) {
        out.push({
          kind: "favorite",
          title: mine.get(key)!,
          theirWhy: clip(zh ? f.why_zh : f.why, 96),
        });
        break;
      }
    }
    if (out.some((r) => r.kind === "favorite")) break;
  }

  // 3 — one of their values answers, but only if it echoes what you asked for.
  if (wantTokens.size > 0) {
    let bestValue: { prompt: string; theirs: string; score: number } | null = null;
    for (const m of person.moments) {
      const p = getMomentPromptById(m.promptId);
      if (!p || p.tier !== "values") continue;
      const theirs = zh ? m.answer_zh : m.answer;
      if (best && clip(theirs, 96) === best.theirs) continue; // don't repeat reason 1
      const score = sharedCount(wantTokens, tokens(theirs));
      if (score >= 1 && (!bestValue || score > bestValue.score)) {
        bestValue = { prompt: zh ? p.text_zh : p.text, theirs: clip(theirs, 96), score };
      }
    }
    if (bestValue) out.push({ kind: "values", prompt: bestValue.prompt, theirs: bestValue.theirs });
  }

  return out.slice(0, 3);
}
