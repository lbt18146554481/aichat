// Chat storage — multi-conversation localStorage layer

export type ChatStage = "intro" | "followups" | "closing" | "done";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  t: number;
  cards?: string[]; // person ids referenced by this message
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  signals: string[];
  stage: ChatStage;
  followUpsAnswered: number;
  portrait: string;
}

const KEY = "bloom:chats";
const isBrowser = () => typeof window !== "undefined";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function loadChats(): Chat[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Chat[];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(chats));
}

export function loadChat(id: string): Chat | null {
  return loadChats().find((c) => c.id === id) ?? null;
}

export function upsertChat(chat: Chat) {
  const chats = loadChats();
  const i = chats.findIndex((c) => c.id === chat.id);
  if (i >= 0) chats[i] = chat;
  else chats.unshift(chat);
  saveChats(chats);
}

export function deleteChat(id: string) {
  saveChats(loadChats().filter((c) => c.id !== id));
}

export function newChat(): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    signals: [],
    stage: "intro",
    followUpsAnswered: 0,
    portrait: "",
  };
}

export function titleFromMessage(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 36 ? t.slice(0, 36) + "…" : t || "New chat";
}

export function allFoundPeopleIds(): string[] {
  const ids = new Set<string>();
  for (const c of loadChats()) {
    for (const m of c.messages) {
      if (m.cards) for (const id of m.cards) ids.add(id);
    }
  }
  return Array.from(ids);
}

export function allSignals(): string[] {
  const s = new Set<string>();
  for (const c of loadChats()) for (const sig of c.signals) s.add(sig);
  return Array.from(s);
}

// Cleanup legacy keys from previous design iterations
export function clearLegacyKeys() {
  if (!isBrowser()) return;
  const legacy = [
    "red-threads-profile",
    "red-threads-chat",
    "muse:seeker",
    "muse:conversation",
    "bloom:seeker",
    "bloom:conversation",
    "bloom:agents",
  ];
  for (const k of legacy) localStorage.removeItem(k);
}
