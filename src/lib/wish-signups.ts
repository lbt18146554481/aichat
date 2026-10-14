/** Local sign-ups for wish-pool activities. */

export interface SignupRecord {
  intentId: string;
  signedAt: number;
}

const KEY = "kindred:wish-signups";

let cache: SignupRecord[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function read(): SignupRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SignupRecord[]) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.intentId === "string") : [];
  } catch {
    return [];
  }
}

function write(rows: SignupRecord[]) {
  cache = rows;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  }
  emit();
}

export function hydrateSignups(): SignupRecord[] {
  cache = read();
  loaded = true;
  emit();
  return listSignups();
}

export function listSignups(): SignupRecord[] {
  if (!loaded && typeof window !== "undefined") {
    cache = read();
    loaded = true;
  }
  return cache.slice().sort((a, b) => b.signedAt - a.signedAt);
}

export function isSignedUp(intentId: string): boolean {
  return listSignups().some((row) => row.intentId === intentId);
}

export function toggleSignup(intentId: string): boolean {
  const current = listSignups();
  if (current.some((row) => row.intentId === intentId)) {
    write(current.filter((row) => row.intentId !== intentId));
    return false;
  }
  write([{ intentId, signedAt: Date.now() }, ...current]);
  return true;
}

export function subscribeSignups(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
