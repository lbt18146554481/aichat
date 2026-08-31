// Data ports — the contract between UI and whatever stores the data.
//
// Every method is async on purpose: today the local adapter resolves
// immediately, tomorrow a real backend resolves over the network, and the
// UI code above this line does not change either way.
//
// Domain types keep living in src/lib/* — they are the shared language of
// both layers, not an implementation detail.

import type { Profile } from "@/lib/profile";
import type { Session, SessionAgent, SessionStatus } from "@/lib/sessions";
import type { Intent, WhenTier, LevelTier } from "@/lib/intents";
import type { Connection, HelloFromMe } from "@/lib/connections";
import type { SavedRecord } from "@/lib/saved-intents";
import type { SavedPersonRecord } from "@/lib/saved-people";
import type { InviteCode } from "@/lib/invites";
import type { AuthProvider, AuthUser } from "@/lib/auth";
import type { Report } from "@/lib/blocklist";
import type { ActivityKind } from "@/lib/types";
import type { Person } from "@/lib/types";
import type { AgentMemory } from "@/lib/agent-memory";
import type { UserUnderstanding } from "@/lib/understanding";

/** Every repo can announce "my data changed" so hooks can re-read. */
export type Unsubscribe = () => void;

/** Paged list contract — every list port speaks it from day one so adding
 *  server-side pagination later never touches a call site. */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProfileRepo {
  load(): Promise<Profile>;
  save(p: Profile): Promise<void>;
  subscribe(fn: () => void): Unsubscribe;
}

export interface AuthRepo {
  current(): Promise<AuthUser | null>;
  signIn(input: { provider: AuthProvider }): Promise<AuthUser>;
  signUp(input: { provider: AuthProvider; inviteCode: string }): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Account deletion — wipes everything this user owns, then signs out. */
  deleteAllData(): Promise<void>;
  subscribe(fn: (u: AuthUser | null) => void): Unsubscribe;
}

export interface ConnectionsRepo {
  /** Adapter-side warm-up (local adapter resumes pending timers; a remote
   *  adapter is a no-op). Safe to call on every mount. */
  bootstrap(): Promise<void>;
  list(): Promise<Connection[]>;
  get(personId: string): Promise<Connection | null>;

  sayHello(personId: string, fromMe: HelloFromMe, originSessionId?: string): Promise<Connection>;
  withdrawSent(personId: string): Promise<void>;
  respondToIncoming(personId: string, fromMe: HelloFromMe): Promise<void>;
  dismissIncoming(personId: string): Promise<void>;
  removeFaded(personId: string): Promise<void>;
  /** Bring a faded thread back so the user can say hello again. */
  undoFaded(personId: string): Promise<void>;
  /** Is the other side currently composing? */
  isTyping(personId: string): Promise<boolean>;
  send(personId: string, text: string): Promise<void>;
  markSeen(personId: string): Promise<void>;
  subscribe(fn: () => void): Unsubscribe;
}

export interface SessionsRepo {
  list(): Promise<Session[]>;
  get(id: string): Promise<Session | null>;
  create(agent: SessionAgent, seed: string, initialState: unknown): Promise<Session>;
  update(
    id: string,
    patch: { state?: unknown; status?: SessionStatus; seed?: string },
  ): Promise<void>;
  revoke(id: string): Promise<void>;
  mostRecentActiveDoSomething(): Promise<Session | null>;
}

export interface PublishIntentInput {
  kind: ActivityKind;
  rawText: string;
  when?: WhenTier;
  level?: LevelTier;
  city?: string;
  city_zh?: string;
}

export interface UpdateIntentPatch {
  when?: WhenTier;
  level?: LevelTier;
  location?: string;
  city?: string;
  city_zh?: string;
}

export interface IntentsRepo {
  listMine(): Promise<Intent[]>;
  getById(id: string): Promise<Intent | null>;
  publish(input: PublishIntentInput): Promise<Intent>;
  update(id: string, patch: UpdateIntentPatch): Promise<Intent | null>;
  revoke(id: string): Promise<void>;
  /** Everyone the matcher may consider — a server query in the remote adapter. */
  pool(): Promise<Intent[]>;
}

export interface SavedRepo {
  listWishes(): Promise<SavedRecord[]>;
  toggleWish(intentId: string, sessionId: string): Promise<void>;
  removeWish(intentId: string): Promise<void>;
  listPeople(): Promise<SavedPersonRecord[]>;
  togglePerson(personId: string, sessionId: string): Promise<void>;
  removePerson(personId: string): Promise<void>;
  subscribe(fn: () => void): Unsubscribe;
}

export interface BlocklistRepo {
  list(): Promise<string[]>;
  block(personId: string): Promise<void>;
  unblock(personId: string): Promise<void>;
  report(report: Omit<Report, "at">): Promise<void>;
  subscribe(fn: () => void): Unsubscribe;
}

export interface InvitesRepo {
  validate(code: string): Promise<boolean>;
  listMine(userId: string): Promise<InviteCode[]>;
  remaining(userId: string): Promise<number>;
  generate(userId: string): Promise<InviteCode | null>;
}

/** The people directory. Today a seeded pool, tomorrow a server query. */
export interface PeopleRepo {
  get(id: string): Promise<Person | null>;
  getMany(ids: string[]): Promise<Person[]>;
  pool(query?: PageQuery): Promise<Page<Person>>;
}

/** Long-lived traits the user told the Agent, across wishes. */
export interface AgentMemoryRepo {
  load(): Promise<AgentMemory>;
  rememberTrait(trait: string): Promise<void>;
  lastTrait(): Promise<string | null>;
}

/** What the system inferred about who the user is looking for. */
export interface UnderstandingRepo {
  load(): Promise<UserUnderstanding>;
  save(u: UserUnderstanding): Promise<void>;
  reset(): Promise<UserUnderstanding>;
}

/** The full set of data ports the app depends on. */
export interface Repos {
  profile: ProfileRepo;
  auth: AuthRepo;
  connections: ConnectionsRepo;
  sessions: SessionsRepo;
  intents: IntentsRepo;
  saved: SavedRepo;
  blocklist: BlocklistRepo;
  invites: InvitesRepo;
  people: PeopleRepo;
  agentMemory: AgentMemoryRepo;
  understanding: UnderstandingRepo;
}
