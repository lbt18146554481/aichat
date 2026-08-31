/**
 * Realtime WebSocket hub for chat / connection updates.
 *
 * - Clients connect: ws://host:WS_PORT?  (session cookie `maitri_session` on handshake)
 * - App server POSTs to http://127.0.0.1:WS_PORT/push with { userId, connection }
 *
 * Run: bun run ws  (or tsx scripts/ws-server.ts)
 */

import "dotenv/config";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import postgres from "postgres";

const WS_PORT = Number(process.env.WS_PORT || 3001);
const SESSION_COOKIE = "maitri_session";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 5 });

/** userId -> open sockets */
const rooms = new Map<string, Set<WebSocket>>();

function parseCookie(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

async function userIdFromToken(token: string): Promise<string | null> {
  const rows = await sql<{ user_id: string }[]>`
    SELECT user_id FROM auth_sessions
    WHERE token = ${token} AND expires_at > NOW()
    LIMIT 1
  `;
  return rows[0]?.user_id ?? null;
}

function addSocket(userId: string, ws: WebSocket) {
  let set = rooms.get(userId);
  if (!set) {
    set = new Set();
    rooms.set(userId, set);
  }
  set.add(ws);
}

function removeSocket(userId: string, ws: WebSocket) {
  const set = rooms.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) rooms.delete(userId);
}

export function pushToUser(userId: string, payload: unknown) {
  const set = rooms.get(userId);
  if (!set || set.size === 0) return 0;
  const data = JSON.stringify(payload);
  let n = 0;
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      n++;
    }
  }
  return n;
}

const server = http.createServer(async (req, res) => {
  // Health
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: [...rooms.values()].reduce((a, s) => a + s.size, 0) }));
    return;
  }

  // Internal push from the app server (localhost only)
  if (req.method === "POST" && req.url === "/push") {
    const host = req.socket.remoteAddress || "";
    const isLocal =
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "::ffff:127.0.0.1";
    if (!isLocal) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        userId: string;
        type?: string;
        connection?: unknown;
        typing?: { personId: string; on: boolean };
      };
      if (!body.userId) {
        res.writeHead(400);
        res.end("userId required");
        return;
      }
      const sent = pushToUser(body.userId, {
        type: body.type ?? "connection",
        connection: body.connection,
        typing: body.typing,
        t: Date.now(),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, sent }));
    } catch (e) {
      res.writeHead(400);
      res.end(String(e));
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  try {
    const cookies = parseCookie(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      ws.close(4001, "unauthorized");
      return;
    }
    const userId = await userIdFromToken(token);
    if (!userId) {
      ws.close(4001, "unauthorized");
      return;
    }
    addSocket(userId, ws);
    ws.send(JSON.stringify({ type: "hello", userId, t: Date.now() }));

    ws.on("close", () => removeSocket(userId, ws));
    ws.on("error", () => removeSocket(userId, ws));
    ws.on("message", (raw) => {
      // Client can send ping
      try {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
        }
      } catch {
        /* ignore */
      }
    });
  } catch (e) {
    console.error("[ws] connection error", e);
    ws.close(1011, "error");
  }
});

server.listen(WS_PORT, "0.0.0.0", () => {
  console.log(`[ws] listening on ws://0.0.0.0:${WS_PORT}`);
});
