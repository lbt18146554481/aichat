import { getServerConfig } from "./config.server";
import type { Connection } from "./connection-types";

/**
 * Best-effort push to the local WebSocket hub.
 * Never throws to the caller — realtime is additive over polling.
 */
export async function pushConnectionUpdate(userId: string, connection: Connection): Promise<void> {
  const port = process.env.WS_PORT || "3001";
  const url = process.env.WS_PUSH_URL || `http://127.0.0.1:${port}/push`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, type: "connection", connection }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (e) {
    if (getServerConfig().nodeEnv !== "production") {
      // Quiet in prod if hub is down; log lightly in dev
      console.warn("[realtime] push failed (is `bun run ws` running?)", e instanceof Error ? e.message : e);
    }
  }
}

export async function pushTyping(
  userId: string,
  personId: string,
  on: boolean,
): Promise<void> {
  const port = process.env.WS_PORT || "3001";
  const url = process.env.WS_PUSH_URL || `http://127.0.0.1:${port}/push`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, type: "typing", typing: { personId, on } }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* ignore */
  }
}
