import type { SideState } from "@/lib/agents/side-by-side";
import type { Session } from "@/lib/sessions";

/** Most recently updated side-by-side session that owns this published wish. */
export function findSessionForMyIntent(sessions: Session[], intentId: string): Session | null {
  const match = sessions
    .filter((s) => s.agent === "do_something" && !s.supersededAt)
    .filter((s) => (s.state as Partial<SideState>)?.myIntentId === intentId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return match[0] ?? null;
}
