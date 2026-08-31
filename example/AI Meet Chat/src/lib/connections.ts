// Connections — the closed loop around Say hello.
//
// Statuses:
//   - "sent"       : I sent a hello, awaiting resolution. A sees "delivered".
//   - "incoming"   : They sent me a hello. I haven't responded.
//   - "connected"  : Bilateral. Normal thread.
//   - "faded"      : Went nowhere. Folded away, never surfaced as a bad signal.

import { PEOPLE, getPersonById } from "./people";
import { loadProfile } from "./profile";
import { isBlocked } from "./blocklist";

export type ConnStatus = "sent" | "incoming" | "connected" | "faded";

export interface ChatMsg {
  id: string;
  from: "me" | "them";
  t: number;
  text: string;
}

export interface HelloFromMe {
  quotedMomentId: string | null;
  reply: string;
}

export interface HelloFromThem {
  quotedUserMomentPromptId: string;
  reply: string;
}

export interface Connection {
  personId: string;
  status: ConnStatus;
  initiatedBy: "me" | "them";
  helloAt: number;
  connectedAt?: number;
  fadedAt?: number;
  lastSeenAt?: number;
  originSessionId?: string;
  fromMe?: HelloFromMe;
  fromThem?: HelloFromThem;
  messages: ChatMsg[];
}

const KEY = "kindred:connections.v3";
const LISTENERS = new Set<() => void>();

// Ephemeral "they're typing" state — not persisted.
const TYPING = new Set<string>();
export function isTyping(personId: string): boolean {
  return TYPING.has(personId);
}

function emit() {
  LISTENERS.forEach((fn) => fn());
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function read(): Record<string, Connection> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Connection>) : {};
  } catch {
    return {};
  }
}
function write(state: Record<string, Connection>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
  emit();
}

export function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => {
    LISTENERS.delete(fn);
  };
}

export function list(): Connection[] {
  return Object.values(read())
    .filter((c) => !isBlocked(c.personId))
    .sort((a, b) => (b.connectedAt ?? b.helloAt) - (a.connectedAt ?? a.helloAt));
}

export function get(personId: string): Connection | null {
  return read()[personId] ?? null;
}

// ---- Outgoing: I say hello ----------------------------------------------

export function sayHello(
  personId: string,
  fromMe: HelloFromMe,
  originSessionId?: string,
): Connection {
  const state = read();
  const existing = state[personId];
  if (existing && existing.status !== "faded") return existing;

  const conn: Connection = {
    personId,
    status: "sent",
    initiatedBy: "me",
    helloAt: Date.now(),
    originSessionId,
    fromMe,
    messages: [],
  };
  state[personId] = conn;
  write(state);
  scheduleResolution(personId);
  return conn;
}

// I withdraw a hello I sent before the other side has responded.
export function withdrawSent(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "sent") return;
  delete state[personId];
  write(state);
}

// The other side "decides" locally: 70% wants to talk, 30% fades.
function scheduleResolution(personId: string) {
  if (typeof window === "undefined") return;
  const delay = 30_000 + Math.floor(Math.random() * 60_000);
  window.setTimeout(() => {
    const state = read();
    const conn = state[personId];
    if (!conn || conn.status !== "sent") return;

    const wantsToTalk = Math.random() < 0.7;
    if (!wantsToTalk) {
      conn.status = "faded";
      conn.fadedAt = Date.now();
      write(state);
      return;
    }

    const profile = loadProfile();
    const userMoments = profile.moments.filter((m) => m.answer.trim().length > 0);
    if (userMoments.length === 0) {
      conn.status = "faded";
      conn.fadedAt = Date.now();
      write(state);
      return;
    }
    const zh = typeof navigator !== "undefined" && navigator.language.startsWith("zh");
    const pick = userMoments[Math.floor(Math.random() * userMoments.length)];
    const replies = zh ? REPLIES_ZH : REPLIES_EN;
    const reply = replies[Math.floor(Math.random() * replies.length)];

    conn.status = "connected";
    conn.connectedAt = Date.now();
    conn.fromThem = { quotedUserMomentPromptId: pick.promptId, reply };
    write(state);
  }, delay);
}

const REPLIES_EN = [
  "That landed. I think about this too — more than I'd admit.",
  "Yes — that's exactly the part I'd have picked.",
  "I read this twice. The second time was better.",
  "This is the answer I'd want to talk about over a long dinner.",
  "I have a version of this. Less elegant, but the same shape.",
];
const REPLIES_ZH = [
  "这句我看了两遍。第二遍更好。",
  "我也是这样——多到我不太愿意承认。",
  "这正是我会想聊的那种回答，得有顿长晚饭才说得完。",
  "我有一个我自己的版本。没这么好看，但是一样的形状。",
  "嗯——你挑的那一段，也是我会挑的那一段。",
];

