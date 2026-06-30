// The user's own Profile — the SOURCE OF TRUTH for "who you are" inside
// Kindred. Replaces the previous pattern of having a chat Agent infer/store
// identity. Edited via /profile, surfaced to other users wherever Moments
// or vitals would appear.

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

export interface Profile {
  name: string;
  age: number | null;
  city: string;
  occupation: string;
  moments: ProfileMoment[];   // need ≥ 3 to be considered complete
  oneWork: OneWork | null;
}

export const EMPTY_PROFILE: Profile = {
  name: "",
  age: null,
  city: "",
  occupation: "",
  moments: [],
  oneWork: null,
};

export const MIN_MOMENTS = 3;
const KEY = "kindred:profile.v1";

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
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
