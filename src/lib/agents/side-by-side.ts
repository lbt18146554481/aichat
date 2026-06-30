// Side by Side — Agent for path B: proximity through shared activity.
//
// You tell the Agent what you actually do (tennis on Saturday mornings in
// Riverside, etc.). The Agent finds someone whose real weekly rhythm
// overlaps and proposes ONE specific meet. Both must Accept; either Pass
// and the other side never knows the proposal existed.

import { PEOPLE } from "../people";
import type { Activity, ActivityKind, Person, Weekday } from "../types";
import { loadUnderstanding, type UserUnderstanding } from "../understanding";

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  t: number;
  text: string;
}

export type Phase =
  | "gathering"        // figuring out what you do
  | "waiting"          // nothing this week
  | "proposed"         // proposal shown, waiting on you
  | "awaiting_them"    // you accepted, waiting on them
  | "confirmed"        // both said yes
  | "declined";        // you said no, or they said no

// What we know about the user — supplied via a tiny structured form
// because freeform parsing for activities is fragile and the UX shouldn't
// require it. Single primary activity is plenty for the model.
export interface UserActivity {
  kind: ActivityKind;
  level: "beginner" | "intermediate" | "advanced";
  area: string;
  slots: Array<{ day: Weekday; window: "morning" | "midday" | "evening" }>;
}

export interface MeetProposal {
  personId: string;
  kind: ActivityKind;
  day: Weekday;
  window: "morning" | "midday" | "evening";
  venue: string;
  venue_zh: string;
  reason: string;        // why this person, written by Agent
  reason_zh: string;
}

export interface SideState {
  phase: Phase;
  understanding: UserUnderstanding;  // shared
  messages: Message[];
  user: UserActivity | null;
  proposal: MeetProposal | null;
  history: string[];                 // personIds already proposed
  passedIds: string[];               // user said no to these
  weeklyProposalsUsed: number;       // simple weekly cap
}

export const EMPTY: SideState = {
  phase: "gathering",
  understanding: { positive: [], negative: [], notes: [], userMoments: [] },
  messages: [],
  user: null,
  proposal: null,
  history: [],
  passedIds: [],
  weeklyProposalsUsed: 0,
};

export const WEEKLY_CAP = 1;

export function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ---- Matching -----------------------------------------------------------

function overlap(a: UserActivity, b: Activity): { day: Weekday; window: "morning" | "midday" | "evening" } | null {
  for (const s of a.slots) {
    for (const o of b.slots) {
      if (s.day === o.day && s.window === o.window) return s;
    }
  }
  return null;
}

function levelDistance(a: UserActivity, b: Activity): number {
  const order = { beginner: 0, intermediate: 1, advanced: 2 };
  return Math.abs(order[a.level] - order[b.level]);
}

