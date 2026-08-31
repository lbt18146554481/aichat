// Single assembly point for the data layer.
//
// Today: the local (browser storage) adapter.
// Next version with a real backend: import { remoteRepos } and flip the
// constant below. Nothing above this file needs to change.

import { localRepos } from "./adapters/local";
import type { Repos } from "./ports";

export const repos: Repos = localRepos;

export type { Repos } from "./ports";
export * from "./ports";
