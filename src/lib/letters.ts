// Letters — the asynchronous, scarce way two strangers reach each other.
//
// Rules of the system (intentionally constrained):
//   - 1 letter outbound per UTC day
//   - up to 3 sent letters can be "in flight" (no reply yet)
//   - after 3 round-trips with the same person, real-time chat unlocks
//   - no online status, no read receipts — only sent / replied / archived
//
// Replies are mocked locally so the demo feels alive. Each letter the user
// sends to a candidate triggers a delayed pseudo-reply from that candidate.
// All persistence is localStorage; nothing leaves the browser.

import { getPersonById } from "./people";

export type LetterAuthor = "me" | "them";
export type LetterStatus = "sent" | "replied" | "archived";

export interface Letter {
  id: string;
  author: LetterAuthor;
  body: string;
  sentAt: number;     // ms epoch
}

export interface LetterThread {
  personId: string;
  letters: Letter[];          // chronological
  status: LetterStatus;       // status of the *thread* (whether they replied)
  unlockedChat: boolean;      // after 3 round-trips
  lastReadAt: number;         // for "unread" badges
  startedAt: number;
}

export interface LetterStore {
  threads: Record<string, LetterThread>;   // keyed by personId
  // Track outbound sends per UTC day so we can enforce the daily quota.
  // Format: "YYYY-MM-DD" → count
  sendsByDay: Record<string, number>;
}

const EMPTY_STORE: LetterStore = { threads: {}, sendsByDay: {} };
const KEY = "kindred:letters.v1";

export const DAILY_LIMIT = 1;
export const IN_FLIGHT_LIMIT = 3;
export const UNLOCK_AFTER_ROUNDTRIPS = 3;
export const SOFT_CHAR_LIMIT = 750;   // ~250 words

function uid() { return Math.random().toString(36).slice(2, 10); }
function todayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---- persistence --------------------------------------------------------

export function loadLetters(): LetterStore {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STORE;
    return { ...EMPTY_STORE, ...(JSON.parse(raw) as Partial<LetterStore>) };
  } catch { return EMPTY_STORE; }
}

export function saveLetters(store: LetterStore) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* noop */ }
}

// ---- quotas -------------------------------------------------------------

export function sendsToday(store: LetterStore): number {
  return store.sendsByDay[todayKey()] ?? 0;
}
export function remainingToday(store: LetterStore): number {
  return Math.max(0, DAILY_LIMIT - sendsToday(store));
}
export function inFlightCount(store: LetterStore): number {
  return Object.values(store.threads).filter((t) => t.status === "sent").length;
}
export function canSendNow(store: LetterStore, personId: string): { ok: boolean; reason?: "quota" | "inflight" | "already" } {
  const existing = store.threads[personId];
  // If we already have an open thread waiting on them, don't allow another send.
  if (existing && existing.status === "sent" && existing.letters[existing.letters.length - 1]?.author === "me") {
    return { ok: false, reason: "already" };
  }
  if (remainingToday(store) <= 0) return { ok: false, reason: "quota" };
  if (inFlightCount(store) >= IN_FLIGHT_LIMIT && !existing) return { ok: false, reason: "inflight" };
  return { ok: true };
}

// ---- actions ------------------------------------------------------------

export function sendLetter(store: LetterStore, personId: string, body: string): LetterStore {
  const text = body.trim();
  if (!text) return store;
  const existing = store.threads[personId];
  const now = Date.now();
  const letter: Letter = { id: uid(), author: "me", body: text, sentAt: now };
  const thread: LetterThread = existing
    ? { ...existing, letters: [...existing.letters, letter], status: "sent", lastReadAt: now }
    : { personId, letters: [letter], status: "sent", unlockedChat: false, lastReadAt: now, startedAt: now };
  const day = todayKey();
  return {
    ...store,
    threads: { ...store.threads, [personId]: thread },
    sendsByDay: { ...store.sendsByDay, [day]: (store.sendsByDay[day] ?? 0) + 1 },
  };
}

