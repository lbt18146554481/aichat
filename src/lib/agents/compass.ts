// Compass — Agent for path C: values / worldview alignment.
//
// The Agent asks ONE open-ended life question at a time. The user answers
// in their own words. Compass then searches the pool for someone whose
// answer to the SAME question resonates — and presents both answers
// SIDE BY SIDE, in both people's own voices, BEFORE revealing identity.
//
// Resonance is a simple front-end heuristic: shared low-frequency keywords
// in stem form + similar answer length. Good enough for demo; real version
// would use embeddings.

import { PEOPLE } from "../people";
import { QUESTIONS, getQuestionById, type Question } from "../questions";
import type { Person, Reflection } from "../types";
import { digest, loadUnderstanding, saveUnderstanding, type UserUnderstanding } from "../understanding";

export type Role = "user" | "assistant";
export interface Message { id: string; role: Role; t: number; text: string; }

export type Phase =
  | "asking"             // a question is on the table, waiting for your answer
  | "searching"          // we just got your answer, looking for resonance
  | "resonance_anon"     // showing two answers side by side, anonymous
  | "resonance_revealed" // user asked to see who wrote it
  | "exhausted";         // no more questions / no resonance

// Your answer to a question.
export interface MyReflection {
  questionId: string;
  answer: string;
  t: number;
}

// A pairing of your answer + another person's answer to the same question.
export interface ResonancePair {
  questionId: string;
  mineAnswer: string;
  theirPersonId: string;
  theirAnswer: string;
  theirAnswer_zh: string;
  score: number;
}

export interface CompassState {
  phase: Phase;
  understanding: UserUnderstanding;
  messages: Message[];
  mine: MyReflection[];
  askedQuestionIds: string[];
  currentQuestionId: string | null;
  resonance: ResonancePair | null;
  skippedPersonIds: string[];
}

export const EMPTY: CompassState = {
  phase: "asking",
  understanding: { positive: [], negative: [], notes: [] },
  messages: [],
  mine: [],
  askedQuestionIds: [],
  currentQuestionId: null,
  resonance: null,
  skippedPersonIds: [],
};

export function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ---- Tokenization & resonance scoring -----------------------------------

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","is","am","are","was","were","be","been","being",
  "i","you","he","she","it","we","they","my","your","his","her","its","our","their","me","him","us","them",
  "this","that","these","those","do","does","did","done","have","has","had","not","no","yes","so","if","than","then","as","by","from","up","down","out","in","into","about","just","like","when","where","why","how","what","which","who",
  "我","你","他","她","它","我们","你们","他们","的","了","和","或","也","在","是","就","都","会","要","不","没","有","得","着","与","及","但",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[—.,;:!?'"()\[\]{}…/\\]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((w) => { if (tb.has(w)) shared++; });
  const jaccard = shared / (ta.size + tb.size - shared);
  // length affinity — penalize very different lengths
  const la = a.length, lb = b.length;
  const lenAff = 1 - Math.abs(la - lb) / Math.max(la, lb, 1);
  return jaccard * 0.7 + lenAff * 0.3;
}

