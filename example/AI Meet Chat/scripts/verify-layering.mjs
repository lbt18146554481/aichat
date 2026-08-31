// verify-layering.mjs — guard the data-layer boundary.
//
// The contract (see src/data/README.md):
//   UI (src/routes, src/components) reads and writes domain data ONLY through
//   @/data/hooks. It must never import an adapter, never touch localStorage,
//   and never import storage accessors from src/lib/* directly.
//
// What is allowed in UI:
//   - pure domain helpers and types from src/lib (avatarUrl, localized,
//     isVitalsComplete, type imports, agent orchestrators in src/lib/agents/*)
//   - sessionStorage for ephemeral navigation hand-offs (focus flags, return
//     paths, composer drafts) — these are UI state, not domain data
//
// Run: node scripts/verify-layering.mjs   (also: bun run verify:layering)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const UI_DIRS = ["src/routes", "src/components"];

/** Storage accessors that UI must reach through @/data/hooks instead. */
const BANNED_SYMBOLS = {
  "@/lib/people": ["getPersonById", "PEOPLE"],
  "@/lib/profile": ["loadProfile", "saveProfile", "resetProfile"],
  "@/lib/auth": ["loadUser", "signIn", "signUp", "signOut", "subscribe"],
  "@/lib/account": ["clearAllUserData"],
  "@/lib/connections": [
    "list",
    "get",
    "sayHello",
    "withdrawSent",
    "respondToIncoming",
    "dismissIncoming",
    "removeFaded",
    "undoFadedFor",
    "isTyping",
    "send",
    "markSeen",
    "subscribe",
    "rehydrate",
  ],
  "@/lib/sessions": [
    "listSessions",
    "getSession",
    "createSession",
    "updateSession",
    "revokeSession",
    "mostRecentActiveDoSomething",
  ],
  "@/lib/intents": [
    "loadMyIntents",
    "getIntentById",
    "publishMyIntent",
    "updateMyIntent",
    "revokeMyIntent",
    "seedPool",
  ],
  "@/lib/saved-intents": ["listSaved", "toggleSaved", "removeSaved", "subscribeSaved"],
  "@/lib/saved-people": [
    "listSavedPeople",
    "toggleSavedPerson",
    "removeSavedPerson",
    "subscribeSavedPeople",
  ],
  "@/lib/blocklist": ["listBlocked", "blockPerson", "unblockPerson", "submitReport", "subscribe"],
  "@/lib/invites": ["validateInvite", "listMyCodes", "remainingInvites", "generateInvite"],
  "@/lib/agent-memory": ["loadMemory", "saveMemory", "rememberTrait", "lastTrait"],
  "@/lib/understanding": ["loadUnderstanding", "saveUnderstanding", "resetUnderstanding"],
  "@/lib/agent": ["loadState", "saveState", "resetState"],
};

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

const problems = [];

for (const dir of UI_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");

    // 1. UI must not import adapters directly.
    if (/from\s+["'][^"']*data\/adapters/.test(src)) {
      problems.push(`${rel}: imports a data adapter directly — use @/data/hooks`);
    }

    // 2. UI must not touch localStorage (domain persistence). sessionStorage
    //    is allowed for ephemeral UI hand-offs only.
    if (/\blocalStorage\s*[.[]/.test(src)) {
      problems.push(`${rel}: accesses localStorage — domain persistence belongs in @/data`);
    }

    // 3. UI must not import storage accessors from src/lib storage modules.
    const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](@\/lib\/[\w-]+)["']/g;
    for (const match of src.matchAll(importRe)) {
      const names = match[1]
        .split(",")
        .map(
          (n) =>
            n
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+as\s+/)[0],
        )
        .filter(Boolean);
      const banned = BANNED_SYMBOLS[match[2]] ?? [];
      for (const name of names) {
        if (banned.includes(name)) {
          problems.push(
            `${rel}: imports storage accessor \`${name}\` from ${match[2]} — use @/data/hooks`,
          );
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Layering violations found:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\n${problems.length} violation(s). UI code must read/write domain data via @/data/hooks only.`,
  );
  process.exit(1);
}

console.log("Layering OK — UI reads domain data exclusively through @/data/hooks.");
