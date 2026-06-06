// User-defined agent tags shown below the chat input.
// The product ships with ZERO presets — the user adds their own.

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: number;
}

const KEY = "bloom:custom-agents";
const isBrowser = () => typeof window !== "undefined";

export function loadAgents(): CustomAgent[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomAgent[];
  } catch {
    return [];
  }
}

export function saveAgents(agents: CustomAgent[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(agents));
}

export function addAgent(name: string, description: string): CustomAgent {
  const a: CustomAgent = {
    id: Math.random().toString(36).slice(2, 10),
    name: name.trim(),
    description: description.trim(),
    enabled: true,
    createdAt: Date.now(),
  };
  saveAgents([...loadAgents(), a]);
  return a;
}

export function toggleAgent(id: string) {
  saveAgents(loadAgents().map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
}

export function removeAgent(id: string) {
  saveAgents(loadAgents().filter((a) => a.id !== id));
}
