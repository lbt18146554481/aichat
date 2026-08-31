// Profile shape — shared, no localStorage.

export type WorkKind = "book" | "film" | "music" | "exhibition" | "food" | "sport" | "other";

export type Gender = "" | "female" | "male" | "nonbinary" | "prefer_not_to_say";
export type Orientation =
  | ""
  | "straight"
  | "gay"
  | "lesbian"
  | "bi"
  | "pan"
  | "asexual"
  | "prefer_not_to_say";

export interface ProfileMoment {
  promptId: string;
  answer: string;
}

export interface Favorite {
  kind: WorkKind;
  title: string;
  why: string;
}

export interface Profile {
  avatar: string;
  name: string;
  age: number | null;
  city: string;
  occupation: string;
  gender: Gender;
  orientation: Orientation;
  mbti: string;
  moments: ProfileMoment[];
  favorites: Favorite[];
  hidden: string[];
}

export const EMPTY_PROFILE: Profile = {
  avatar: "",
  name: "",
  age: null,
  city: "",
  occupation: "",
  gender: "",
  orientation: "",
  mbti: "",
  moments: [],
  favorites: [],
  hidden: [],
};

export const MIN_MOMENTS = 3;
export const MIN_FAVORITES = 1;
export const MAX_FAVORITES = 6;

export function isHidden(p: Profile, key: string): boolean {
  return Array.isArray(p.hidden) && p.hidden.includes(key);
}

export function toggleHidden(p: Profile, key: string): Profile {
  const cur = Array.isArray(p.hidden) ? p.hidden : [];
  return { ...p, hidden: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
}

export function isProfileComplete(p: Profile | null | undefined): boolean {
  if (!p) return false;
  if (!p.name.trim() || !p.city.trim()) return false;
  const moments = (p.moments ?? []).filter((m) => m.answer.trim().length > 0);
  const favorites = (p.favorites ?? []).filter((f) => f.title.trim() && f.why.trim());
  return moments.length >= MIN_MOMENTS && favorites.length >= MIN_FAVORITES;
}
