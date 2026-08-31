# src/data — the data layer

UI code (`src/routes/*`, `src/components/*`) talks to data **only** through
`@/data/hooks`. Nothing above this folder knows where the data lives.

```text
ports/              async interfaces (the contract) + domain types re-exported
adapters/local/     current implementation, split per domain (profile.ts,
                    account.ts, connections.ts, sessions.ts, intents.ts,
                    saved.ts, moderation.ts, invites.ts, people.ts, agent.ts)
adapters/local/fake/  the fake backend: seed people pool, simulated replies.
                      Delete this whole directory when a real backend lands.
adapters/remote/    next version: createServerFn / backend calls. Today every
                    method throws "not implemented" — the stub list is the
                    backend API checklist.
hooks/              React hooks the UI consumes (TanStack Query inside)
index.ts            the single assembly point: which adapter is live
```

## Adding a real backend later

1. Implement the stubs in `src/data/adapters/remote/index.ts`.
2. Change one line in `src/data/index.ts`.

No page, component, style, or copy changes are required — every port method is
already async, so components already handle "data arrives later".

## Rules

- No `localStorage` access outside `adapters/local`. (`sessionStorage` for
  ephemeral UI hand-offs — focus flags, return paths, composer drafts — is
  allowed in UI; it is not domain data.)
- Ports stay async, always.
- Domain logic (`src/lib/agents/*`, `match-reasons.ts`) stays pure: it takes
  data as arguments and never reads storage. The agent orchestrators in
  `src/lib/agents/*` are the exception that proves the boundary — they are the
  "brain" a real backend would replace wholesale, and their per-session state
  flows through the sessions store which sits behind `SessionsRepo`.
- No `@capacitor/*` imports here — the native isolation contract still holds.

## Guard

`bun run verify:layering` fails the build if any file under `src/routes` or
`src/components` imports an adapter, touches `localStorage`, or imports a
storage accessor (`loadProfile`, `getPersonById`, …) from `src/lib` directly.
The full list lives in `scripts/verify-layering.mjs`.
