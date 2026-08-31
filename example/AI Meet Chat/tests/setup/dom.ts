// Shared test setup for both test runners.
//
// vitest runs in jsdom, which already provides `window` + storage: this file
// is a no-op there. `bun test` uses Bun's own runner with no DOM, so we inject
// the smallest shim the unit tests need (window + localStorage/sessionStorage).

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  } as Storage;
}

const g = globalThis as unknown as {
  window?: unknown;
  localStorage?: Storage;
  sessionStorage?: Storage;
};

if (typeof g.window === "undefined") {
  if (!g.localStorage) g.localStorage = createMemoryStorage();
  if (!g.sessionStorage) g.sessionStorage = createMemoryStorage();
  g.window = globalThis;
}

export {};
