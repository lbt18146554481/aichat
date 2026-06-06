import { EMPTY_SEEKER, type Seeker, type Turn } from "./types";

const SEEKER_KEY = "muse:seeker";
const CONV_KEY = "muse:conversation";
const LEGACY_KEYS = ["red-threads-profile", "red-threads-chat"];

const isBrowser = () => typeof window !== "undefined";

function clearLegacy() {
  if (!isBrowser()) return;
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
}

export function loadSeeker(): Seeker {
  if (!isBrowser()) return { ...EMPTY_SEEKER };
  clearLegacy();
  try {
    const raw = localStorage.getItem(SEEKER_KEY);
    if (!raw) return { ...EMPTY_SEEKER };
    return { ...EMPTY_SEEKER, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_SEEKER };
  }
}

export function saveSeeker(s: Seeker) {
  if (!isBrowser()) return;
  localStorage.setItem(SEEKER_KEY, JSON.stringify(s));
}

export function loadConversation(): Turn[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Turn[];
  } catch {
    return [];
  }
}

export function saveConversation(turns: Turn[]) {
  if (!isBrowser()) return;
  localStorage.setItem(CONV_KEY, JSON.stringify(turns));
}

export function resetAll() {
  if (!isBrowser()) return;
  localStorage.removeItem(SEEKER_KEY);
  localStorage.removeItem(CONV_KEY);
}
