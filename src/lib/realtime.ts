import type { Connection } from "./connection-types";

export type RealtimeEvent =
  | { type: "hello"; userId: string; t: number }
  | { type: "pong"; t: number }
  | { type: "connection"; connection: Connection; t: number }
  | { type: "typing"; typing: { personId: string; on: boolean }; t: number };

type Handler = (ev: RealtimeEvent) => void;

let socket: WebSocket | null = null;
let handlers = new Set<Handler>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let intentionalClose = false;
let connected = false;

function wsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  if (typeof window === "undefined") return "ws://127.0.0.1:3001";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port = import.meta.env.VITE_WS_PORT || "3001";
  return `${proto}//${host}:${port}`;
}

export function isRealtimeConnected(): boolean {
  return connected;
}

export function subscribeRealtime(fn: Handler): () => void {
  handlers.add(fn);
  return () => {
    handlers.delete(fn);
  };
}

function emit(ev: RealtimeEvent) {
  handlers.forEach((fn) => {
    try {
      fn(ev);
    } catch (e) {
      console.warn("[realtime] handler error", e);
    }
  });
}

function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

export function connectRealtime() {
  if (typeof window === "undefined") return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  intentionalClose = false;
  clearTimers();

  try {
    const url = wsUrl();
    socket = new WebSocket(url);
  } catch (e) {
    console.warn("[realtime] failed to open", e);
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    connected = true;
    pingTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
  };

  socket.onmessage = (evt) => {
    try {
      const data = JSON.parse(String(evt.data)) as RealtimeEvent;
      emit(data);
    } catch {
      /* ignore */
    }
  };

  socket.onclose = () => {
    connected = false;
    clearTimers();
    socket = null;
    if (!intentionalClose) scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose will follow
  };
}

function scheduleReconnect() {
  if (intentionalClose) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, 3000);
}

export function disconnectRealtime() {
  intentionalClose = true;
  clearTimers();
  connected = false;
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
}
