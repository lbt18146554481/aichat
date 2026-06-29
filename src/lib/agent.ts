// Single-introduction Agent.
//
// The Agent does NOT show lists. It introduces ONE person at a time,
// chooses an "angle" (one of several pre-written introductions for that
// person) based on what it's learned about the user, and adapts based on
// the user's feedback.
//
// Phases:
//   clarifying    — no person on the right pane yet, just talking
//   introducing   — a person + angle is being presented on the right
//
// All logic is pure front-end. No LLM, no network. Feedback parsing is
// keyword-based and intentionally transparent.

import { extractSignals } from "./conversation";
import { getPersonById, PEOPLE } from "./people";
import type { Angle, Person } from "./types";

export type Role = "user" | "assistant";
export type Phase = "clarifying" | "introducing";

export interface Message {
  id: string;
  role: Role;
  t: number;
  text: string;
}

export interface UserContext {
  positive: string[];       // signals the user wants
  negative: string[];       // signals the user has rejected
  notes: string[];          // short free-text fragments shown in Understanding panel
}

export interface AgentState {
  phase: Phase;
  context: UserContext;
  messages: Message[];
  shownIds: string[];                         // people already introduced (don't repeat)
  passedIds: string[];                        // people the user explicitly rejected
  currentPersonId: string | null;
  currentAngleId: string | null;
  usedAngles: Record<string, string[]>;       // personId → angleIds shown for that person
  clarifyTurns: number;
}

