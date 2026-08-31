// Blocklist — local-only demo for hiding/reporting people.
// In a real deployment this would sync with a server-side moderation list.

const KEY = "kindred:blocklist.v1";
const LISTENERS = new Set<() => void>();

function emit() {
  LISTENERS.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => {
    LISTENERS.delete(fn);
  };
}

export function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* noop */
  }
  emit();
}

export function isBlocked(personId: string): boolean {
  return read().includes(personId);
}

export function blockPerson(personId: string) {
  const ids = read();
  if (ids.includes(personId)) return;
  write([...ids, personId]);
}

export function unblockPerson(personId: string) {
  write(read().filter((id) => id !== personId));
}

export function listBlocked(): string[] {
  return read();
}

const REPORT_KEY = "kindred:reports.v1";

export interface Report {
  personId: string;
  reason: "spam" | "harassment" | "inappropriate" | "other";
  note?: string;
  at: number;
}

export function submitReport(report: Omit<Report, "at">) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(REPORT_KEY);
    const existing = raw ? (JSON.parse(raw) as Report[]) : [];
    const next: Report[] = [...existing, { ...report, at: Date.now() }];
    window.localStorage.setItem(REPORT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}
