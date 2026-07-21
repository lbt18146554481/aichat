// Connections — the closed loop around Say hello.
//
// There are only two branches after A sends hello to B:
//   1. B wants to talk → both sides land in a real thread.
//   2. B doesn't want to talk → the hello quietly fades on A's side and
//      leaves B's inbox on dismiss. No "rejected", no countdown.
//
// Statuses:
//   - "sent"       : I sent a hello, awaiting resolution. A sees "delivered".
//   - "incoming"   : They sent me a hello. I haven't responded.
//   - "connected"  : Bilateral. Normal thread.
//   - "faded"      : Went nowhere. Folded away, never surfaced as a bad signal.

import { PEOPLE, getPersonById } from "./people";
import { loadProfile } from "./profile";

export type ConnStatus = "sent" | "incoming" | "connected" | "faded";

export interface ChatMsg {
  id: string;
  from: "me" | "them";
  t: number;
  text: string;
}

export interface HelloFromMe {
  quotedMomentId: string | null;   // → person.moments[id]; null = no quote
  reply: string;
}

export interface HelloFromThem {
  quotedUserMomentPromptId: string;  // → user.profile.moments[promptId]
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
  /** The matchmaker session this hello originated from. Lets
   *  "← Back to <name>" return to the exact session + person. */
  originSessionId?: string;
  fromMe?: HelloFromMe;
  fromThem?: HelloFromThem;
  messages: ChatMsg[];
}

const KEY = "kindred:connections.v3";
const LISTENERS = new Set<() => void>();

function emit() { LISTENERS.forEach((fn) => fn()); }
function uid() { return Math.random().toString(36).slice(2, 10); }

function read(): Record<string, Connection> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Connection>) : {};
  } catch { return {}; }
}
function write(state: Record<string, Connection>) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
  emit();
}

export function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => { LISTENERS.delete(fn); };
}

export function list(): Connection[] {
  return Object.values(read()).sort(
    (a, b) => (b.connectedAt ?? b.helloAt) - (a.connectedAt ?? a.helloAt),
  );
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
  // Allow re-hello after a faded outcome — the plan explicitly keeps the
  // door open. Any live state (sent/incoming/connected) is a no-op.
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

// The other side "decides" locally: 70% wants to talk, 30% fades.
function scheduleResolution(personId: string) {
  if (typeof window === "undefined") return;
  const delay = 30_000 + Math.floor(Math.random() * 60_000); // 30–90s
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

    // They "reply" by quoting one of the user's own moments.
    const profile = loadProfile();
    const userMoments = profile.moments.filter((m) => m.answer.trim().length > 0);
    if (userMoments.length === 0) {
      // Contract broken — no moments to quote. Fade rather than hang.
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

// ---- Incoming: they say hello to me -------------------------------------

// Seeded on demand so the receiving-side UI is not permanently empty. Only
// seeds when the user has enough of their own moments to have plausibly
// been "read".
export function maybeSeedIncoming() {
  if (typeof window === "undefined") return;
  const profile = loadProfile();
  const userMoments = profile.moments.filter((m) => m.answer.trim().length > 0);
  if (userMoments.length < 3) return;

  const state = read();
  const already = new Set(Object.keys(state));
  const hasIncoming = Object.values(state).some((c) => c.status === "incoming");
  if (hasIncoming) return;

  const candidates = PEOPLE.filter((p) => !already.has(p.id) && p.moments.length > 0);
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

// I answer an incoming hello — this makes it bilateral and starts the thread.
export function respondToIncoming(personId: string, fromMe: HelloFromMe) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "incoming") return;
  conn.status = "connected";
  conn.connectedAt = Date.now();
  conn.fromMe = fromMe;
  write(state);
}

// I close the incoming card — "later". Folded away, no notification to them.
export function dismissIncoming(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "incoming") return;
  conn.status = "faded";
  conn.fadedAt = Date.now();
  write(state);
}

// I want to say hello again to someone whose previous hello faded. Wipe
// the connection so `sayHello` starts a fresh "sent" record.
export function undoFadedFor(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn || conn.status !== "faded") return;
  delete state[personId];
  write(state);
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
  // Lightweight local echo so the thread feels alive.
  const delay = 4000 + Math.floor(Math.random() * 8000);
  window.setTimeout(() => {
    const s = read();
    const c = s[personId];
    if (!c) return;
    const zh = typeof navigator !== "undefined" && navigator.language.startsWith("zh");
    const reply = zh ? "嗯，我也这么觉得。" : "Yeah — I feel that too.";
    c.messages.push({ id: uid(), from: "them", t: Date.now(), text: reply });
    write(s);
  }, delay);
}

// ---- Read tracking ------------------------------------------------------

export function markSeen(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn) return;
  conn.lastSeenAt = Date.now();
  write(state);
}

export function hasUnseen(): boolean {
  return list().some((c) => {
    if (c.status === "incoming") return (c.lastSeenAt ?? 0) < c.helloAt;
    if (c.status !== "connected") return false;
    const lastIncoming = [...c.messages].reverse().find((m) => m.from === "them");
    const last = lastIncoming?.t ?? c.connectedAt ?? c.helloAt;
    return (c.lastSeenAt ?? 0) < last;
  });
}

// Cross-cut helpers -------------------------------------------------------

export function hasFadedWith(personId: string): boolean {
  const conn = read()[personId];
  return conn?.status === "faded";
}

export function rehydrate() {
  if (typeof window === "undefined") return;
  // Re-arm any sent-state timers that were mid-flight on last unload.
  const state = read();
  for (const conn of Object.values(state)) {
    if (conn.status === "sent") {
      const elapsed = Date.now() - conn.helloAt;
      if (elapsed > 120_000) {
        // Old pending — resolve now.
        scheduleResolution(conn.personId);
      } else {
        scheduleResolution(conn.personId);
      }
    }
  }
  maybeSeedIncoming();
}

// Silence unused-import warnings on shared type imports.
export type _KeepPeople = typeof getPersonById;
