// Connections — the minimum closed loop after Matchmaker shows someone.
//
// States: "waiting" (you said hello, they haven't yet)
//         "connected" (both said hello — chat is open)
// "introduced" is the implicit default: a person you've seen but haven't
// acted on isn't stored here at all.
//
// All persistence is local. The "other side" is simulated: after you say
// hello, ~65% of the time the person says hello back within 5–15s; the
// rest never respond (silent — never shown as a rejection).

import { getPersonById } from "./people";

export type ConnStatus = "waiting" | "connected";

export interface ChatMsg {
  id: string;
  from: "me" | "them";
  t: number;
  text: string;
}

export interface Connection {
  personId: string;
  status: ConnStatus;
  helloAt: number;
  connectedAt?: number;
  lastSeenAt?: number; // last time the user opened the thread
  messages: ChatMsg[];
}

const KEY = "kindred:connections.v1";
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
  return () => LISTENERS.delete(fn);
}

export function list(): Connection[] {
  return Object.values(read()).sort((a, b) => (b.connectedAt ?? b.helloAt) - (a.connectedAt ?? a.helloAt));
}

export function get(personId: string): Connection | null {
  return read()[personId] ?? null;
}

export function sayHello(personId: string): Connection {
  const state = read();
  if (state[personId]) return state[personId];
  const conn: Connection = {
    personId,
    status: "waiting",
    helloAt: Date.now(),
    messages: [],
  };
  state[personId] = conn;
  write(state);
  scheduleReply(personId);
  return conn;
}

// Local-only simulation of the other side. 65% accept within 5–15s.
function scheduleReply(personId: string) {
  if (typeof window === "undefined") return;
  const accepts = Math.random() < 0.65;
  if (!accepts) return;
  const delay = 5000 + Math.floor(Math.random() * 10000);
  window.setTimeout(() => {
    const state = read();
    const conn = state[personId];
    if (!conn || conn.status !== "waiting") return;
    conn.status = "connected";
    conn.connectedAt = Date.now();
    // seed a first line from "them" so the thread isn't empty
    const person = getPersonById(personId);
    const firstLine = person
      ? (typeof navigator !== "undefined" && navigator.language.startsWith("zh"))
        ? `嘿，很高兴认识你。`
        : `Hey — nice to meet you.`
      : "Hi.";
    conn.messages.push({ id: uid(), from: "them", t: Date.now(), text: firstLine });
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
  // Light local echo so the thread feels alive — not Agent-mediated, just
  // a placeholder for a real other person.
  const delay = 4000 + Math.floor(Math.random() * 8000);
  window.setTimeout(() => {
    const s = read();
    const c = s[personId];
    if (!c) return;
    const reply = (typeof navigator !== "undefined" && navigator.language.startsWith("zh"))
      ? "嗯，我也这么觉得。"
      : "Yeah, I feel that too.";
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

// Are there any unseen new connections or unread messages?
export function hasUnseen(): boolean {
  return list().some((c) => {
    if (c.status === "waiting") return false;
    const lastIncoming = [...c.messages].reverse().find((m) => m.from === "them");
    const last = lastIncoming?.t ?? c.connectedAt ?? c.helloAt;
    return (c.lastSeenAt ?? 0) < last;
  });
}

// Resume any pending simulated replies after a page reload. Connections
// still in "waiting" get their reply timer reissued so the demo flow
// completes even if the user refreshes.
export function rehydrate() {
  if (typeof window === "undefined") return;
  const state = read();
  for (const conn of Object.values(state)) {
    if (conn.status === "waiting") {
      const elapsed = Date.now() - conn.helloAt;
      if (elapsed > 60_000) continue; // give up after a minute on reload
      scheduleReply(conn.personId);
    }
  }
}