export const EMPTY_STATE: AgentState = {
  phase: "clarifying",
  context: { positive: [], negative: [], notes: [] },
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

// ---- Feedback intent parsing --------------------------------------------

export type FeedbackIntent =
  | "another_person"       // "next", "someone else", "换一个"
  | "another_angle"        // "tell me more", "why", "多说一点"
  | "more_describe"        // anything else — they're adding to the brief
  ;

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

export function parseFeedback(text: string): FeedbackIntent {
  for (const re of PATTERNS.another_person) if (re.test(text)) return "another_person";
  for (const re of PATTERNS.another_angle) if (re.test(text)) return "another_angle";
  return "more_describe";
}

// ---- Heuristic "negative signal" detection ------------------------------
// "too quiet", "more outgoing", "less ambitious" → push some signals out.
const NEGATION = [
  /\btoo\s+(\w+)/gi, /\bless\s+(\w+)/gi, /\bnot\s+(?:so|too)?\s*(\w+)/gi,
  /太(\S)/g, /不(?:要|太)?(\S{1,3})/g,
];
function inferNegatives(text: string): string[] {
  // Map a small set of adjectives to canonical signals.
  const out = new Set<string>();
  const lower = text.toLowerCase();
  if (/\btoo (quiet|shy|introvert)/i.test(lower) || /太安静/.test(text)) out.add("quiet");
  if (/\btoo (loud|wild)/i.test(lower)) out.add("funny");
  if (/\btoo (serious|heavy|intense)/i.test(lower) || /太严肃|太沉重/.test(text)) out.add("ambitious");
  if (/\bless (ambitious|driven|career)/i.test(lower) || /不要太上进|事业.*太/.test(text)) out.add("ambitious");
  if (/\b(less|not so) outdoors/i.test(lower) || /不要.*户外/.test(text)) out.add("outdoors");
  // Match the patterns to placate the linter and reserve them for future tuning.
  NEGATION.forEach((re) => re.lastIndex = 0);
  return Array.from(out);
}

// ---- Person & angle selection -------------------------------------------

function scorePerson(p: Person, ctx: UserContext, passedIds: string[], shownIds: string[]): number {
  if (passedIds.includes(p.id)) return -Infinity;
  let s = p.signals.filter((sig) => ctx.positive.includes(sig)).length * 2;
  s -= p.signals.filter((sig) => ctx.negative.includes(sig)).length * 3;
  if (shownIds.includes(p.id)) s -= 5; // strongly prefer fresh people
  return s;
}

export function pickNextPerson(state: AgentState, excludeCurrent = false): Person | null {
  const candidates = PEOPLE.filter(
    (p) => !state.passedIds.includes(p.id)
      && (!excludeCurrent || p.id !== state.currentPersonId)
      && !state.shownIds.includes(p.id),
  );
  const pool = candidates.length > 0 ? candidates : PEOPLE.filter(
    (p) => !state.passedIds.includes(p.id) && (!excludeCurrent || p.id !== state.currentPersonId),
  );
  if (pool.length === 0) return null;
  const ranked = [...pool].sort(
    (a, b) =>
      scorePerson(b, state.context, state.passedIds, state.shownIds) -
      scorePerson(a, state.context, state.passedIds, state.shownIds),
  );
  return ranked[0];
}

export function pickAngle(person: Person, ctx: UserContext, used: string[]): Angle {
  const unused = person.angles.filter((a) => !used.includes(a.id));
  const pool = unused.length > 0 ? unused : person.angles;
  const ranked = [...pool].sort((a, b) => {
    const sa = a.signals.filter((s) => ctx.positive.includes(s)).length;
    const sb = b.signals.filter((s) => ctx.positive.includes(s)).length;
    return sb - sa;
  });
  return ranked[0];
}

// ---- Assistant utterances ------------------------------------------------

const LINES = {
  greet_first: {
    en: "Before I introduce anyone — tell me a bit about who you're looking for. Doesn't have to be a list. What kind of person makes a room feel different for you?",
    zh: "在我介绍人之前，先随便聊几句——你想找一个什么样的人？不用列清单，就说说什么样的人会让你觉得'这个房间不一样了'。",
  },
  clarify_more: {
    en: "Got it. One more — is there a quality you don't want? Something you've had enough of in past people?",
    zh: "明白了。再问一个——有没有一种特质是你不想要的？过去经历里你已经厌倦的那种？",
  },
  introducing: {
    en: (name: string) => `I was thinking of someone. ${name}. Look on the right — I'll tell you why.`,
    zh: (name: string) => `我想到了一个人。${name}。看右边——我说说为什么是 TA。`,
  },
  another_angle: {
    en: (name: string) => `Another way to think about ${name} —`,
    zh: (name: string) => `换一个角度说 ${name} ——`,
  },
  swap_person: {
    en: (name: string) => `Understood. Let me think again. What about ${name}?`,
    zh: (name: string) => `好，我重新想想。${name} 怎么样？`,
  },
  none_left: {
    en: "I'm out of people who fit what you've told me. Try giving me a quality I don't know yet — or loosen one you mentioned.",
    zh: "按你说的条件，我手上的人介绍完了。再告诉我一个我还不知道的特质——或者放宽一个你已经说过的。",
  },
  learned: {
    en: (sig: string) => `Noted — you want ${sig}.`,
    zh: (sig: string) => `记下了——你想要"${sig}"。`,
  },
  learned_negative: {
    en: (sig: string) => `Noted — less ${sig}.`,
    zh: (sig: string) => `记下了——少一点"${sig}"。`,
  },
};

function pushAssistant(state: AgentState, text: string): AgentState {
  return {
    ...state,
    messages: [...state.messages, { id: uid(), role: "assistant", t: Date.now(), text }],
  };
}

function pushUser(state: AgentState, text: string): AgentState {
  return {
    ...state,
    messages: [...state.messages, { id: uid(), role: "user", t: Date.now(), text }],
  };
}

// ---- Public turn handler -------------------------------------------------

export function startConversation(lang: "en" | "zh-CN"): AgentState {
  const greeting = lang === "zh-CN" ? LINES.greet_first.zh : LINES.greet_first.en;
  return pushAssistant(EMPTY_STATE, greeting);
}

export function userTurn(state: AgentState, text: string, lang: "en" | "zh-CN"): AgentState {
  const trimmed = text.trim();
  if (!trimmed) return state;

  // 1) Always record the user message.
  let next = pushUser(state, trimmed);

  // 2) Update context from the message (signals + negatives + a note).
  const newPositives = extractSignals(trimmed).filter((s) => !next.context.positive.includes(s));
  const newNegatives = inferNegatives(trimmed).filter((s) => !next.context.negative.includes(s));
  // Remove from positive if they're now negative, and vice versa.
  const positive = [
    ...next.context.positive.filter((s) => !newNegatives.includes(s)),
    ...newPositives.filter((s) => !next.context.negative.includes(s) || newPositives.includes(s)),
  ];
  const negative = [
    ...next.context.negative.filter((s) => !newPositives.includes(s)),
    ...newNegatives,
  ];
  // Keep notes short — last 6 fragments.
  const noteFragment = trimmed.length > 80 ? trimmed.slice(0, 78) + "…" : trimmed;
  const notes = [...next.context.notes, noteFragment].slice(-6);
  next = { ...next, context: { positive, negative, notes } };

  // 3) Decide what to do based on phase + intent.
  const intent = parseFeedback(trimmed);

  // Still clarifying — ask one more time, then start introducing.
  if (next.phase === "clarifying") {
    const clarifyTurns = next.clarifyTurns + 1;
    next = { ...next, clarifyTurns };
    // After the very first user message: if we already extracted at least
    // one signal, jump straight into introducing. Otherwise ask one more.
    if (positive.length === 0 && clarifyTurns < 2) {
      const line = lang === "zh-CN" ? LINES.clarify_more.zh : LINES.clarify_more.en;
      return pushAssistant(next, line);
    }
    return introduceNew(next, lang);
  }

  // Already introducing someone.
  if (intent === "another_person") {
    const currentId = next.currentPersonId;
    if (currentId) next = { ...next, passedIds: [...next.passedIds, currentId] };
    return introduceNew(next, lang);
  }
  if (intent === "another_angle" && next.currentPersonId) {
    const person = getPersonById(next.currentPersonId);
    if (!person) return introduceNew(next, lang);
    const used = next.usedAngles[person.id] ?? [];
    if (used.length >= person.angles.length) {
      // All angles exhausted — gently move to a new person.
      return introduceNew(next, lang);
    }
    const angle = pickAngle(person, next.context, used);
    next = {
      ...next,
      currentAngleId: angle.id,
      usedAngles: { ...next.usedAngles, [person.id]: [...used, angle.id] },
    };
    const line = lang === "zh-CN" ? LINES.another_angle.zh(person.name_zh) : LINES.another_angle.en(person.name);
    return pushAssistant(next, line);
  }
  // more_describe — re-introduce based on updated context.
  // If the new signals materially changed the brief, swap; otherwise stay.
  if (newPositives.length > 0 || newNegatives.length > 0) {
    return introduceNew(next, lang);
  }
  // Nothing new learned — keep the current person but acknowledge.
  const ack = lang === "zh-CN"
    ? "嗯，我在听。再告诉我一点。"
    : "I'm listening. Tell me a bit more.";
  return pushAssistant(next, ack);
}

function introduceNew(state: AgentState, lang: "en" | "zh-CN"): AgentState {
  const person = pickNextPerson(state, /* excludeCurrent */ true);
  if (!person) {
    const line = lang === "zh-CN" ? LINES.none_left.zh : LINES.none_left.en;
    return pushAssistant(state, line);
  }
  const used = state.usedAngles[person.id] ?? [];
  const angle = pickAngle(person, state.context, used);
  const intro: AgentState = {
    ...state,
    phase: "introducing",
    currentPersonId: person.id,
    currentAngleId: angle.id,
    shownIds: state.shownIds.includes(person.id) ? state.shownIds : [...state.shownIds, person.id],
    usedAngles: { ...state.usedAngles, [person.id]: [...used, angle.id] },
  };
  const line = state.phase === "clarifying"
    ? (lang === "zh-CN" ? LINES.introducing.zh(person.name_zh) : LINES.introducing.en(person.name))
    : (lang === "zh-CN" ? LINES.swap_person.zh(person.name_zh) : LINES.swap_person.en(person.name));
  return pushAssistant(intro, line);
}

// ---- Button-triggered actions (mirrored as user messages) ---------------

export function actAnotherAngle(state: AgentState, lang: "en" | "zh-CN"): AgentState {
  const text = lang === "zh-CN" ? "再多说一点。" : "Tell me more.";
  return userTurn(state, text, lang);
}

export function actAnotherPerson(state: AgentState, lang: "en" | "zh-CN"): AgentState {
  const text = lang === "zh-CN" ? "换一个吧。" : "Show me someone else.";
  return userTurn(state, text, lang);
}

export function actRemovePositive(state: AgentState, sig: string): AgentState {
  return {
    ...state,
    context: {
      ...state.context,
      positive: state.context.positive.filter((s) => s !== sig),
    },
  };
}

export function actRemoveNegative(state: AgentState, sig: string): AgentState {
  return {
    ...state,
    context: {
      ...state.context,
      negative: state.context.negative.filter((s) => s !== sig),
    },
  };
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:agent.v3";
const LEGACY_KEYS = [
  "iris:conversation", "bloom:state", "muse:state",
  "kindred:state", "kindred:state.v0", "kindred:state.v1", "kindred:state.v2",
];

export function loadState(): AgentState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<AgentState>) };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AgentState) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
}

export function resetState(): AgentState {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return EMPTY_STATE;
}
