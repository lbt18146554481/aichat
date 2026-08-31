// Remote adapter skeleton — implements the data ports so TypeScript compiles
// while the real backend is still being built. Every method throws a clear
// "not implemented" error; this is the checklist of endpoints needed to switch
// off the local adapter.
//
// To activate: import { remoteRepos } in src/data/index.ts and replace
// localRepos with remoteRepos.

import type { AuthProvider, AuthUser } from "@/lib/auth";
import type { Connection, HelloFromMe } from "@/lib/connections";
import type { Intent } from "@/lib/intents";
import type { InviteCode } from "@/lib/invites";
import type { Profile } from "@/lib/profile";
import type { Report } from "@/lib/blocklist";
import type { SavedPersonRecord } from "@/lib/saved-people";
import type { SavedRecord } from "@/lib/saved-intents";
import type { Session, SessionAgent, SessionStatus } from "@/lib/sessions";
import type { AgentState } from "@/lib/agent";
import type { AgentMemory } from "@/lib/agent-memory";
import type { UserUnderstanding } from "@/lib/understanding";
import type {
  AgentMemoryRepo,
  AuthRepo,
  BlocklistRepo,
  ConnectionsRepo,
  IntentsRepo,
  InvitesRepo,
  PageQuery,
  PeopleRepo,
  ProfileRepo,
  Repos,
  SavedRepo,
  SessionsRepo,
  UnderstandingRepo,
  Unsubscribe,
  PublishIntentInput,
  UpdateIntentPatch,
} from "@/data/ports";

function notImplemented(name: string): never {
  throw new Error(`Remote adapter not implemented: ${name}`);
}

const profile: ProfileRepo = {
  async load() {
    return notImplemented("profile.load");
  },
  async save(p: Profile) {
    return notImplemented("profile.save");
  },
  subscribe() {
    return notImplemented("profile.subscribe");
  },
};

const auth: AuthRepo = {
  async current() {
    return notImplemented("auth.current");
  },
  async signIn(input: { provider: AuthProvider }) {
    return notImplemented("auth.signIn");
  },
  async signUp(input: { provider: AuthProvider; inviteCode: string }) {
    return notImplemented("auth.signUp");
  },
  async signOut() {
    return notImplemented("auth.signOut");
  },
  async deleteAllData() {
    return notImplemented("auth.deleteAllData");
  },
  subscribe() {
    return notImplemented("auth.subscribe");
  },
};

const connections: ConnectionsRepo = {
  async bootstrap() {
    // no-op on remote
  },
  async list() {
    return notImplemented("connections.list");
  },
  async get(personId: string) {
    return notImplemented("connections.get");
  },
  async sayHello(personId: string, fromMe: HelloFromMe, originSessionId?: string) {
    return notImplemented("connections.sayHello");
  },
  async withdrawSent(personId: string) {
    return notImplemented("connections.withdrawSent");
  },
  async respondToIncoming(personId: string, fromMe: HelloFromMe) {
    return notImplemented("connections.respondToIncoming");
  },
  async dismissIncoming(personId: string) {
    return notImplemented("connections.dismissIncoming");
  },
  async removeFaded(personId: string) {
    return notImplemented("connections.removeFaded");
  },
  async send(personId: string, text: string) {
    return notImplemented("connections.send");
  },
  async undoFaded(personId: string) {
    return notImplemented("connections.undoFaded");
  },
  async isTyping(personId: string) {
    return notImplemented("connections.isTyping");
  },
  async markSeen(personId: string) {
    return notImplemented("connections.markSeen");
  },
  subscribe() {
    return notImplemented("connections.subscribe");
  },
};

const sessions: SessionsRepo = {
  async list() {
    return notImplemented("sessions.list");
  },
  async get(id: string) {
    return notImplemented("sessions.get");
  },
  async create(agent: SessionAgent, seed: string, initialState: unknown) {
    return notImplemented("sessions.create");
  },
  async update(id: string, patch: { state?: unknown; status?: SessionStatus; seed?: string }) {
    return notImplemented("sessions.update");
  },
  async revoke(id: string) {
    return notImplemented("sessions.revoke");
  },
  async mostRecentActiveDoSomething() {
    return notImplemented("sessions.mostRecentActiveDoSomething");
  },
};

const intents: IntentsRepo = {
  async listMine() {
    return notImplemented("intents.listMine");
  },
  async getById(id: string) {
    return notImplemented("intents.getById");
  },
  async publish(input: PublishIntentInput) {
    return notImplemented("intents.publish");
  },
  async update(id: string, patch: UpdateIntentPatch) {
    return notImplemented("intents.update");
  },
  async revoke(id: string) {
    return notImplemented("intents.revoke");
  },
  async pool() {
    return notImplemented("intents.pool");
  },
};

const saved: SavedRepo = {
  async listWishes() {
    return notImplemented("saved.listWishes");
  },
  async toggleWish(intentId: string, sessionId: string) {
    return notImplemented("saved.toggleWish");
  },
  async removeWish(intentId: string) {
    return notImplemented("saved.removeWish");
  },
  async listPeople() {
    return notImplemented("saved.listPeople");
  },
  async togglePerson(personId: string, sessionId: string) {
    return notImplemented("saved.togglePerson");
  },
  async removePerson(personId: string) {
    return notImplemented("saved.removePerson");
  },
  subscribe() {
    return notImplemented("saved.subscribe");
  },
};

const blocklist: BlocklistRepo = {
  async list() {
    return notImplemented("blocklist.list");
  },
  async block(personId: string) {
    return notImplemented("blocklist.block");
  },
  async unblock(personId: string) {
    return notImplemented("blocklist.unblock");
  },
  async report(report: Omit<Report, "at">) {
    return notImplemented("blocklist.report");
  },
  subscribe() {
    return notImplemented("blocklist.subscribe");
  },
};

const invites: InvitesRepo = {
  async validate(code: string) {
    return notImplemented("invites.validate");
  },
  async listMine(userId: string) {
    return notImplemented("invites.listMine");
  },
  async remaining(userId: string) {
    return notImplemented("invites.remaining");
  },
  async generate(userId: string) {
    return notImplemented("invites.generate");
  },
};

const people: PeopleRepo = {
  async get(id: string) {
    return notImplemented("people.get");
  },
  async getMany(ids: string[]) {
    return notImplemented("people.getMany");
  },
  async pool(query?: PageQuery) {
    return notImplemented("people.pool");
  },
};

const agentMemory: AgentMemoryRepo = {
  async load() {
    return notImplemented("agentMemory.load");
  },
  async rememberTrait(trait: string) {
    return notImplemented("agentMemory.rememberTrait");
  },
  async lastTrait() {
    return notImplemented("agentMemory.lastTrait");
  },
};

const understanding: UnderstandingRepo = {
  async load() {
    return notImplemented("understanding.load");
  },
  async save(u: UserUnderstanding) {
    return notImplemented("understanding.save");
  },
  async reset() {
    return notImplemented("understanding.reset");
  },
};

export const remoteRepos: Repos = {
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
