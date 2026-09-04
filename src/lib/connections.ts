// Connections — server-backed. Prefer WebSocket realtime; fall back to polling.

import { isBlocked } from "./blocklist";

import {
  listConnectionsFn,
  sayHelloFn,
  sendMessageFn,
  pollConnectionsFn,
  updateConnectionStatusFn,
  markConnectionSeenFn,
} from "./api/data.functions";
import type { Connection, ChatMsg, HelloFromMe, HelloFromThem, ConnStatus } from "./connection-types";
import {
  connectRealtime,
  disconnectRealtime,
  isRealtimeConnected,
  subscribeRealtime,
} from "./realtime";

export type { Connection, ChatMsg, HelloFromMe, HelloFromThem, ConnStatus };

const LISTENERS = new Set<() => void>();
const TYPING = new Set<string>();
let cache: Record<string, Connection> = {};
let lastPoll = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let realtimeUnsub: (() => void) | null = null;

function emit() {
  LISTENERS.forEach((fn) => fn());
}

export function isTyping(personId: string): boolean {
  return TYPING.has(personId);
}

export function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => {
    LISTENERS.delete(fn);
  };
}

function mergeLastSeen(incoming: Connection, prev?: Connection): Connection {
  const seen = Math.max(incoming.lastSeenAt ?? 0, prev?.lastSeenAt ?? 0);
  return seen > 0 ? { ...incoming, lastSeenAt: seen } : incoming;
}

function writeCache(list: Connection[]) {
  const next: Record<string, Connection> = { ...cache };
  for (const c of list) {
    next[c.personId] = mergeLastSeen(c, next[c.personId]);
  }
  cache = next;
  emit();
}

function applyConnection(conn: Connection) {
  cache[conn.personId] = mergeLastSeen(conn, cache[conn.personId]);
  lastPoll = Date.now();
  emit();
}

export function list(): Connection[] {
  return Object.values(cache)
    .filter((c) => !isBlocked(c.personId))
    .sort(
      (a, b) => (b.connectedAt ?? b.helloAt) - (a.connectedAt ?? a.helloAt),
    );
}

export function get(personId: string): Connection | null {
  return cache[personId] ?? null;
}

export async function hydrateConnections(): Promise<Connection[]> {
  try {
    const rows = await listConnectionsFn();
    const prev = cache;
    cache = {};
    for (const c of rows) cache[c.personId] = mergeLastSeen(c, prev[c.personId]);
    lastPoll = Date.now();
    emit();
    startRealtime();
    startPolling(); // fallback / catch-up while WS reconnects
    return rows;
  } catch {
    return [];
  }
}

function startRealtime() {
  if (typeof window === "undefined") return;
  if (!realtimeUnsub) {
    realtimeUnsub = subscribeRealtime((ev) => {
      if (ev.type === "connection" && ev.connection) {
        applyConnection(ev.connection);
        if (ev.connection.personId) {
          TYPING.delete(ev.connection.personId);
          emit();
        }
      }
      if (ev.type === "typing" && ev.typing) {
        if (ev.typing.on) TYPING.add(ev.typing.personId);
        else TYPING.delete(ev.typing.personId);
        emit();
      }
    });
  }
  connectRealtime();
}

export function startPolling() {
  if (typeof window === "undefined") return;
  if (pollTimer) return;
  // Safety-net poll: slow when WS is up, faster when down.
  const tick = () => {
    void pollOnce();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = setInterval(tick, isRealtimeConnected() ? 15000 : 2500);
    }
  };
  pollTimer = setInterval(tick, isRealtimeConnected() ? 15000 : 2500);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollOnce() {
  try {
    const { connections, serverTime } = await pollConnectionsFn({ data: { since: lastPoll - 1000 } });
    lastPoll = serverTime;
    if (connections.length) writeCache(connections);
  } catch {
    /* ignore */
  }
}

function detectLang(): "zh" | "en" {
  return typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en";
}