// A wider pool for ongoing chat so the thread doesn't feel canned.
const CHAT_REPLIES_EN = [
  "Yeah — I feel that too.",
  "Say more about that?",
  "Ha, I wasn't expecting that answer.",
  "Where did you land on it?",
  "Same — took me a while to get there though.",
  "I'd want to sit with that a minute.",
  "That's a good line. I'm stealing it.",
  "Curious what made you think of it now.",
];
const CHAT_REPLIES_ZH = [
  "嗯，我也这么觉得。",
  "再多说一点？",
  "哈，这答案有点出乎我意料。",
  "你最后是怎么想的？",
  "一样——我也是绕了一圈才想明白。",
  "让我先坐着想一分钟。",
  "这句话不错，我要偷走了。",
  "好奇你怎么会突然想到这个。",
];

// ---- Incoming: they say hello to me -------------------------------------

export function maybeSeedIncoming() {
  if (typeof window === "undefined") return;
  const profile = loadProfile();
  const userMoments = profile.moments.filter((m) => m.answer.trim().length > 0);
  if (userMoments.length < 3) return;

  const state = read();
  const already = new Set(Object.keys(state));
  const hasIncoming = Object.values(state).some((c) => c.status === "incoming");
  if (hasIncoming) return;

  const candidates = PEOPLE.filter(
    (p) => !already.has(p.id) && !isBlocked(p.id) && p.moments.length > 0,
  );
  if (candidates.length === 0) return;
  const person = candidates[Math.floor(Math.random() * candidates.length)];

  const zh = typeof navigator !== "undefined" && navigator.language.startsWith("zh");
  const pick = userMoments[Math.floor(Math.random() * userMoments.length)];
  const replies = zh ? REPLIES_ZH : REPLIES_EN;
  const reply = replies[Math.floor(Math.random() * replies.length)];

  state[person.id] = {
    personId: person.id,
    status: "incoming",
    initiatedBy: "them",
    helloAt: Date.now(),
    fromThem: { quotedUserMomentPromptId: pick.promptId, reply },
    messages: [],
  };
  write(state);
}

export function respondToIncoming(personId: string, fromMe: HelloFromMe) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "incoming") return;
  conn.status = "connected";
  conn.connectedAt = Date.now();
  conn.fromMe = fromMe;
  write(state);
}

export function dismissIncoming(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "incoming") return;
  conn.status = "faded";
  conn.fadedAt = Date.now();
  write(state);
}

// Wipe a faded record so `sayHello` can start fresh.
export function undoFadedFor(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "faded") return;
  delete state[personId];
  write(state);
}

// Explicit "remove from list" for faded rows.
export function removeFaded(personId: string) {
  undoFadedFor(personId);
}

// ---- Thread messaging (connected) ---------------------------------------

export function send(personId: string, text: string) {
  const t = text.trim();
  if (!t) return;
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "connected") return;
  conn.messages.push({ id: uid(), from: "me", t: Date.now(), text: t });
  write(state);

  // Show typing shortly, then send a reply.
  const typeAfter = 1500 + Math.floor(Math.random() * 2500);
  const replyAfter = typeAfter + 3000 + Math.floor(Math.random() * 5000);
  window.setTimeout(() => {
    if (!read()[personId]) return;
    TYPING.add(personId);
    emit();
  }, typeAfter);
  window.setTimeout(() => {
    const s = read();
    const c = s[personId];
    TYPING.delete(personId);
    if (!c || c.status !== "connected") {
      emit();
      return;
    }
    const zh = typeof navigator !== "undefined" && navigator.language.startsWith("zh");
    const pool = zh ? CHAT_REPLIES_ZH : CHAT_REPLIES_EN;
    const reply = pool[Math.floor(Math.random() * pool.length)];
    c.messages.push({ id: uid(), from: "them", t: Date.now(), text: reply });
    write(s);
  }, replyAfter);
}

// ---- Read tracking ------------------------------------------------------

export function markSeen(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn) return;
  conn.lastSeenAt = Date.now();
  write(state);
}

export function hasUnseenFor(conn: Connection): boolean {
  if (conn.status === "incoming") return (conn.lastSeenAt ?? 0) < conn.helloAt;
  if (conn.status !== "connected") return false;
  const lastIncoming = [...conn.messages].reverse().find((m) => m.from === "them");
  const last = lastIncoming?.t ?? conn.connectedAt ?? conn.helloAt;
  return (conn.lastSeenAt ?? 0) < last;
}

export function hasUnseen(): boolean {
  return list().some((c) => hasUnseenFor(c));
}

// Cross-cut helpers -------------------------------------------------------

export function hasFadedWith(personId: string): boolean {
  const conn = read()[personId];
  return conn?.status === "faded";
}

export function rehydrate() {
  if (typeof window === "undefined") return;
  const state = read();
  for (const conn of Object.values(state)) {
    if (conn.status === "sent") {
      scheduleResolution(conn.personId);
    }
  }
  maybeSeedIncoming();
}

export type _KeepPeople = typeof getPersonById;
