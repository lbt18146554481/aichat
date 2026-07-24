// The user's own Profile — the SOURCE OF TRUTH for "who you are" inside
// Kindred. Three sections, each with a clear reader:
//   01 Vitals      → identity + system hard-filter (same city)
//   02 Moments     → other real people (Introduce Someone right pane)
//   03 Favorites   → other real people (cultural taste; multi-entry)

export type WorkKind = "book" | "film" | "music" | "exhibition" | "food" | "other";

export interface ProfileMoment {
  promptId: string;
  answer: string;       // user's own words, stored verbatim
}

export interface Favorite {
  kind: WorkKind;
  title: string;
  why: string;          // one sentence
}

// ---------- Profile --------------------------------------------------------

export interface Profile {
  // L1 vitals
  avatar: string;        // data URL, empty if unset (optional)
  name: string;
  age: number | null;
  city: string;
  occupation: string;
  mbti: string;          // optional, "" or one of 16 types
  // L2 specificity
  moments: ProfileMoment[];
  favorites: Favorite[];
}

export const EMPTY_PROFILE: Profile = {
  avatar: "",
  name: "",
  age: null,
  city: "",
  occupation: "",
  mbti: "",
  moments: [],
  favorites: [],
};


export const MIN_MOMENTS = 3;
export const MIN_FAVORITES = 1;
export const MAX_FAVORITES = 6;

const KEY = "kindred:profile.v1";

// Legacy shape we may find in localStorage from earlier versions.
interface LegacyProfile extends Partial<Profile> {
  oneWork?: { kind: WorkKind; title: string; why: string } | null;
  compatibility?: unknown;
  activities?: unknown;
}

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as LegacyProfile;
    const favorites: Favorite[] = Array.isArray(parsed.favorites)
      ? (parsed.favorites as Favorite[])
      : parsed.oneWork && parsed.oneWork.title
      ? [{ kind: parsed.oneWork.kind, title: parsed.oneWork.title, why: parsed.oneWork.why }]
      : [];
    // Drop legacy fields (activities, compatibility, oneWork) silently.
    const { activities: _a, compatibility: _c, oneWork: _o, ...rest } = parsed;
    void _a; void _c; void _o;
    return {
      ...EMPTY_PROFILE,
      ...rest,
      moments: Array.isArray(parsed.moments) ? parsed.moments : [],
      favorites,
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

function filledFavorites(p: Profile): Favorite[] {
  return p.favorites.filter((f) => f.title.trim().length > 0 && f.why.trim().length > 0);
}

export function isProfileComplete(p: Profile): boolean {
  return isVitalsComplete(p)
    && p.moments.filter((m) => m.answer.trim().length > 0).length >= MIN_MOMENTS
    && filledFavorites(p).length >= MIN_FAVORITES;
}

export function profileProgress(p: Profile): { done: number; total: number } {
  let done = 0;
  const total = 3;
  if (isVitalsComplete(p)) done++;
  if (p.moments.filter((m) => m.answer.trim().length > 0).length >= MIN_MOMENTS) done++;
  if (filledFavorites(p).length >= MIN_FAVORITES) done++;
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

// ---------- Favorites ------------------------------------------------------

export function addFavorite(p: Profile, f: Favorite): Profile {
  if (p.favorites.length >= MAX_FAVORITES) return p;
  return { ...p, favorites: [...p.favorites, f] };
}

export function updateFavorite(p: Profile, index: number, patch: Partial<Favorite>): Profile {
  return {
    ...p,
    favorites: p.favorites.map((f, i) => (i === index ? { ...f, ...patch } : f)),
  };
}

export function removeFavorite(p: Profile, index: number): Profile {
  return { ...p, favorites: p.favorites.filter((_, i) => i !== index) };
}
