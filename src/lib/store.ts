import { EMPTY_PROFILE, type ChatMessage, type UserProfile } from "./types";

const PROFILE_KEY = "red-threads-profile";
const CHAT_KEY = "red-threads-chat";

const isBrowser = () => typeof window !== "undefined";

export function loadProfile(): UserProfile {
  if (!isBrowser()) return { ...EMPTY_PROFILE };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function saveProfile(profile: UserProfile) {
  if (!isBrowser()) return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadChat(): ChatMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveChat(messages: ChatMessage[]) {
  if (!isBrowser()) return;
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

export function resetAll() {
  if (!isBrowser()) return;
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(CHAT_KEY);
}

export function isProfileComplete(p: UserProfile): boolean {
  return Boolean(
    p.nickname &&
      p.age &&
      p.city &&
      p.interests.length > 0 &&
      p.personalityTags.length > 0,
  );
}
