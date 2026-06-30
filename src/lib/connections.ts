// Connections — the minimum closed loop after Matchmaker shows someone.
//
// Saying hello is NOT a one-tap action: the user has to quote one of the
// other person's Moments and write a one-line response. That payload IS
// the hello. If the other person says hello back (simulated locally, 65%
// within 5–15s), they likewise "quote one of YOUR userMoments + reply" —
// so when the thread opens, both sides have already seen and responded to
// something concrete from each other.

import { getPersonById } from "./people";
import { loadUnderstanding } from "./understanding";

export type ConnStatus = "waiting" | "connected";

export interface ChatMsg {
  id: string;
  from: "me" | "them";
  t: number;
  text: string;
}

export interface HelloFromMe {
  quotedMomentId: string;   // → person.moments[id]
  reply: string;
}

export interface HelloFromThem {
  quotedUserMomentPromptId: string;  // → user.userMoments[promptId]
  reply: string;
}

export interface Connection {
  personId: string;
  status: ConnStatus;
  helloAt: number;
  connectedAt?: number;
  lastSeenAt?: number;
  fromMe: HelloFromMe;
  fromThem?: HelloFromThem;
  messages: ChatMsg[];
}

const KEY = "kindred:connections.v2";
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
  return Object.values(read()).sort((a, b) => (b.connectedAt ?? b.helloAt) - (a.connectedAt ?? a.helloAt));
}

export function get(personId: string): Connection | null {
  return read()[personId] ?? null;
}

export function sayHello(personId: string, fromMe: HelloFromMe): Connection {
  const state = read();
  if (state[personId]) return state[personId];
  const conn: Connection = {
    personId,
    status: "waiting",
    helloAt: Date.now(),
    fromMe,
    messages: [],
  };
  state[personId] = conn;
  write(state);
  scheduleReply(personId);
  return conn;
}

// ---- Simulated other side -----------------------------------------------

const REPLY_TEMPLATES_EN = [
  "That landed. I think about this too — more than I'd admit.",
  "Yes — that's exactly the part I'd have picked.",
  "I read this twice. The second time was better.",
  "This is the answer I'd want to talk about over a long dinner.",
  "I have a version of this. Less elegant, but the same shape.",
];
const REPLY_TEMPLATES_ZH = [
  "这句我看了两遍。第二遍更好。",
  "我也是这样——多到我不太愿意承认。",
  "这正是我会想聊的那种回答，得有顿长晚饭才说得完。",
  "我有一个我自己的版本。没这么好看，但是一样的形状。",
  "嗯——你挑的那一段，也是我会挑的那一段。",
];

function scheduleReply(personId: string) {
  if (typeof window === "undefined") return;
  const accepts = Math.random() < 0.65;
  if (!accepts) return;
  const delay = 5000 + Math.floor(Math.random() * 10000);
  window.setTimeout(() => {
    const state = read();
    const conn = state[personId];
    if (!conn || conn.status !== "waiting") return;

    // Pick one of the user's own moments for the other side to "quote".
    const u = loadUnderstanding();
    if (u.userMoments.length === 0) {
      // No user moments saved — can't honor the symmetry contract. Hold
      // the connection in waiting forever; do NOT silently auto-connect.
      return;
    }
    const zh = typeof navigator !== "undefined" && navigator.language.startsWith("zh");
    const pick = u.userMoments[Math.floor(Math.random() * u.userMoments.length)];
    const replies = zh ? REPLY_TEMPLATES_ZH : REPLY_TEMPLATES_EN;
    const reply = replies[Math.floor(Math.random() * replies.length)];

    conn.status = "connected";
    conn.connectedAt = Date.now();
    conn.fromThem = { quotedUserMomentPromptId: pick.promptId, reply };
    write(state);
  }, delay);
}

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
    const reply = (typeof navigator !== "undefined" && navigator.language.startsWith("zh"))
      ? "嗯，我也这么觉得。"
      : "Yeah — I feel that too.";
    c.messages.push({ id: uid(), from: "them", t: Date.now(), text: reply });
    write(s);
  }, delay);
}

export function markSeen(personId: string) {
  const state = read();
  const conn = state[personId];
  if (!conn) return;
  conn.lastSeenAt = Date.now();
  write(state);
}

export function hasUnseen(): boolean {
  return list().some((c) => {
    if (c.status === "waiting") return false;
    const lastIncoming = [...c.messages].reverse().find((m) => m.from === "them");
    const last = lastIncoming?.t ?? c.connectedAt ?? c.helloAt;
    return (c.lastSeenAt ?? 0) < last;
  });
}

export function rehydrate() {
  if (typeof window === "undefined") return;
  const state = read();
  for (const conn of Object.values(state)) {
    if (conn.status === "waiting") {
      const elapsed = Date.now() - conn.helloAt;
      if (elapsed > 60_000) continue;
      scheduleReply(conn.personId);
    }
  }
}
