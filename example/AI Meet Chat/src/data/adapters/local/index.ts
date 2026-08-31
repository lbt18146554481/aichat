// Local adapter — the current, browser-only implementation of the data ports.
//
// Assembled from one module per domain; each delegates to the existing
// src/lib/* storage modules so behaviour is bit-for-bit the same as before
// this layer existed. Swapping this for `adapters/remote` is the whole point:
// only src/data/index.ts changes.

import { profile } from "./profile";
import { auth } from "./account";
import { connections } from "./connections";
import { sessions } from "./sessions";
import { intents } from "./intents";
import { saved } from "./saved";
import { blocklist } from "./moderation";
import { invites } from "./invites";
import { people } from "./people";
import { agentMemory, understanding } from "./agent";
import type { Repos } from "@/data/ports";

export const localRepos: Repos = {
  profile,
  auth,
  connections,
  sessions,
  intents,
  saved,
  blocklist,
  invites,
  people,
  agentMemory,
  understanding,
};
