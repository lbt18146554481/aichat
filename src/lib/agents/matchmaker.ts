// Matchmaker — Agent for path A: introduction.
//
// You describe who you're looking for; the Agent introduces ONE person at
// a time with a chosen "angle." Reads/writes shared UserUnderstanding so
// what's learned here also improves Compass/Side-by-Side scoring.

import { getPersonById, PEOPLE } from "../people";
import { getQuestionById } from "../questions";
import type { Angle, Person, Reflection } from "../types";
import {
  digest,
  loadUnderstanding,
  saveUnderstanding,
  type UserUnderstanding,
} from "../understanding";

export type Phase = "clarifying" | "introducing";
export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  t: number;
  text: string;
}

export interface MatchmakerState {
  phase: Phase;
  understanding: UserUnderstanding;
  messages: Message[];
  shownIds: string[];
  passedIds: string[];
  currentPersonId: string | null;
  currentAngleId: string | null;
  usedAngles: Record<string, string[]>;
  clarifyTurns: number;
}

export const EMPTY: MatchmakerState = {
  phase: "clarifying",
  understanding: { positive: [], negative: [], notes: [] },
  messages: [],
  shownIds: [],
  passedIds: [],
  currentPersonId: null,
  currentAngleId: null,
  usedAngles: {},
  clarifyTurns: 0,
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Intent parsing ------------------------------------------------------

type Intent = "another_person" | "another_angle" | "more_describe";

const PATTERNS = {
  another_person: [
    /\bnext\b/i, /\banother\b/i, /\bsomeone else\b/i, /\bnot (the )?one\b/i,
    /\bnot for me\b/i, /\bpass\b/i, /\bskip\b/i,
    /换/, /下一个/, /不是/, /不喜欢/, /跳过/, /别的/,
  ],
  another_angle: [
    /\btell me more\b/i, /\bmore about\b/i, /\bwhy\b/i, /\bwhat else\b/i,
    /\bgo on\b/i, /\bkeep going\b/i,
    /多.*了解/, /多说/, /为什么/, /还有/, /继续/,
  ],
};

function parseIntent(text: string): Intent {
  for (const re of PATTERNS.another_person) if (re.test(text)) return "another_person";
  for (const re of PATTERNS.another_angle) if (re.test(text)) return "another_angle";
  return "more_describe";
}

// ---- Scoring -------------------------------------------------------------

// Cheap text-similarity heuristic, used to align a person's free-text
// reflection with the user's own words. Token Jaccard on a stopword-trimmed
// bag — good enough to bias picks; not a real embedding.
const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","is","am","are","was","were","be","been","being",
  "i","you","he","she","it","we","they","my","your","his","her","its","our","their","me","him","us","them",
  "this","that","these","those","do","does","did","done","have","has","had","not","no","yes","so","if","than","then","as","by","from","up","down","out","into","about","just","like","when","where","why","how","what","which","who",
  "我","你","他","她","它","我们","你们","他们","的","了","和","或","也","在","是","就","都","会","要","不","没","有","得","着","与","及","但",
]);
function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[—.,;:!?'"()\[\]{}…/\\]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared++; });
  return shared / (a.size + b.size - shared);
}

