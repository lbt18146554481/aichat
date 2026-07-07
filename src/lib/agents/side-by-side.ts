// Side by Side — Agent for path B: proximity through shared activity.
//
// Product terminates the moment two people are placed on a shared topic.
// After that, the connections thread takes over — schedule, venue, whether
// they actually meet, all live inside /connections. Side by Side does not
// track "confirmed / attended / debrief" states; the connections layer is
// the single source of truth for whether a conversation is happening.

import { PEOPLE, getPersonById } from "../people";
import type { Activity, ActivityKind, Person, Weekday } from "../types";

// What the user tells us. Only two dimensions: what + when. Level and area
// are intentionally not surfaced — they add complexity without helping the
// user decide anything at this step. Level still exists on Person's
// Activity data and can bias matching, but we don't ask.
export interface UserActivity {
  kind: ActivityKind;
  slots: Array<{ day: Weekday; window: "morning" | "midday" | "evening" }>;
}

export interface Candidate {
  personId: string;
  kind: ActivityKind;
  day: Weekday;
  window: "morning" | "midday" | "evening";
  venue: string;
  venue_zh: string;
  reason: string;
  reason_zh: string;
}

// Anonymously aggregated "close" bucket: same kind at a slot the user
// didn't pick.
export interface NearMiss {
  personCount: number;
  slot: { day: Weekday; window: "morning" | "midday" | "evening" };
}

// Derived phase — computed, never persisted.
export type Phase = "gathering" | "reviewing" | "empty";

export interface SideState {
  user: UserActivity | null;
  candidate: Candidate | null;
  skipped: string[];       // personIds passed via "swap"
  nearMisses: NearMiss[];  // top near-miss suggestion, when no candidate
  poolExhausted: boolean;  // true when we've cycled through all candidates
}

export const EMPTY: SideState = {
  user: null,
  candidate: null,
  skipped: [],
  nearMisses: [],
  poolExhausted: false,
};

export function phaseOf(s: SideState): Phase {
  if (!s.user) return "gathering";
  if (s.candidate) return "reviewing";
  return "empty";
}

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

