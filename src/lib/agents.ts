export type AgentId = "portrait" | "scout" | "spark" | "coach";
export type AgentStatus = "idle" | "working" | "done";

export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  detail: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: "portrait",
    name: "Portrait",
    role: "Shapes your words into a portrait",
    detail: "Listens to what you describe and composes a short prose portrait of the person you imagine.",
  },
  {
    id: "scout",
    name: "Scout",
    role: "Finds people who resonate",
    detail: "Scans the network for people whose signals echo your portrait.",
  },
  {
    id: "spark",
    name: "Spark",
    role: "Drafts a natural opening",
    detail: "Suggests a first message that feels like you, not a script.",
  },
  {
    id: "coach",
    name: "Coach",
    role: "Light advice for the moments that matter",
    detail: "Quick, grounded thoughts on what to say, when to listen, what to ask.",
  },
];

export type AgentState = Record<AgentId, AgentStatus>;

export const INITIAL_AGENT_STATE: AgentState = {
  portrait: "idle",
  scout: "idle",
  spark: "idle",
  coach: "idle",
};

const KEY = "bloom:agents";
const isBrowser = () => typeof window !== "undefined";

export function loadAgents(): AgentState {
  if (!isBrowser()) return { ...INITIAL_AGENT_STATE };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...INITIAL_AGENT_STATE };
    return { ...INITIAL_AGENT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...INITIAL_AGENT_STATE };
  }
}

export function saveAgents(s: AgentState) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function setAgent(id: AgentId, status: AgentStatus): AgentState {
  const current = loadAgents();
  const next = { ...current, [id]: status };
  saveAgents(next);
  return next;
}