// A person's representative reflection — the one whose text resonates most
// with the user's own notes. Used by IntroCanvas to show "their own words".
export function pickReflectionFor(
  person: Person,
  u: UserUnderstanding,
  lang: "en" | "zh-CN" = "en",
): Reflection | null {
  if (person.reflections.length === 0) return null;
  const userText = u.notes.join(" ");
  if (!userText.trim()) return person.reflections[0];
  const ut = tokens(userText);
  let best: Reflection | null = null;
  let bestScore = -1;
  for (const r of person.reflections) {
    const text = lang === "zh-CN" ? r.answer_zh : r.answer;
    const score = jaccard(ut, tokens(text));
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best ?? person.reflections[0];
}

export function reflectionQuestionText(r: Reflection, lang: "en" | "zh-CN"): string {
  const q = getQuestionById(r.questionId);
  if (!q) return "";
  return lang === "zh-CN" ? q.text_zh : q.text;
}

function reflectionAffinity(p: Person, u: UserUnderstanding): number {
  if (p.reflections.length === 0) return 0;
  const userText = u.notes.join(" ");
  if (!userText.trim()) return 0;
  const ut = tokens(userText);
  let best = 0;
  for (const r of p.reflections) {
    const s = jaccard(ut, tokens(r.answer)) + jaccard(ut, tokens(r.answer_zh));
    if (s > best) best = s;
  }
  return best;
}

function scorePerson(p: Person, u: UserUnderstanding, passedIds: string[], shownIds: string[]): number {
  if (passedIds.includes(p.id)) return -Infinity;
  let s = p.signals.filter((sig) => u.positive.includes(sig)).length * 2;
  s -= p.signals.filter((sig) => u.negative.includes(sig)).length * 3;
  // Values / worldview signal: a reflection whose words resonate with what
  // the user has been saying nudges the ranking. Capped so a single noisy
  // sentence can't outweigh explicit positives.
  s += Math.min(reflectionAffinity(p, u) * 4, 2);
  if (shownIds.includes(p.id)) s -= 5;
  return s;
}

function pickNext(state: MatchmakerState, excludeCurrent = false): Person | null {
  const fresh = PEOPLE.filter(
    (p) => !state.passedIds.includes(p.id)
      && (!excludeCurrent || p.id !== state.currentPersonId)
      && !state.shownIds.includes(p.id),
  );
  const pool = fresh.length > 0 ? fresh : PEOPLE.filter(
    (p) => !state.passedIds.includes(p.id) && (!excludeCurrent || p.id !== state.currentPersonId),
  );
  if (pool.length === 0) return null;
  const ranked = [...pool].sort(
    (a, b) =>
      scorePerson(b, state.understanding, state.passedIds, state.shownIds) -
      scorePerson(a, state.understanding, state.passedIds, state.shownIds),
  );
  return ranked[0];
}

function pickAngle(person: Person, u: UserUnderstanding, used: string[]): Angle {
  const unused = person.angles.filter((a) => !used.includes(a.id));
  const pool = unused.length > 0 ? unused : person.angles;
  return [...pool].sort((a, b) => {
    const sa = a.signals.filter((s) => u.positive.includes(s)).length;
    const sb = b.signals.filter((s) => u.positive.includes(s)).length;
    return sb - sa;
  })[0];
}

// ---- Lines ---------------------------------------------------------------

const L = {
  greet: {
    en: "Tell me a bit about who you're looking for. Doesn't have to be a list — what kind of person makes a room feel different for you?",
    zh: "随便聊几句你想找的人。不用列清单——什么样的人会让你觉得'这个房间不一样了'？",
  },
  clarify_more: {
    en: "Got it. One more — is there a quality you don't want? Something you've had enough of?",
    zh: "明白了。再问一个——有什么特质是你不想要的？已经厌倦的那种？",
  },
  introducing: {
    en: (n: string) => `I was thinking of someone. ${n}. Look on the right — I'll tell you why.`,
    zh: (n: string) => `我想到了一个人。${n}。看右边——我说说为什么。`,
  },
  another_angle: {
    en: (n: string) => `Another way to think about ${n} —`,
    zh: (n: string) => `换个角度说 ${n} ——`,
  },
  swap_person: {
    en: (n: string) => `Understood. Let me think again. What about ${n}?`,
    zh: (n: string) => `好，我重新想想。${n} 怎么样？`,
  },
  none_left: {
    en: "I'm out of people who fit. Try giving me a quality I don't know yet — or loosen one you've mentioned.",
    zh: "按你说的，我手上的人介绍完了。再告诉我一个我还不知道的特质——或者放宽一个。",
  },
};

function pushA(s: MatchmakerState, text: string): MatchmakerState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "assistant", t: Date.now(), text }] };
}
function pushU(s: MatchmakerState, text: string): MatchmakerState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "user", t: Date.now(), text }] };
}