// Mock reply generator — produces a short, in-character response.
// The "tone" varies a little so threads feel distinct.
const REPLY_TEMPLATES: Array<(name: string) => { en: string; zh: string }> = [
  (n) => ({
    en: `Hi — thanks for writing. Honestly I almost didn't open this; I'm wary of the format. But the line about ${pickWord()} stuck. Tell me one true thing about your week and I'll tell you mine. — ${n}`,
    zh: `嗨，谢谢你写来。说实话，我差点没打开——对这种形式有点警惕。但你说到"${pickWord(true)}"那句让我停下来了。说说你这周一件真实的事，我也说一件给你听。—— ${n}`,
  }),
  (n) => ({
    en: `That was a more careful letter than I expected. I'm not great at first messages either, so: yes, let's keep going. What were you doing the hour before you wrote this? — ${n}`,
    zh: `这封信比我预期的要用心。我自己也不太会写第一封信——所以，好的，继续聊吧。写之前那一个小时，你在做什么？—— ${n}`,
  }),
  (n) => ({
    en: `Okay. I'll write back properly tomorrow morning with coffee — but I wanted you to know it landed. Don't disappear. — ${n}`,
    zh: `好的。明早就着咖啡好好回你——但想先告诉你，信收到了。别消失。—— ${n}`,
  }),
];
const WORDS_EN = ["rainy afternoons", "long walks", "books I haven't finished", "quiet mornings", "small kitchens"];
const WORDS_ZH = ["下雨的午后", "长长的散步", "没读完的书", "安静的清晨", "小厨房"];
function pickWord(zh = false): string {
  const arr = zh ? WORDS_ZH : WORDS_EN;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateReply(personId: string, lang: "en" | "zh-CN"): Letter | null {
  const p = getPersonById(personId);
  if (!p) return null;
  const tmpl = REPLY_TEMPLATES[Math.floor(Math.random() * REPLY_TEMPLATES.length)];
  const name = lang === "zh-CN" ? p.name_zh : p.name;
  const body = tmpl(name);
  return { id: uid(), author: "them", body: lang === "zh-CN" ? body.zh : body.en, sentAt: Date.now() };
}

export function applyReply(store: LetterStore, personId: string, letter: Letter): LetterStore {
  const t = store.threads[personId];
  if (!t) return store;
  const letters = [...t.letters, letter];
  const roundtrips = letters.filter((l) => l.author === "them").length;
  return {
    ...store,
    threads: {
      ...store.threads,
      [personId]: {
        ...t,
        letters,
        status: "replied",
        unlockedChat: roundtrips >= UNLOCK_AFTER_ROUNDTRIPS,
      },
    },
  };
}

export function markRead(store: LetterStore, personId: string): LetterStore {
  const t = store.threads[personId];
  if (!t) return store;
  return { ...store, threads: { ...store.threads, [personId]: { ...t, lastReadAt: Date.now() } } };
}

export function archiveThread(store: LetterStore, personId: string): LetterStore {
  const t = store.threads[personId];
  if (!t) return store;
  return { ...store, threads: { ...store.threads, [personId]: { ...t, status: "archived" } } };
}

// ---- selectors ----------------------------------------------------------

export function threadOf(store: LetterStore, personId: string | null): LetterThread | null {
  if (!personId) return null;
  return store.threads[personId] ?? null;
}

export function unreadCount(store: LetterStore): number {
  let n = 0;
  for (const t of Object.values(store.threads)) {
    const last = t.letters[t.letters.length - 1];
    if (last && last.author === "them" && last.sentAt > t.lastReadAt) n++;
  }
  return n;
}

export function allThreadsSorted(store: LetterStore): LetterThread[] {
  return Object.values(store.threads).sort((a, b) => {
    const la = a.letters[a.letters.length - 1]?.sentAt ?? a.startedAt;
    const lb = b.letters[b.letters.length - 1]?.sentAt ?? b.startedAt;
    return lb - la;
  });
}
