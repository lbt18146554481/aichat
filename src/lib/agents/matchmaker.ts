// Matchmaker — describe who you're looking for; the Agent introduces ONE
// person at a time. The right pane shows that person's Moments (their own
// concrete answers to a few prompts). To make introductions reciprocal,
// the Agent also collects up to 3 Moments from the USER during the
// clarifying phase — these get quoted back when someone says hello to
// them.

import { getPersonById, PEOPLE } from "../people";
import { getMomentPromptById, MOMENT_PROMPTS, getQuestionById } from "../questions";
import type { Person, Reflection } from "../types";
import {
  addUserMoment,
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
  clarifyTurns: number;
  // Moment collection from the USER. If a prompt id sits here, the next
  // user message is treated as the answer to it rather than as new
  // description.
  pendingMomentPromptId: string | null;
  momentsAsked: string[];
}

export const EMPTY: MatchmakerState = {
  phase: "clarifying",
  understanding: { positive: [], negative: [], notes: [], userMoments: [] },
  messages: [],
  shownIds: [],
  passedIds: [],
  currentPersonId: null,
  clarifyTurns: 0,
  pendingMomentPromptId: null,
  momentsAsked: [],
};

const MOMENTS_TARGET = 3;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Intent parsing ------------------------------------------------------

type Intent = "another_person" | "more_describe";

const PATTERNS = {
  another_person: [
    /\bnext\b/i, /\banother\b/i, /\bsomeone else\b/i, /\bnot (the )?one\b/i,
    /\bnot for me\b/i, /\bpass\b/i, /\bskip\b/i,
    /换/, /下一个/, /不是/, /不喜欢/, /跳过/, /别的/,
  ],
};

function parseIntent(text: string): Intent {
  for (const re of PATTERNS.another_person) if (re.test(text)) return "another_person";
  return "more_describe";
}

// ---- Scoring -------------------------------------------------------------

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

// ---- Moment-prompt selection --------------------------------------------

function pickNextMomentPrompt(state: MatchmakerState): string | null {
  const answered = new Set(state.understanding.userMoments.map((m) => m.promptId));
  const asked = new Set(state.momentsAsked);
  // Prefer prompts neither asked nor answered, in declared order
  const fresh = MOMENT_PROMPTS.find((p) => !answered.has(p.id) && !asked.has(p.id));
  if (fresh) return fresh.id;
  return null;
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
  moment_first: {
    en: (q: string) => `Got it. Before I introduce anyone — tell me a bit about you too, so what you write later means something. ${q}`,
    zh: (q: string) => `明白了。在我引荐之前——也想问问你自己，这样之后你写给别人的字才有分量。${q}`,
  },
  moment_more: {
    en: (q: string) => `Thank you. One more: ${q}`,
    zh: (q: string) => `谢谢。再问一个：${q}`,
  },
  moment_last: {
    en: (q: string) => `Last one: ${q}`,
    zh: (q: string) => `最后一个：${q}`,
  },
  introducing: {
    en: (n: string) => `Okay — I have someone in mind. ${n}. Look on the right.`,
    zh: (n: string) => `好——我想到一个人了。${n}。看右边。`,
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

function askNextMoment(state: MatchmakerState, lang: "en" | "zh-CN"): MatchmakerState {
  const id = pickNextMomentPrompt(state);
  if (!id) return introduce(state, lang);
  const prompt = getMomentPromptById(id)!;
  const text = lang === "zh-CN" ? prompt.text_zh : prompt.text;
  const answeredCount = state.understanding.userMoments.length;
  const remaining = MOMENTS_TARGET - answeredCount;
  let line: string;
  if (answeredCount === 0) line = lang === "zh-CN" ? L.moment_first.zh(text) : L.moment_first.en(text);
  else if (remaining <= 1) line = lang === "zh-CN" ? L.moment_last.zh(text) : L.moment_last.en(text);
  else line = lang === "zh-CN" ? L.moment_more.zh(text) : L.moment_more.en(text);
  const next: MatchmakerState = {
    ...state,
    pendingMomentPromptId: id,
    momentsAsked: state.momentsAsked.includes(id) ? state.momentsAsked : [...state.momentsAsked, id],
  };
  return pushA(next, line);
}

// ---- Public --------------------------------------------------------------

export function start(lang: "en" | "zh-CN"): MatchmakerState {
  const u = loadUnderstanding();
  return pushA({ ...EMPTY, understanding: u }, lang === "zh-CN" ? L.greet.zh : L.greet.en);
}

export function userTurn(state: MatchmakerState, text: string, lang: "en" | "zh-CN"): MatchmakerState {
  const t = text.trim();
  if (!t) return state;
  let next = pushU(state, t);

  // 1) Answering a pending moment prompt — store, then either ask another
  //    or move on to introducing.
  if (next.pendingMomentPromptId) {
    const promptId = next.pendingMomentPromptId;
    const u = addUserMoment(next.understanding, promptId, t);
    next = { ...next, understanding: u, pendingMomentPromptId: null };
    if (u.userMoments.length < MOMENTS_TARGET && pickNextMomentPrompt(next)) {
      return askNextMoment(next, lang);
    }
    return introduce(next, lang);
  }

  // 2) Otherwise, digest the text as describing-target.
  const { next: u, newPositives, newNegatives } = digest(next.understanding, t);
  next = { ...next, understanding: u };

  const intent = parseIntent(t);

  if (next.phase === "clarifying") {
    next = { ...next, clarifyTurns: next.clarifyTurns + 1 };
    // If we still don't know what they want at all, push once more
    if (u.positive.length === 0 && next.clarifyTurns < 2) {
      return pushA(next, lang === "zh-CN" ? L.clarify_more.zh : L.clarify_more.en);
    }
    // If user already has 3+ moments saved (from a prior session), skip
    // the moment loop and introduce directly.
    if (u.userMoments.length >= MOMENTS_TARGET || !pickNextMomentPrompt(next)) {
      return introduce(next, lang);
    }
    return askNextMoment(next, lang);
  }

  // Introducing phase
  if (intent === "another_person") {
    if (next.currentPersonId) next = { ...next, passedIds: [...next.passedIds, next.currentPersonId] };
    return introduce(next, lang);
  }
  if (newPositives.length > 0 || newNegatives.length > 0) return introduce(next, lang);
  return pushA(next, lang === "zh-CN" ? "嗯，我在听。再告诉我一点。" : "I'm listening. Tell me a bit more.");
}

function introduce(state: MatchmakerState, lang: "en" | "zh-CN"): MatchmakerState {
  const person = pickNext(state, true);
  if (!person) return pushA(state, lang === "zh-CN" ? L.none_left.zh : L.none_left.en);
  const next: MatchmakerState = {
    ...state,
    phase: "introducing",
    currentPersonId: person.id,
    shownIds: state.shownIds.includes(person.id) ? state.shownIds : [...state.shownIds, person.id],
  };
  const line = state.phase === "clarifying"
    ? (lang === "zh-CN" ? L.introducing.zh(person.name_zh) : L.introducing.en(person.name))
    : (lang === "zh-CN" ? L.swap_person.zh(person.name_zh) : L.swap_person.en(person.name));
  return pushA(next, line);
}

export function actAnotherPerson(s: MatchmakerState, lang: "en" | "zh-CN") {
  return userTurn(s, lang === "zh-CN" ? "换一个吧。" : "Show me someone else.", lang);
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:matchmaker.v2";

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
