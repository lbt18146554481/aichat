// Seed message handoff from the homepage to an Agent workspace.
//
// The homepage is a single conversation input. When the user submits, we
// stash the text under the target agent's key and navigate to that agent.
// On mount, the agent page consumes the seed (one-shot) and treats it as
// the user's first message — so from the user's view, the conversation
// that began on the homepage continues seamlessly inside the agent.

export type AgentId = "matchmaker" | "sidebyside";

const KEY_PREFIX = "kindred:seed:v1:";

export function setSeed(agent: AgentId, text: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY_PREFIX + agent, text);
  } catch {
    /* noop */
  }
}

export function consumeSeed(agent: AgentId): string | null {
  if (typeof window === "undefined") return null;
  try {
    const k = KEY_PREFIX + agent;
    const v = window.sessionStorage.getItem(k);
    if (v) window.sessionStorage.removeItem(k);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

// A separate one-shot hop for "open this specific person in Matchmaker".
// Used by Connections' "waiting" rows to jump back to the person card.
const FOCUS_KEY = "kindred:focus-person:v1";
export function setFocusPerson(personId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FOCUS_KEY, personId);
  } catch {
    /* noop */
  }
}
export function consumeFocusPerson(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(FOCUS_KEY);
    if (v) window.sessionStorage.removeItem(FOCUS_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}