// ---- Public --------------------------------------------------------------

export function start(lang: "en" | "zh-CN"): MatchmakerState {
  return pushA(
    { ...EMPTY, understanding: loadUnderstanding() },
    lang === "zh-CN" ? L.greet.zh : L.greet.en,
  );
}

export function userTurn(state: MatchmakerState, text: string, lang: "en" | "zh-CN"): MatchmakerState {
  const t = text.trim();
  if (!t) return state;
  let next = pushU(state, t);
  const { next: u, newPositives, newNegatives } = digest(next.understanding, t);
  next = { ...next, understanding: u };

  const intent = parseIntent(t);

  if (next.phase === "clarifying") {
    next = { ...next, clarifyTurns: next.clarifyTurns + 1 };
    if (u.positive.length === 0 && next.clarifyTurns < 2) {
      return pushA(next, lang === "zh-CN" ? L.clarify_more.zh : L.clarify_more.en);
    }
    return introduce(next, lang);
  }

  if (intent === "another_person") {
    if (next.currentPersonId) next = { ...next, passedIds: [...next.passedIds, next.currentPersonId] };
    return introduce(next, lang);
  }
  if (intent === "another_angle" && next.currentPersonId) {
    const person = getPersonById(next.currentPersonId);
    if (!person) return introduce(next, lang);
    const used = next.usedAngles[person.id] ?? [];
    if (used.length >= person.angles.length) return introduce(next, lang);
    const angle = pickAngle(person, next.understanding, used);
    next = {
      ...next,
      currentAngleId: angle.id,
      usedAngles: { ...next.usedAngles, [person.id]: [...used, angle.id] },
    };
    return pushA(next, lang === "zh-CN" ? L.another_angle.zh(person.name_zh) : L.another_angle.en(person.name));
  }
  if (newPositives.length > 0 || newNegatives.length > 0) return introduce(next, lang);
  return pushA(next, lang === "zh-CN" ? "嗯，我在听。再告诉我一点。" : "I'm listening. Tell me a bit more.");
}

function introduce(state: MatchmakerState, lang: "en" | "zh-CN"): MatchmakerState {
  const person = pickNext(state, true);
  if (!person) return pushA(state, lang === "zh-CN" ? L.none_left.zh : L.none_left.en);
  const used = state.usedAngles[person.id] ?? [];
  const angle = pickAngle(person, state.understanding, used);
  const next: MatchmakerState = {
    ...state,
    phase: "introducing",
    currentPersonId: person.id,
    currentAngleId: angle.id,
    shownIds: state.shownIds.includes(person.id) ? state.shownIds : [...state.shownIds, person.id],
    usedAngles: { ...state.usedAngles, [person.id]: [...used, angle.id] },
  };
  const line = state.phase === "clarifying"
    ? (lang === "zh-CN" ? L.introducing.zh(person.name_zh) : L.introducing.en(person.name))
    : (lang === "zh-CN" ? L.swap_person.zh(person.name_zh) : L.swap_person.en(person.name));
  return pushA(next, line);
}

export function actAnotherAngle(s: MatchmakerState, lang: "en" | "zh-CN") {
  return userTurn(s, lang === "zh-CN" ? "再多说一点。" : "Tell me more.", lang);
}
export function actAnotherPerson(s: MatchmakerState, lang: "en" | "zh-CN") {
  return userTurn(s, lang === "zh-CN" ? "换一个吧。" : "Show me someone else.", lang);
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:matchmaker.v1";

export function load(): MatchmakerState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<MatchmakerState>) };
  } catch { return EMPTY; }
}
export function save(s: MatchmakerState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    saveUnderstanding(s.understanding);
  } catch { /* noop */ }
}
export function reset(): MatchmakerState {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return EMPTY;
}
