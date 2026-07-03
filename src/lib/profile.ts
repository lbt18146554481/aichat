// The user's own Profile — the SOURCE OF TRUTH for "who you are" inside
// Kindred. Three layers, each with a different reader:
//   L1 Vitals          → system hard-filters (name/age/city/occupation)
//   L2 Compatibility   → system soft-signals (situational answers, activities,
//                        optional MBTI tag) — all optional, no completion gate
//   L3 Specificity     → other real people (Moments + One Work)
// The Agent reads this; it never mutates it.

import type { ActivityKind } from "./types";

export type WorkKind = "book" | "film" | "music" | "exhibition" | "food" | "other";

export interface ProfileMoment {
  promptId: string;
  answer: string;       // user's own words, stored verbatim
}

export interface OneWork {
  kind: WorkKind;
  title: string;
  why: string;          // one sentence
}

// ---------- Layer 2 --------------------------------------------------------

// Three situational choices. Each is optional. Values are stable string ids
// so the matcher can compare across users without depending on wording.
export interface CompatibilityAnswers {
  weekend?: "quiet_recharge" | "one_close_friend" | "out_and_about";
  conflict?: "talk_now" | "cool_off_first" | "write_it_out";
  five_years?: "depth_one_thing" | "range_many_things" | "stability_family";
}

export type ActivityCadence = "weekly" | "monthly" | "occasional";

export interface UserActivity {
  kind: ActivityKind;
  area: string;          // user-typed neighborhood label
  cadence: ActivityCadence;
}

// ---------- Profile --------------------------------------------------------

export interface Profile {
  // L1 vitals
  name: string;
  age: number | null;
  city: string;
  occupation: string;
  // L2 compatibility (all optional, do not affect completion)
  activities: UserActivity[];
  compatibility: CompatibilityAnswers;
  mbti?: string;               // free-form 4-letter tag, display only
  // L3 specificity
  moments: ProfileMoment[];
  oneWork: OneWork | null;
}

export const EMPTY_PROFILE: Profile = {
  name: "",
  age: null,
  city: "",
  occupation: "",
  activities: [],
  compatibility: {},
  mbti: "",
  moments: [],
  oneWork: null,
};

export const MIN_MOMENTS = 3;
export const MAX_ACTIVITIES = 3;
const KEY = "kindred:profile.v1";

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    // Merge over defaults so older stored shapes get new fields as empty.
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      ...EMPTY_PROFILE,
      ...parsed,
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      compatibility: parsed.compatibility ?? {},
      moments: Array.isArray(parsed.moments) ? parsed.moments : [],
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
}

export function hasName(p: Profile): boolean {
  return p.name.trim().length > 0;
}

export function isVitalsComplete(p: Profile): boolean {
  return p.name.trim().length > 0
    && typeof p.age === "number"
    && p.age >= 18
    && p.city.trim().length > 0
    && p.occupation.trim().length > 0;
}


export function isProfileComplete(p: Profile): boolean {
  return isVitalsComplete(p)
    && p.moments.filter((m) => m.answer.trim().length > 0).length >= MIN_MOMENTS
    && p.oneWork !== null
    && p.oneWork.title.trim().length > 0
    && p.oneWork.why.trim().length > 0;
}

export function profileProgress(p: Profile): { done: number; total: number } {
  let done = 0;
  const total = 3;
  if (isVitalsComplete(p)) done++;
  if (p.moments.filter((m) => m.answer.trim().length > 0).length >= MIN_MOMENTS) done++;
  if (p.oneWork && p.oneWork.title.trim() && p.oneWork.why.trim()) done++;
  return { done, total };
}

export function upsertMoment(p: Profile, promptId: string, answer: string): Profile {
  const existing = p.moments.filter((m) => m.promptId !== promptId);
  if (answer.trim().length === 0) return { ...p, moments: existing };
  return { ...p, moments: [...existing, { promptId, answer: answer.trim() }] };
}

export function removeMoment(p: Profile, promptId: string): Profile {
  return { ...p, moments: p.moments.filter((m) => m.promptId !== promptId) };
}

// ---------- Layer 2 mutators ----------------------------------------------

export function setCompatibility<K extends keyof CompatibilityAnswers>(
  p: Profile, key: K, value: CompatibilityAnswers[K] | undefined,
): Profile {
  const next = { ...p.compatibility };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return { ...p, compatibility: next };
}

export function addActivity(p: Profile, a: UserActivity): Profile {
  if (p.activities.length >= MAX_ACTIVITIES) return p;
  return { ...p, activities: [...p.activities, a] };
}

export function updateActivity(p: Profile, index: number, patch: Partial<UserActivity>): Profile {
  return {
    ...p,
    activities: p.activities.map((a, i) => (i === index ? { ...a, ...patch } : a)),
  };
}

export function removeActivity(p: Profile, index: number): Profile {
  return { ...p, activities: p.activities.filter((_, i) => i !== index) };
}
