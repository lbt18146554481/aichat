/**
 * Keeps an in-flight Side turn alive across route changes.
 * Stream deltas and the final turn result persist via save() even when
 * the side-by-side page unmounts; remounted pages subscribe for live updates.
 */

import type { SideState } from "./agents/side-by-side";
import { save } from "./agents/side-by-side";

export type SideTurnSessionMeta = {
  thinking: boolean;
  streaming: boolean;
};

type Listener = (state: SideState, meta: SideTurnSessionMeta) => void;

type LiveTurn = {
  working: SideState;
  meta: SideTurnSessionMeta;
};

const live = new Map<string, LiveTurn>();
const listeners = new Map<string, Set<Listener>>();

function notify(sessionId: string, state: SideState, meta: SideTurnSessionMeta): void {
  save(state, sessionId);
  live.set(sessionId, { working: state, meta });
  for (const fn of listeners.get(sessionId) ?? []) fn(state, meta);
}

export function getSideTurnSession(sessionId: string): LiveTurn | undefined {
  return live.get(sessionId);
}

export function isSideTurnActive(sessionId: string): boolean {
  const cur = live.get(sessionId);
  if (!cur) return false;
  return cur.meta.thinking || cur.meta.streaming;
}

export function subscribeSideTurnSession(sessionId: string, listener: Listener): () => void {
  if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
  const set = listeners.get(sessionId)!;
  set.add(listener);
  const cur = live.get(sessionId);
  if (cur) listener(cur.working, cur.meta);
  return () => {
    set.delete(listener);
  };
}

export function beginSideTurnSession(sessionId: string, initial: SideState): void {
  notify(sessionId, initial, { thinking: true, streaming: false });
}

export function publishSideTurnSession(
  sessionId: string,
  state: SideState,
  metaPatch?: Partial<SideTurnSessionMeta>,
): void {
  const prev = live.get(sessionId);
  const meta: SideTurnSessionMeta = {
    thinking: metaPatch?.thinking ?? prev?.meta.thinking ?? false,
    streaming: metaPatch?.streaming ?? prev?.meta.streaming ?? false,
  };
  notify(sessionId, state, meta);
}

export function endSideTurnSession(sessionId: string): void {
  live.delete(sessionId);
}
