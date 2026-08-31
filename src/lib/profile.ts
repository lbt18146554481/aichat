// Profile — server-backed with an in-memory cache for sync UI helpers.

import { getProfileFn, saveProfileFn } from "./api/profile.functions";
import {
  EMPTY_PROFILE,
  MAX_FAVORITES,
  MIN_FAVORITES,
  MIN_MOMENTS,
  type Favorite,
  type Profile,
  type ProfileMoment,
  type WorkKind,
  type Gender,
  type Orientation,
  isHidden,
  toggleHidden,
} from "./profile-shape";

export type { Profile, ProfileMoment, Favorite, WorkKind, Gender, Orientation };
export {
  EMPTY_PROFILE,
  MAX_FAVORITES,
  MIN_FAVORITES,
  MIN_MOMENTS,
  isHidden,
  toggleHidden,
};

let cache: Profile = { ...EMPTY_PROFILE };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeProfile(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function loadProfile(): Profile {
  return cache;
}

export async function hydrateProfile(): Promise<Profile> {
  try {
    cache = await getProfileFn();
  } catch {
    cache = { ...EMPTY_PROFILE };
  }
  emit();
  return cache;
}

export function saveProfile(p: Profile) {
  cache = p;
  emit();
  void saveProfileFn({ data: { profile: p as unknown as Record<string, unknown> } }).catch(
    () => {
      /* offline / test env */
    },
  );
}

/** Test helper */
export function _resetProfileCache() {
  cache = { ...EMPTY_PROFILE };
  emit();
}

export async function saveProfileAsync(p: Profile): Promise<Profile> {
  cache = p;
  emit();
  return saveProfileFn({ data: { profile: p as unknown as Record<string, unknown> } });
}

export function hasName(p: Profile): boolean {
  return p.name.trim().length > 0;
}

export function isVitalsComplete(p: Profile): boolean {
  return (
    p.name.trim().length > 0 &&
    typeof p.age === "number" &&
    p.age >= 18 &&
    p.city.trim().length > 0 &&
    p.occupation.trim().length > 0
  );
}

function filledFavorites(p: Profile): Favorite[] {
  return p.favorites.filter((f) => f.title.trim().length > 0 && f.why.trim().length > 0);
}

export function isProfileComplete(p: Profile): boolean {
  return (
    isVitalsComplete(p) &&
    p.moments.filter((m) => m.answer.trim().length > 0).length >= MIN_MOMENTS &&
    filledFavorites(p).length >= MIN_FAVORITES
  );
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