export function findProposal(state: SideState): MeetProposal | null {
  const user = state.user;
  if (!user) return null;

  type Match = { person: Person; activity: Activity; slot: { day: Weekday; window: "morning" | "midday" | "evening" }; score: number };
  const matches: Match[] = [];

  for (const p of PEOPLE) {
    if (state.passedIds.includes(p.id)) continue;
    if (state.history.includes(p.id)) continue;
    for (const act of p.activities) {
      if (act.kind !== user.kind) continue;
      const slot = overlap(user, act);
      if (!slot) continue;
      const dist = levelDistance(user, act);
      if (dist > 1) continue;
      // base on overlap + understanding alignment
      const aligned = p.signals.filter((s) => state.understanding.positive.includes(s)).length;
      const avoid = p.signals.filter((s) => state.understanding.negative.includes(s)).length;
      const score = 10 - dist * 2 + aligned * 2 - avoid * 3;
      matches.push({ person: p, activity: act, slot, score });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.score - a.score);
  const m = matches[0];

  return {
    personId: m.person.id,
    kind: m.activity.kind,
    day: m.slot.day,
    window: m.slot.window,
    venue: m.activity.venue,
    venue_zh: m.activity.venue_zh,
    reason: reasonFor(m.person, m.activity, user, "en"),
    reason_zh: reasonFor(m.person, m.activity, user, "zh-CN"),
  };
}

function reasonFor(p: Person, a: Activity, u: UserActivity, lang: "en" | "zh-CN"): string {
  if (lang === "zh-CN") {
    return `你们水平相近，都在那个时段去同一片区域。${p.name_zh} 本来就在${a.area_zh}打${kindZh(a.kind)}——你们大概率会在那里遇见，只是这次有人介绍。`;
  }
  return `You're at a similar level and you're both there that morning anyway. ${p.name} already ${kindEn(a.kind)} in ${a.area} — you'd probably cross paths eventually. This time someone's introducing you.`;
}
function kindEn(k: ActivityKind) {
  return ({ tennis: "plays tennis", run: "runs", climb: "climbs", cook: "cooks", exhibition: "goes to shows", bookstore: "haunts bookstores" } as const)[k];
}
function kindZh(k: ActivityKind) {
  return ({ tennis: "网球", run: "跑步", climb: "攀岩", cook: "做饭", exhibition: "看展", bookstore: "逛书店" } as const)[k];
}

// ---- Lines --------------------------------------------------------------

const L = {
  greet: {
    en: "Side by Side arranges one real meet a week — built around something you both already do. To start, tell me what you do regularly. (Pick on the right.)",
    zh: "Side by Side 每周给你安排一次真实的见面——围绕你和对方本来就在做的事。先告诉我你常做什么。（在右边选。）",
  },
  saved: {
    en: "Saved. Let me look at who's also out there at your hour.",
    zh: "记下了。我看看那个时段还有谁在。",
  },
  proposed: {
    en: (name: string) => `I have someone for you. ${name}. Take a look — accept and I'll ask them.`,
    zh: (name: string) => `我有人想介绍给你——${name}。看右边，你 Accept 之后我去问 TA。`,
  },
  awaiting_them: {
    en: "Sent. I'll let you know what they say. Usually within a few minutes.",
    zh: "发出去了。我等回音——通常几分钟内有。",
  },
  confirmed: {
    en: (name: string) => `${name} said yes. You'll see each other Saturday — name and a photo unlock then. Nothing more, nothing less.`,
    zh: (name: string) => `${name} 同意了。周六见面那天会显示对方的名字和照片，仅此而已。`,
  },
  declined_them: {
    en: "Not this one — they passed. They don't know it was you. Let me look again.",
    zh: "TA 这次没答应——TA 不知道是你。我再想想别人。",
  },
  declined_you: {
    en: "Noted. They won't know it was you. I'll come back when there's another fit.",
    zh: "好。TA 不会知道是你。下次有合适的我再说。",
  },
  weekly_cap: {
    en: "I've already proposed this week. One a week — so it stays real. New ones next week.",
    zh: "本周已经给你提过一次了。每周一次——为了让它保持真实。下周再说。",
  },
  no_match: {
    en: "No one fits your hour and level this week. I keep watching — I'll come back.",
    zh: "本周没人能对上你的时段和水平。我继续看，下次有人我来说。",
  },
};

function pushA(s: SideState, text: string): SideState {
  return { ...s, messages: [...s.messages, { id: uid(), role: "assistant", t: Date.now(), text }] };
}

// ---- Public --------------------------------------------------------------

export function start(lang: "en" | "zh-CN"): SideState {
  return pushA({ ...EMPTY, understanding: loadUnderstanding() }, lang === "zh-CN" ? L.greet.zh : L.greet.en);
}

export function setUserActivity(s: SideState, user: UserActivity, lang: "en" | "zh-CN"): SideState {
  const after = pushA({ ...s, user, phase: "waiting" }, lang === "zh-CN" ? L.saved.zh : L.saved.en);
  return tryPropose(after, lang);
}

function tryPropose(s: SideState, lang: "en" | "zh-CN"): SideState {
  if (s.weeklyProposalsUsed >= WEEKLY_CAP) {
    return pushA({ ...s, phase: "waiting" }, lang === "zh-CN" ? L.weekly_cap.zh : L.weekly_cap.en);
  }
  const proposal = findProposal(s);
  if (!proposal) {
    return pushA({ ...s, phase: "waiting" }, lang === "zh-CN" ? L.no_match.zh : L.no_match.en);
  }
  const person = PEOPLE.find((p) => p.id === proposal.personId)!;
  return pushA(
    { ...s, phase: "proposed", proposal, history: [...s.history, person.id], weeklyProposalsUsed: s.weeklyProposalsUsed + 1 },
    lang === "zh-CN" ? L.proposed.zh(person.name_zh) : L.proposed.en(person.name),
  );
}

export function accept(s: SideState, lang: "en" | "zh-CN"): SideState {
  if (!s.proposal) return s;
  return pushA({ ...s, phase: "awaiting_them" }, lang === "zh-CN" ? L.awaiting_them.zh : L.awaiting_them.en);
}

export function simulateThemReply(s: SideState, accepted: boolean, lang: "en" | "zh-CN"): SideState {
  if (!s.proposal) return s;
  const person = PEOPLE.find((p) => p.id === s.proposal!.personId)!;
  if (accepted) {
    return pushA({ ...s, phase: "confirmed" }, lang === "zh-CN" ? L.confirmed.zh(person.name_zh) : L.confirmed.en(person.name));
  }
  // they declined — Agent acknowledges, clears proposal, will look again later.
  return pushA(
    { ...s, phase: "waiting", proposal: null },
    lang === "zh-CN" ? L.declined_them.zh : L.declined_them.en,
  );
}

export function decline(s: SideState, lang: "en" | "zh-CN"): SideState {
  if (!s.proposal) return s;
  const personId = s.proposal.personId;
  return pushA(
    { ...s, phase: "waiting", proposal: null, passedIds: [...s.passedIds, personId] },
    lang === "zh-CN" ? L.declined_you.zh : L.declined_you.en,
  );
}

// ---- Persistence ---------------------------------------------------------

const KEY = "kindred:sidebyside.v1";
export function load(): SideState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<SideState>) };
  } catch { return EMPTY; }
}
export function save(s: SideState) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* noop */ }
}
export function reset(): SideState {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return EMPTY;
}