function findAllMatches(state: SideState): Array<{ person: Person; activity: Activity; slot: { day: Weekday; window: "morning" | "midday" | "evening" }; score: number }> {
  const user = state.user;
  if (!user) return [];
  const out: Array<{ person: Person; activity: Activity; slot: { day: Weekday; window: "morning" | "midday" | "evening" }; score: number }> = [];
  for (const p of PEOPLE) {
    if (state.skipped.includes(p.id)) continue;
    for (const act of p.activities) {
      if (act.kind !== user.kind) continue;
      const slot = overlap(user, act);
      if (!slot) continue;
      // Level is now a soft signal — no hard filter. Slight boost for a
      // deterministic tiebreak so results feel stable.
      const levelBoost = act.level === "intermediate" ? 1 : 0;
      out.push({ person: p, activity: act, slot, score: 10 + levelBoost });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function toCandidate(person: Person, activity: Activity, slot: { day: Weekday; window: "morning" | "midday" | "evening" }): Candidate {
  return {
    personId: person.id,
    kind: activity.kind,
    day: slot.day,
    window: slot.window,
    venue: activity.venue,
    venue_zh: activity.venue_zh,
    reason: reasonFor(person, activity, "en"),
    reason_zh: reasonFor(person, activity, "zh-CN"),
  };
}

function reasonFor(p: Person, a: Activity, lang: "en" | "zh-CN"): string {
  if (lang === "zh-CN") {
    return `TA 每周也在这个时段${kindZh(a.kind)}，常去${a.area_zh}。你们大概率会遇上，只是这次有人把这件事说开。`;
  }
  return `They ${kindEn(a.kind)} at that same slot most weeks, usually around ${a.area}. You'd probably cross paths eventually — this time someone's putting it on the table.`;
}
function kindEn(k: ActivityKind) {
  return ({ tennis: "play tennis", run: "run", climb: "climb", cook: "cook", exhibition: "hit shows", bookstore: "haunt bookstores" } as const)[k];
}
function kindZh(k: ActivityKind) {
  return ({ tennis: "打网球", run: "跑步", climb: "攀岩", cook: "做饭", exhibition: "看展", bookstore: "逛书店" } as const)[k];
}

// ---- Near-misses --------------------------------------------------------
//
// Only "same kind, different slot" — we don't push cross-activity
// suggestions anymore; if the user picked tennis, they mean tennis.

function findNearMisses(state: SideState): NearMiss[] {
  const user = state.user;
  if (!user) return [];
  const key = (s: { day: Weekday; window: "morning" | "midday" | "evening" }) => `${s.day}-${s.window}`;
  const userSlots = new Set(user.slots.map(key));
  const buckets = new Map<string, NearMiss>();

  for (const p of PEOPLE) {
    if (state.skipped.includes(p.id)) continue;
    for (const act of p.activities) {
      if (act.kind !== user.kind) continue;
      for (const slot of act.slots) {
        if (userSlots.has(key(slot))) continue;
        const k = key(slot);
        const existing = buckets.get(k);
        if (existing) existing.personCount += 1;
        else buckets.set(k, { slot, personCount: 1 });
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.personCount - a.personCount);
}

// ---- Recompute ----------------------------------------------------------

function recompute(s: SideState): SideState {
  if (!s.user) return { ...s, candidate: null, nearMisses: [], poolExhausted: false };
  const matches = findAllMatches(s);
  if (matches.length === 0) {
    // No candidate for this exact slot — offer near-miss instead.
    // Distinguish "pool exhausted" (we've already been through the good
    // ones and skipped them) from "truly no one".
    const totalForKindSlot = PEOPLE.reduce((n, p) => {
      for (const act of p.activities) {
        if (act.kind !== s.user!.kind) continue;
        if (overlap(s.user!, act)) return n + 1;
      }
      return n;
    }, 0);
    const exhausted = totalForKindSlot > 0 && s.skipped.length >= totalForKindSlot;
    return { ...s, candidate: null, nearMisses: findNearMisses(s), poolExhausted: exhausted };
  }
  const m = matches[0];
  return { ...s, candidate: toCandidate(m.person, m.activity, m.slot), nearMisses: [], poolExhausted: false };
}

// ---- Public API ---------------------------------------------------------

export function start(): SideState {
  return { ...EMPTY };
}

export function setUserActivity(s: SideState, user: UserActivity): SideState {
  return recompute({ ...s, user, skipped: [], candidate: null });
}

export function swap(s: SideState): SideState {
  if (!s.candidate) return s;
  return recompute({ ...s, skipped: [...s.skipped, s.candidate.personId], candidate: null });
}

export function addSlot(s: SideState, slot: { day: Weekday; window: "morning" | "midday" | "evening" }): SideState {
  if (!s.user) return s;
  const exists = s.user.slots.some((x) => x.day === slot.day && x.window === slot.window);
  const nextUser = exists ? s.user : { ...s.user, slots: [...s.user.slots, slot] };
  return recompute({ ...s, user: nextUser });
}

// The opener text used to seed the connections thread. One template per
// kind — the user can rewrite it after the fact inside connections.
export function makeOpener(candidate: Candidate, user: UserActivity, lang: "en" | "zh-CN"): string {
  const kindZhMap: Record<ActivityKind, string> = {
    tennis: "打网球", run: "跑步", climb: "攀岩", cook: "做饭", exhibition: "看展", bookstore: "逛书店",
  };
  const kindEnMap: Record<ActivityKind, string> = {
    tennis: "play tennis", run: "go running", climb: "climb", cook: "cook", exhibition: "hit exhibitions", bookstore: "hang around bookstores",
  };
  const dayZh = { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" }[candidate.day];
  const dayEn = { mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays", sun: "Sundays" }[candidate.day];
  const winZh = { morning: "上午", midday: "中午", evening: "晚上" }[candidate.window];
  const winEn = { morning: "morning", midday: "midday", evening: "evening" }[candidate.window];
  if (lang === "zh-CN") {
    return `看到你也在${dayZh}${winZh}${kindZhMap[user.kind]}——我常在${candidate.venue_zh}。要不要一起？`;
  }
  return `Saw you also ${kindEnMap[user.kind]} on ${dayEn} ${winEn}s — I'm often at ${candidate.venue}. Want to go together?`;
}

// ---- Persistence --------------------------------------------------------

const KEY = "kindred:sidebyside.v2";
export function load(): SideState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SideState>;
    // If restoring with a user but stale computed fields, recompute.
    const base: SideState = { ...EMPTY, ...parsed };
    return base.user ? recompute(base) : base;
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

// Silence unused-import warnings if a shared helper isn't used elsewhere.
export type _KeepPeopleFn = typeof getPersonById;