export function sayHello(
  personId: string,
  fromMe: HelloFromMe,
  originSessionId?: string,
): Promise<Connection> {
  const existing = cache[personId];
  if (existing && existing.status !== "faded") return Promise.resolve(existing);

  startRealtime();
  startPolling();

  return sayHelloFn({
    data: { personId, fromMe, originSessionId, lang: detectLang() },
  })
    .then((conn) => {
      cache[personId] = conn;
      emit();
      return conn;
    })
    .catch((e) => {
      console.error(e);
      throw e;
    });
}

export function withdrawSent(personId: string) {
  const conn = cache[personId];
  if (!conn || conn.status !== "sent") return;
  delete cache[personId];
  emit();
  void updateConnectionStatusFn({ data: { personId, action: "withdraw" } }).catch(console.error);
}

export function maybeSeedIncoming() {
  // Seed personas are AI companions — user initiates hello; no fake incoming hellos.
}

export function respondToIncoming(personId: string, fromMe: HelloFromMe) {
  const conn = cache[personId];
  if (!conn || conn.status !== "incoming") return;
  cache[personId] = {
    ...conn,
    status: "connected",
    connectedAt: Date.now(),
    fromMe,
  };
  emit();
  void updateConnectionStatusFn({ data: { personId, action: "respond", fromMe } }).catch(
    console.error,
  );
}

export function dismissIncoming(personId: string) {
  const conn = cache[personId];
  if (!conn || conn.status !== "incoming") return;
  cache[personId] = { ...conn, status: "faded", fadedAt: Date.now() };
  emit();
  void updateConnectionStatusFn({ data: { personId, action: "dismiss" } }).catch(console.error);
}

export function undoFadedFor(personId: string) {
  const conn = cache[personId];
  if (!conn || conn.status !== "faded") return;
  delete cache[personId];
  emit();
  void updateConnectionStatusFn({ data: { personId, action: "undo_faded" } }).catch(console.error);
}

export function removeFaded(personId: string) {
  undoFadedFor(personId);
}

export function deleteConnection(personId: string) {
  const conn = cache[personId];
  if (!conn) return;
  delete cache[personId];
  emit();
  void updateConnectionStatusFn({ data: { personId, action: "delete" } }).catch(console.error);
}

export function send(personId: string, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return Promise.resolve();
  const conn = cache[personId];
  if (!conn || conn.status !== "connected") return Promise.resolve();

  const msg: ChatMsg = {
    id: Math.random().toString(36).slice(2, 10),
    from: "me",
    t: Date.now(),
    text: t,
  };
  cache[personId] = { ...conn, messages: [...conn.messages, msg] };
  emit();
  startRealtime();
  startPolling();

  return sendMessageFn({ data: { personId, text: t, lang: detectLang() } })
    .then((result) => {
      const cur = cache[personId];
      if (!cur) return;
      const withoutOptimistic = cur.messages.filter((m) => m.id !== msg.id);
      const known = new Set(withoutOptimistic.map((m) => m.id));
      const merged = [...withoutOptimistic];
      for (const m of [result.userMessage, result.theirMessage]) {
        if (known.has(m.id)) continue;
        merged.push({
          id: m.id,
          from: m.from,
          t: m.t,
          text: m.text,
        });
      }
      cache[personId] = { ...cur, messages: merged };
      emit();
    })
    .catch((e) => {
      console.error(e);
      throw e;
    });
}

export function markSeen(personId: string) {
  const conn = cache[personId];
  if (!conn || !hasUnseenFor(conn)) return;
  const now = Date.now();
  cache[personId] = { ...conn, lastSeenAt: now };
  emit();
  void markConnectionSeenFn({ data: { personId } }).catch(() => {
    /* offline */
  });
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

export function hasFadedWith(personId: string): boolean {
  return cache[personId]?.status === "faded";
}

export function rehydrate() {
  if (typeof window === "undefined") return;
  void hydrateConnections();
}

export function teardownRealtime() {
  stopPolling();
  disconnectRealtime();
  if (realtimeUnsub) {
    realtimeUnsub();
    realtimeUnsub = null;
  }
}