function findResonance(
  questionId: string,
  myAnswer: string,
  state: CompassState,
): ResonancePair | null {
  // Gather everyone who answered the same question.
  const candidates: Array<{ person: Person; reflection: Reflection; score: number }> = [];
  for (const p of PEOPLE) {
    if (state.skippedPersonIds.includes(p.id)) continue;
    const r = p.reflections.find((x) => x.questionId === questionId);
    if (!r) continue;
    const score = similarity(myAnswer, r.answer);
    candidates.push({ person: p, reflection: r, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Pick the best, but only if there is *some* signal. Otherwise return null
  // and the Agent will offer another question.
  const top = candidates[0];
  if (top.score < 0.05) return null;
  return {
    questionId,
    mineAnswer: myAnswer,
    theirPersonId: top.person.id,
    theirAnswer: top.reflection.answer,
    theirAnswer_zh: top.reflection.answer_zh,
    score: top.score,
  };
}

// ---- Question selection -------------------------------------------------

function pickQuestion(state: CompassState): Question | null {
  const remaining = QUESTIONS.filter((q) => !state.askedQuestionIds.includes(q.id));
  // Prefer questions that at least 3 candidate people have answered.
  const popular = remaining.filter(
    (q) => PEOPLE.filter((p) => p.reflections.some((r) => r.questionId === q.id)).length >= 3,
  );
  const pool = popular.length > 0 ? popular : remaining;
  if (pool.length === 0) return null;
  return pool[0];
}

// ---- Lines --------------------------------------------------------------

const L = {
  greet: {
    en: "Compass works one question at a time. I'll ask. You answer in your own words — a sentence or three. Then I'll show you someone whose answer resonates with yours.",
    zh: "Compass 一次只问一个问题。我问，你用自己的话答——一两句话就好。然后我会给你看一个回答与你共鸣的人。",
  },
  ask: {
    en: (q: string) => q,
    zh: (q: string) => q,
  },
  searching: {
    en: "Reading the others who answered this one…",
    zh: "我在看其他人对这个问题的回答……",
  },
  found: {
    en: "Look right. Two answers to the same question — yours and theirs. No name, no photo, on purpose. Read first.",
    zh: "看右边。同一个问题的两段答案——你的和 TA 的。先没有名字，没有照片，是故意的。先读。",
  },
  no_resonance: {
    en: "Nothing close enough on that one. Let's try a different question.",
    zh: "这道题没有特别贴近的。换一题。",
  },
  revealed: {
    en: "That's who wrote it.",
    zh: "写下那段话的是 TA。",
  },
  skip_them: {
    en: "Skipped. Next question?",
    zh: "跳过 TA。下一题？",
  },
  exhausted: {
    en: "We've gone through the questions I have for now. Come back tomorrow — I'll have more.",
    zh: "我手上的问题这一轮问完了。明天再来——我会有新问题。",
  },
};

function pushA(s: CompassState, text: string): CompassState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "assistant", t: Date.now(), text }] };
}
function pushU(s: CompassState, text: string): CompassState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "user", t: Date.now(), text }] };
}

// ---- Public --------------------------------------------------------------

export function start(lang: "en" | "zh-CN"): CompassState {
  let s: CompassState = { ...EMPTY, understanding: loadUnderstanding() };
  s = pushA(s, lang === "zh-CN" ? L.greet.zh : L.greet.en);
  return askNext(s, lang);
}

export function askNext(state: CompassState, lang: "en" | "zh-CN"): CompassState {
  const q = pickQuestion(state);
  if (!q) return pushA({ ...state, phase: "exhausted" }, lang === "zh-CN" ? L.exhausted.zh : L.exhausted.en);
  const text = lang === "zh-CN" ? q.text_zh : q.text;
  return pushA(
    {
      ...state,
      phase: "asking",
      currentQuestionId: q.id,
      askedQuestionIds: [...state.askedQuestionIds, q.id],
      resonance: null,
    },
    text,
  );
}

export function userTurn(state: CompassState, text: string, lang: "en" | "zh-CN"): CompassState {
  const t = text.trim();
  if (!t) return state;
  let next = pushU(state, t);
  next = { ...next, understanding: digest(next.understanding, t).next };

  if (next.phase === "asking" && next.currentQuestionId) {
    next = {
      ...next,
      mine: [...next.mine, { questionId: next.currentQuestionId, answer: t, t: Date.now() }],
      phase: "searching",
    };
    const pair = findResonance(next.currentQuestionId, t, next);
    if (!pair) {
      next = pushA(next, lang === "zh-CN" ? L.no_resonance.zh : L.no_resonance.en);
      return askNext(next, lang);
    }
    next = { ...next, phase: "resonance_anon", resonance: pair };
    return pushA(next, lang === "zh-CN" ? L.found.zh : L.found.en);
  }
  // Other phases — treat any text as "next question please" by default.
  return askNext(next, lang);
}

export function reveal(state: CompassState, lang: "en" | "zh-CN"): CompassState {
  if (state.phase !== "resonance_anon") return state;
  return pushA({ ...state, phase: "resonance_revealed" }, lang === "zh-CN" ? L.revealed.zh : L.revealed.en);
}

export function skip(state: CompassState, lang: "en" | "zh-CN"): CompassState {
  if (!state.resonance) return askNext(state, lang);
  const next: CompassState = {
    ...state,
    skippedPersonIds: [...state.skippedPersonIds, state.resonance.theirPersonId],
    resonance: null,
  };
  return askNext(pushA(next, lang === "zh-CN" ? L.skip_them.zh : L.skip_them.en), lang);
}

// expose for header
export function currentQuestion(state: CompassState): Question | null {
  if (!state.currentQuestionId) return null;
  return getQuestionById(state.currentQuestionId) ?? null;
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:compass.v1";
export function load(): CompassState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<CompassState>) };
  } catch { return EMPTY; }
}
export function save(s: CompassState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    saveUnderstanding(s.understanding);
  } catch { /* noop */ }
}
export function reset(): CompassState {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return EMPTY;
}
