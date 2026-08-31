// Contract tests for the data ports.
//
// Purpose: pin down the behaviour every adapter must honour, so the local
// (browser storage) adapter and a future remote adapter are interchangeable
// without touching a single line of UI code.
//
// Part 1 runs the behavioural contract against the local adapter.
// Part 2 checks the remote skeleton is shape-compatible: same repos, same
// method names, same arity — and that every unimplemented method fails loudly
// instead of silently returning undefined.

import { beforeEach, describe, expect, it } from "vitest";

import { localRepos } from "@/data/adapters/local";
import { remoteRepos } from "@/data/adapters/remote";
import { repos as assembledRepos } from "@/data";
import { seedPeople } from "@/data/adapters/local/fake/people";
import { EMPTY_PROFILE } from "@/lib/profile";
import type { Repos } from "@/data/ports";

const SEED_INVITE = "KINDRED2026";

function resetStorage() {
  window.localStorage.clear();
  window.sessionStorage?.clear();
}

// ---------------------------------------------------------------------------
// Part 1 — behavioural contract (run against any adapter that implements it)
// ---------------------------------------------------------------------------

function runContract(label: string, repos: Repos) {
  describe(`${label}: profile port`, () => {
    beforeEach(resetStorage);

    it("round-trips a saved profile", async () => {
      const p = {
        ...EMPTY_PROFILE,
        name: "Ada",
        age: 30,
        city: "Lisbon",
        occupation: "Translator",
      };
      await repos.profile.save(p);
      const loaded = await repos.profile.load();
      expect(loaded.name).toBe("Ada");
      expect(loaded.city).toBe("Lisbon");
    });

    it("notifies subscribers when the profile changes, and stops after unsubscribe", async () => {
      let hits = 0;
      const off = repos.profile.subscribe(() => {
        hits += 1;
      });
      await repos.profile.save({ ...EMPTY_PROFILE, name: "First" });
      expect(hits).toBe(1);
      off();
      await repos.profile.save({ ...EMPTY_PROFILE, name: "Second" });
      expect(hits).toBe(1);
    });
  });

  describe(`${label}: invites port`, () => {
    beforeEach(resetStorage);

    it("accepts a valid code and rejects an unknown one", async () => {
      expect(await repos.invites.validate(SEED_INVITE)).toBe(true);
      expect(await repos.invites.validate("NOPE-NOPE")).toBe(false);
      expect(await repos.invites.validate("")).toBe(false);
    });

    it("caps generation by quota and lists newest first", async () => {
      const start = await repos.invites.remaining("u1");
      expect(start).toBeGreaterThan(0);

      const made = [];
      for (let i = 0; i < start; i++) {
        const code = await repos.invites.generate("u1");
        expect(code).not.toBeNull();
        made.push(code!);
      }
      expect(await repos.invites.remaining("u1")).toBe(0);
      expect(await repos.invites.generate("u1")).toBeNull();

      const mine = await repos.invites.listMine("u1");
      expect(mine).toHaveLength(made.length);
      expect(mine.every((c) => c.createdBy === "u1")).toBe(true);
      const times = mine.map((c) => c.createdAt);
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });
  });

  describe(`${label}: auth port`, () => {
    beforeEach(resetStorage);

    it("starts signed out", async () => {
      expect(await repos.auth.current()).toBeNull();
    });

    it("signs up with an invite, exposes the user, then signs out", async () => {
      const seen: (string | null)[] = [];
      const off = repos.auth.subscribe((u) => seen.push(u ? u.id : null));

      const user = await repos.auth.signUp({ provider: "google", inviteCode: SEED_INVITE });
      expect(user.id).toBeTruthy();
      expect(user.provider).toBe("google");
      expect((await repos.auth.current())?.id).toBe(user.id);

      // Single-use invite: the same code cannot create a second account.
      expect(await repos.invites.validate(SEED_INVITE)).toBe(false);

      await repos.auth.signOut();
      expect(await repos.auth.current()).toBeNull();
      expect(seen).toEqual([user.id, null]);
      off();
    });

    it("rejects sign-up with an invalid invite", async () => {
      await expect(
        repos.auth.signUp({ provider: "google", inviteCode: "BAD-CODE" }),
      ).rejects.toThrow();
      expect(await repos.auth.current()).toBeNull();
    });

    it("wipes everything on deleteAllData", async () => {
      await repos.auth.signUp({ provider: "apple", inviteCode: "WELCOME" });
      await repos.profile.save({ ...EMPTY_PROFILE, name: "Ada", city: "Lisbon" });
      await repos.auth.deleteAllData();
      expect(await repos.auth.current()).toBeNull();
      expect((await repos.profile.load()).name).toBe("");
    });
  });

  describe(`${label}: people port`, () => {
    beforeEach(resetStorage);

    it("looks up one person and a batch", async () => {
      const first = seedPeople[0];
      expect((await repos.people.get(first.id))?.id).toBe(first.id);
      expect(await repos.people.get("does-not-exist")).toBeNull();

      const ids = seedPeople.slice(0, 3).map((p) => p.id);
      const many = await repos.people.getMany(ids);
      expect(many.map((p) => p.id).sort()).toEqual([...ids].sort());
      expect(await repos.people.getMany([])).toEqual([]);
    });

    it("returns a well-formed page", async () => {
      const page = await repos.people.pool({ page: 1, pageSize: 2 });
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(2);
      expect(page.items).toHaveLength(2);
      expect(page.total).toBeGreaterThanOrEqual(page.items.length);

      const second = await repos.people.pool({ page: 2, pageSize: 2 });
      expect(second.items.map((p) => p.id)).not.toEqual(page.items.map((p) => p.id));
    });
  });

  describe(`${label}: sessions port`, () => {
    beforeEach(resetStorage);

    it("creates, reads, patches and revokes", async () => {
      const s = await repos.sessions.create("do_something", "tennis on saturday", {
        stage: "chat",
      });
      expect(s.status).toBe("waiting");
      expect((await repos.sessions.get(s.id))?.seed).toBe("tennis on saturday");
      expect((await repos.sessions.list()).some((r) => r.id === s.id)).toBe(true);

      await repos.sessions.update(s.id, { status: "matched", seed: "renamed" });
      const after = await repos.sessions.get(s.id);
      expect(after?.status).toBe("matched");
      expect(after?.seed).toBe("renamed");

      await repos.sessions.revoke(s.id);
      expect((await repos.sessions.get(s.id))?.status).toBe("revoked");
    });

    it("ignores updates to unknown ids and returns null for them", async () => {
      await repos.sessions.update("nope", { status: "matched" });
      expect(await repos.sessions.get("nope")).toBeNull();
    });

    it("surfaces the most recent active do_something session only", async () => {
      expect(await repos.sessions.mostRecentActiveDoSomething()).toBeNull();
      const a = await repos.sessions.create("do_something", "a", {});
      expect((await repos.sessions.mostRecentActiveDoSomething())?.id).toBe(a.id);
      await repos.sessions.revoke(a.id);
      expect(await repos.sessions.mostRecentActiveDoSomething()).toBeNull();
    });
  });

  describe(`${label}: intents port`, () => {
    beforeEach(resetStorage);

    it("publishes, patches and revokes my wish", async () => {
      expect(await repos.intents.listMine()).toEqual([]);

      const it1 = await repos.intents.publish({
        kind: "tennis",
        rawText: "tennis this weekend",
        when: "weekend",
        level: "beginner",
        city: "Lisbon",
      });
      expect(it1.ownerId).toBe("me");
      expect(it1.city).toBe("Lisbon");
      expect((await repos.intents.listMine()).map((i) => i.id)).toEqual([it1.id]);
      expect((await repos.intents.getById(it1.id))?.rawText).toBe("tennis this weekend");

      const patched = await repos.intents.update(it1.id, { level: "advanced", city: "Porto" });
      expect(patched?.level).toBe("advanced");
      expect(patched?.city).toBe("Porto");
      expect(await repos.intents.update("nope", { level: "advanced" })).toBeNull();

      await repos.intents.revoke(it1.id);
      expect(await repos.intents.listMine()).toEqual([]);
      expect(await repos.intents.getById("nope")).toBeNull();
    });

    it("exposes a candidate pool with the fields matching relies on", async () => {
      const pool = await repos.intents.pool();
      expect(pool.length).toBeGreaterThan(0);
      for (const i of pool.slice(0, 5)) {
        expect(i.id).toBeTruthy();
        expect(i.ownerId).toBeTruthy();
        expect(i.kind).toBeTruthy();
        expect(typeof i.city).toBe("string");
      }
    });
  });

  describe(`${label}: saved port`, () => {
    beforeEach(resetStorage);

    it("toggles a wish on and off and notifies subscribers", async () => {
      const wish = await repos.intents.publish({ kind: "run", rawText: "a run", city: "Lisbon" });
      let hits = 0;
      const off = repos.saved.subscribe(() => {
        hits += 1;
      });

      await repos.saved.toggleWish(wish.id, "sess-1");
      const list = await repos.saved.listWishes();
      expect(list.map((r) => r.intentId)).toEqual([wish.id]);
      expect(list[0].sessionId).toBe("sess-1");

      await repos.saved.toggleWish(wish.id, "sess-1");
      expect(await repos.saved.listWishes()).toEqual([]);

      await repos.saved.toggleWish(wish.id, "sess-1");
      await repos.saved.removeWish(wish.id);
      expect(await repos.saved.listWishes()).toEqual([]);
      expect(hits).toBeGreaterThan(0);
      off();
    });

    it("toggles a person on and off", async () => {
      const personId = seedPeople[0].id;
      await repos.saved.togglePerson(personId, "sess-2");
      expect((await repos.saved.listPeople()).map((r) => r.personId)).toEqual([personId]);
      await repos.saved.togglePerson(personId, "sess-2");
      expect(await repos.saved.listPeople()).toEqual([]);

      await repos.saved.togglePerson(personId, "sess-2");
      await repos.saved.removePerson(personId);
      expect(await repos.saved.listPeople()).toEqual([]);
    });

    it("hides saved people the user has blocked", async () => {
      const personId = seedPeople[0].id;
      await repos.saved.togglePerson(personId, "sess-3");
      await repos.blocklist.block(personId);
      expect(await repos.saved.listPeople()).toEqual([]);
      await repos.blocklist.unblock(personId);
      expect((await repos.saved.listPeople()).map((r) => r.personId)).toEqual([personId]);
    });
  });

  describe(`${label}: blocklist port`, () => {
    beforeEach(resetStorage);

    it("blocks, lists, unblocks and notifies", async () => {
      let hits = 0;
      const off = repos.blocklist.subscribe(() => {
        hits += 1;
      });
      const personId = seedPeople[1].id;

      expect(await repos.blocklist.list()).toEqual([]);
      await repos.blocklist.block(personId);
      expect(await repos.blocklist.list()).toContain(personId);
      // Blocking twice must not duplicate the entry.
      await repos.blocklist.block(personId);
      expect((await repos.blocklist.list()).filter((id) => id === personId)).toHaveLength(1);

      await repos.blocklist.unblock(personId);
      expect(await repos.blocklist.list()).toEqual([]);
      expect(hits).toBeGreaterThan(0);
      off();
    });

    it("accepts a report without throwing", async () => {
      await expect(
        repos.blocklist.report({ personId: seedPeople[2].id, reason: "spam", note: "" }),
      ).resolves.toBeUndefined();
    });
  });

  describe(`${label}: connections port`, () => {
    beforeEach(resetStorage);

    it("says hello, exposes the thread, then withdraws it", async () => {
      await repos.connections.bootstrap();
      const personId = seedPeople[0].id;
      let hits = 0;
      const off = repos.connections.subscribe(() => {
        hits += 1;
      });

      const conn = await repos.connections.sayHello(
        personId,
        { quotedMomentId: null, reply: "hi there" },
        "sess-1",
      );
      expect(conn.personId).toBe(personId);
      expect(conn.status).toBe("sent");
      expect(conn.initiatedBy).toBe("me");
      expect((await repos.connections.get(personId))?.status).toBe("sent");
      expect((await repos.connections.list()).some((c) => c.personId === personId)).toBe(true);

      // Idempotent: saying hello again returns the existing thread.
      const again = await repos.connections.sayHello(personId, {
        quotedMomentId: null,
        reply: "hi again",
      });
      expect(again.helloAt).toBe(conn.helloAt);

      expect(typeof (await repos.connections.isTyping(personId))).toBe("boolean");
      await repos.connections.markSeen(personId);

      await repos.connections.withdrawSent(personId);
      expect(await repos.connections.get(personId)).toBeNull();
      expect(hits).toBeGreaterThan(0);
      off();
    });

    it("keeps blocked people out of the thread list", async () => {
      const personId = seedPeople[0].id;
      await repos.connections.sayHello(personId, { quotedMomentId: null, reply: "hi" });
      await repos.blocklist.block(personId);
      expect((await repos.connections.list()).some((c) => c.personId === personId)).toBe(false);
    });
  });

  describe(`${label}: agent memory port`, () => {
    beforeEach(resetStorage);

    it("remembers traits newest-first, de-duped and capped", async () => {
      expect((await repos.agentMemory.load()).preferredTraits).toEqual([]);
      expect(await repos.agentMemory.lastTrait()).toBeNull();

      await repos.agentMemory.rememberTrait("reads a lot");
      await repos.agentMemory.rememberTrait("quiet");
      await repos.agentMemory.rememberTrait("reads a lot");
      expect((await repos.agentMemory.load()).preferredTraits).toEqual(["reads a lot", "quiet"]);
      expect(await repos.agentMemory.lastTrait()).toBe("reads a lot");

      await repos.agentMemory.rememberTrait("   ");
      expect((await repos.agentMemory.load()).preferredTraits).toHaveLength(2);

      for (let i = 0; i < 8; i++) await repos.agentMemory.rememberTrait(`t${i}`);
      expect((await repos.agentMemory.load()).preferredTraits).toHaveLength(6);
    });
  });

  describe(`${label}: understanding port`, () => {
    beforeEach(resetStorage);

    it("saves, reloads and resets", async () => {
      expect(await repos.understanding.load()).toEqual({
        positive: [],
        negative: [],
        notes: [],
      });

      await repos.understanding.save({ positive: ["quiet"], negative: ["loud"], notes: ["n"] });
      expect((await repos.understanding.load()).positive).toEqual(["quiet"]);

      const cleared = await repos.understanding.reset();
      expect(cleared.positive).toEqual([]);
      expect((await repos.understanding.load()).positive).toEqual([]);
    });
  });
}

runContract("local adapter", localRepos);

// ---------------------------------------------------------------------------
// Part 3 — edge cases, fuzz and state-leak guards (high-risk contract points)
//
// These pin down the boundaries the happy-path contract doesn't reach:
// quota exhaustion, dedup under repetition, ordering stability under equal
// timestamps, unknown-id tolerance, and — critically — that no state leaks
// across storage resets or survives an account wipe.
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) so fuzz runs are reproducible in CI. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All keys currently held in localStorage. */
function storageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

describe("edge: invites quota and ordering", () => {
  beforeEach(resetStorage);

  it("grants exactly the quota, then refuses further codes without mutating anything", async () => {
    const quota = await localRepos.invites.remaining("u-edge");
    const first = await localRepos.invites.generate("u-edge");
    expect(first).not.toBeNull();
    expect(await localRepos.invites.remaining("u-edge")).toBe(quota - 1);

    // Burn the rest of the quota.
    for (let i = 1; i < quota; i++) {
      expect(await localRepos.invites.generate("u-edge")).not.toBeNull();
    }
    expect(await localRepos.invites.remaining("u-edge")).toBe(0);

    // Over quota: null, and the list must not change on repeated attempts.
    const before = await localRepos.invites.listMine("u-edge");
    expect(await localRepos.invites.generate("u-edge")).toBeNull();
    expect(await localRepos.invites.generate("u-edge")).toBeNull();
    expect(await localRepos.invites.listMine("u-edge")).toEqual(before);
  });

  it("keeps quotas isolated between users", async () => {
    const quota = await localRepos.invites.remaining("alice");
    for (let i = 0; i < quota; i++) await localRepos.invites.generate("alice");
    expect(await localRepos.invites.remaining("alice")).toBe(0);
    expect(await localRepos.invites.remaining("bob")).toBe(quota);
    expect(await localRepos.invites.listMine("bob")).toEqual([]);
  });

  it("never generates duplicate codes under fuzz", async () => {
    // Three users exhaust their quota back-to-back; every code must be unique
    // across the whole pool (seed codes included).
    const rand = prng(42);
    const all = new Set<string>();
    for (const uid of ["f1", "f2", "f3"]) {
      const quota = await localRepos.invites.remaining(uid);
      for (let i = 0; i < quota; i++) {
        const code = await localRepos.invites.generate(uid);
        expect(code).not.toBeNull();
        expect(all.has(code!.code)).toBe(false);
        all.add(code!.code);
      }
      void rand();
    }
    expect(all.size).toBeGreaterThan(0);
  });

  it("normalises validation input: case, whitespace and empty strings", async () => {
    expect(await localRepos.invites.validate("  kindred2026  ")).toBe(true);
    expect(await localRepos.invites.validate("")).toBe(false);
    expect(await localRepos.invites.validate("   ")).toBe(false);
  });

  it("ordering stays newest-first even when createdAt ties", async () => {
    // Generate codes in a tight loop; Date.now() may collide. listMine must
    // still return a deterministic newest-first order.
    for (let i = 0; i < 3; i++) await localRepos.invites.generate("tie-user");
    const mine = await localRepos.invites.listMine("tie-user");
    expect(mine).toHaveLength(3);
    const times = mine.map((c) => c.createdAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // And a second read returns the identical order (no re-shuffle).
    expect((await localRepos.invites.listMine("tie-user")).map((c) => c.code)).toEqual(
      mine.map((c) => c.code),
    );
  });
});

describe("edge: blocklist dedup and tolerance", () => {
  beforeEach(resetStorage);

  it("repeatedly blocking never duplicates, and never accumulates entries", async () => {
    const id = seedPeople[3].id;
    for (let i = 0; i < 10; i++) await localRepos.blocklist.block(id);
    const list = await localRepos.blocklist.list();
    expect(list).toEqual([id]);
    expect(new Set(list).size).toBe(list.length);
  });

  it("unblocking an id that was never blocked is a no-op", async () => {
    await localRepos.blocklist.unblock("ghost-id");
    expect(await localRepos.blocklist.list()).toEqual([]);
    const id = seedPeople[4].id;
    await localRepos.blocklist.block(id);
    await localRepos.blocklist.unblock("ghost-id");
    expect(await localRepos.blocklist.list()).toEqual([id]);
  });

  it("tolerates fuzz ids (unicode, empty-ish) without corrupting the list", async () => {
    const rand = prng(7);
    const weird = ["", "  ", "❤️‍🔥", "id".repeat(500), "\u0000", "maïté"];
    for (const id of weird) {
      await localRepos.blocklist.block(id);
      void rand();
    }
    const list = await localRepos.blocklist.list();
    expect(list).toHaveLength(weird.length);
    expect(new Set(list).size).toBe(list.length);
    // JSON round-trip integrity: every weird id reads back byte-identical.
    for (const id of weird) expect(list).toContain(id);
  });
});

describe("edge: agent memory cap and dedup under fuzz", () => {
  beforeEach(resetStorage);

  it("never exceeds the cap of 6, even with adversarial input", async () => {
    const rand = prng(1234);
    const vocab = ["quiet", "reads", "funny", "outdoors", "ambitious", "kind"];
    for (let i = 0; i < 50; i++) {
      const base = vocab[Math.floor(rand() * vocab.length)];
      const pad = rand() > 0.5 ? " ".repeat(Math.floor(rand() * 4)) : "";
      await localRepos.agentMemory.rememberTrait(pad + base + pad);
      const traits = (await localRepos.agentMemory.load()).preferredTraits;
      expect(traits.length).toBeLessThanOrEqual(6);
      // No duplicates after normalisation (store trims input).
      expect(new Set(traits).size).toBe(traits.length);
    }
  });

  it("drops blank and whitespace-only traits", async () => {
    for (const blank of ["", " ", "   ", "\t\n"]) {
      await localRepos.agentMemory.rememberTrait(blank);
    }
    expect((await localRepos.agentMemory.load()).preferredTraits).toEqual([]);
    expect(await localRepos.agentMemory.lastTrait()).toBeNull();
  });

  it("re-remembering an existing trait moves it to the front without duplicating", async () => {
    await localRepos.agentMemory.rememberTrait("a");
    await localRepos.agentMemory.rememberTrait("b");
    await localRepos.agentMemory.rememberTrait("c");
    await localRepos.agentMemory.rememberTrait("a");
    expect((await localRepos.agentMemory.load()).preferredTraits).toEqual(["a", "c", "b"]);
  });

  it("round-trips unicode and very long traits", async () => {
    const long = "热爱夜跑 ".repeat(60).trim();
    await localRepos.agentMemory.rememberTrait("🌙 夜跑者");
    await localRepos.agentMemory.rememberTrait(long);
    const traits = (await localRepos.agentMemory.load()).preferredTraits;
    expect(traits).toEqual([long, "🌙 夜跑者"]);
  });
});

describe("edge: sessions unknown ids and fuzz churn", () => {
  beforeEach(resetStorage);

  it("update/revoke on unknown ids never creates phantom sessions", async () => {
    for (const ghost of ["nope", "", "0", "undefined"]) {
      await localRepos.sessions.update(ghost, { status: "matched" });
      await localRepos.sessions.revoke(ghost);
    }
    expect(await localRepos.sessions.list()).toEqual([]);
  });

  it("update preserves fields that were not patched", async () => {
    const s = await localRepos.sessions.create("introduce", "original seed", { stage: 1 });
    await localRepos.sessions.update(s.id, { status: "matched" });
    const after = await localRepos.sessions.get(s.id);
    expect(after?.seed).toBe("original seed");
    expect(after?.state).toEqual({ stage: 1 });
    expect(after?.createdAt).toBe(s.createdAt);
  });

  it("fuzz: random create/update/revoke churn keeps the list internally consistent", async () => {
    const rand = prng(99);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const s = await localRepos.sessions.create(
        rand() > 0.5 ? "do_something" : "introduce",
        `seed-${i}`,
        { i },
      );
      ids.push(s.id);
    }
    for (let i = 0; i < 40; i++) {
      const target = rand() > 0.2 ? ids[Math.floor(rand() * ids.length)] : "ghost";
      if (rand() > 0.5) {
        await localRepos.sessions.update(target, { status: "matched" });
      } else {
        await localRepos.sessions.revoke(target);
      }
      // Invariant after every op: no duplicate ids, every row is one we made.
      const list = await localRepos.sessions.list();
      expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
      for (const row of list) expect(ids).toContain(row.id);
    }
    // Revoked sessions remain queryable but excluded from the active banner.
    const list = await localRepos.sessions.list();
    expect(list).toHaveLength(ids.length);
    const active = await localRepos.sessions.mostRecentActiveDoSomething();
    if (active) expect(active.status).not.toBe("revoked");
  });
});

describe("edge: no state leaks", () => {
  beforeEach(resetStorage);

  it("a storage reset fully isolates repos: nothing cached at module level", async () => {
    // Dirty every store, reset, then confirm reads return pure defaults.
    await localRepos.agentMemory.rememberTrait("quiet");
    await localRepos.blocklist.block(seedPeople[0].id);
    await localRepos.sessions.create("introduce", "x", {});
    await localRepos.understanding.save({ positive: ["p"], negative: [], notes: [] });

    resetStorage();

    expect((await localRepos.agentMemory.load()).preferredTraits).toEqual([]);
    expect(await localRepos.agentMemory.lastTrait()).toBeNull();
    expect(await localRepos.blocklist.list()).toEqual([]);
    expect(await localRepos.sessions.list()).toEqual([]);
    expect(await localRepos.understanding.load()).toEqual({
      positive: [],
      negative: [],
      notes: [],
    });
    expect(await localRepos.saved.listWishes()).toEqual([]);
    expect(await localRepos.saved.listPeople()).toEqual([]);
    expect((await localRepos.profile.load()).name).toBe("");
    expect(await localRepos.auth.current()).toBeNull();
  });

  it("every key the app writes is namespaced (no stray globals)", async () => {
    await localRepos.agentMemory.rememberTrait("quiet");
    await localRepos.blocklist.block(seedPeople[0].id);
    await localRepos.sessions.create("introduce", "x", {});
    await localRepos.profile.save({ ...EMPTY_PROFILE, name: "Ada" });
    await localRepos.understanding.save({ positive: [], negative: [], notes: ["n"] });
    for (const key of storageKeys()) {
      expect(key.startsWith("kindred:")).toBe(true);
    }
  });

  it("deleteAllData leaves zero app keys behind", async () => {
    await localRepos.auth.signUp({ provider: "google", inviteCode: SEED_INVITE });
    await localRepos.profile.save({ ...EMPTY_PROFILE, name: "Ada" });
    await localRepos.agentMemory.rememberTrait("quiet");
    await localRepos.blocklist.block(seedPeople[0].id);
    await localRepos.sessions.create("do_something", "tennis", {});

    await localRepos.auth.deleteAllData();

    expect(storageKeys().filter((k) => k.startsWith("kindred:"))).toEqual([]);
    // And a fresh read re-seeds cleanly rather than resurrecting old rows.
    expect((await localRepos.agentMemory.load()).preferredTraits).toEqual([]);
    expect(await localRepos.blocklist.list()).toEqual([]);
  });

  it("profile round-trips hostile text without corruption", async () => {
    const hostile = `</script><img src=x>{"json":true}\u0000 emoji 🎾 中文`;
    await localRepos.profile.save({ ...EMPTY_PROFILE, name: hostile, city: "上海" });
    const loaded = await localRepos.profile.load();
    expect(loaded.name).toBe(hostile);
    expect(loaded.city).toBe("上海");
  });
});

describe("assembled data layer", () => {
  it("ships the local adapter today", () => {
    expect(assembledRepos).toBe(localRepos);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — remote adapter parity (shape now, behaviour when it lands)
// ---------------------------------------------------------------------------

type RepoKey = keyof Repos;
type AnyFn = (...args: unknown[]) => unknown;

const repoKeys = Object.keys(localRepos).sort() as RepoKey[];

/** Methods a remote adapter is allowed to implement as a no-op because they
 *  only exist for the local adapter's warm-up needs. */
const NO_OP_ON_REMOTE = new Set(["connections.bootstrap"]);

describe("remote adapter parity", () => {
  it("implements exactly the same repos as the local adapter", () => {
    expect(Object.keys(remoteRepos).sort()).toEqual(repoKeys);
  });

  for (const key of repoKeys) {
    it(`${key}: same method names, no extra required arguments`, () => {
      const localRepo = localRepos[key] as unknown as Record<string, AnyFn>;
      const remoteRepo = remoteRepos[key] as unknown as Record<string, AnyFn>;
      const localMethods = Object.keys(localRepo).sort();
      expect(Object.keys(remoteRepo).sort()).toEqual(localMethods);
      for (const m of localMethods) {
        expect(typeof remoteRepo[m]).toBe("function");
        // A stub may ignore arguments, but must never demand more than the
        // port declares — call sites are shared between both adapters.
        expect(remoteRepo[m].length).toBeLessThanOrEqual(localRepo[m].length);
      }
    });
  }

  for (const key of repoKeys) {
    it(`${key}: unimplemented methods fail loudly instead of returning undefined`, async () => {
      const remoteRepo = remoteRepos[key] as unknown as Record<string, AnyFn>;
      for (const m of Object.keys(remoteRepo)) {
        if (NO_OP_ON_REMOTE.has(`${key}.${m}`)) continue;
        let threw = false;
        try {
          await remoteRepo[m]("x", "y", "z");
        } catch (e) {
          threw = true;
          expect(String((e as Error).message)).toMatch(/not implemented/i);
        }
        expect(threw, `${key}.${m} should throw until implemented`).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Part 4 — security boundary tests: hostile input on the user-controlled
// text paths (profile, saved people, intents).
//
// Threat model: every string the user (or a peer) types is rendered into the
// UI and persisted via JSON. The stores must (a) round-trip hostile payloads
// byte-for-byte — never escaping, truncating or "helpfully" rewriting — so
// rendering stays the single sanitisation layer (React escapes text nodes);
// (b) never let one field corrupt its neighbours; (c) survive a poisoned /
// hand-edited storage blob without throwing.
// ---------------------------------------------------------------------------

/** Payloads that try to break out of JSON, HTML and the render path. */
const HOSTILE_STRINGS = [
  `</script><script>alert(1)</script>`,
  `<img src=x onerror=alert(1)>`,
  `javascript:alert(1)`,
  `{"$ref":"#/evil","__proto__":{"polluted":true}}`,
  `"}]},[{"x":"`,
  ` \t\u000b\u200d `,
  `\u200d zero-width \u200b joiner`,
  `🎾 emoji and 中文 混合`,
  `line1
line2	line3`,
  `a".repeat(very) long `.repeat(50),
];

describe("security boundary: profile port", () => {
  beforeEach(resetStorage);

  it("round-trips hostile strings byte-for-byte in every free-text field", async () => {
    for (const hostile of HOSTILE_STRINGS) {
      resetStorage();
      const p = {
        ...EMPTY_PROFILE,
        name: hostile,
        city: hostile,
        occupation: hostile,
        mbti: hostile,
        moments: [{ promptId: "q1", answer: hostile }],
        favorites: [{ kind: "book" as const, title: hostile, why: hostile }],
      };
      await localRepos.profile.save(p);
      const loaded = await localRepos.profile.load();
      expect(loaded.name).toBe(hostile);
      expect(loaded.city).toBe(hostile);
      expect(loaded.occupation).toBe(hostile);
      expect(loaded.moments[0].answer).toBe(hostile);
      expect(loaded.favorites[0].title).toBe(hostile);
      expect(loaded.favorites[0].why).toBe(hostile);
    }
  });

  it("serialisation is stable: raw storage text parses back to the same object", async () => {
    const p = {
      ...EMPTY_PROFILE,
      name: `</script>{"a":1}`,
      city: "上海",
      hidden: ["age", "moment:q1"],
    };
    await localRepos.profile.save(p);
    const raw = window.localStorage.getItem("kindred:profile.v1");
    expect(raw).toBeTruthy();
    const reparsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(reparsed.name).toBe(p.name);
    expect(reparsed.hidden).toEqual(p.hidden);
    // A second load after the manual parse still matches — no one-shot state.
    expect((await localRepos.profile.load()).name).toBe(p.name);
  });

  it("prototype-pollution payload does not pollute Object.prototype", async () => {
    const before = (Object.prototype as Record<string, unknown>)["polluted"];
    await localRepos.profile.save({
      ...EMPTY_PROFILE,
      name: `{"__proto__":{"polluted":true}}`,
    });
    await localRepos.profile.load();
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBe(before);
  });

  it("survives a poisoned storage blob: returns the empty profile instead of throwing", async () => {
    window.localStorage.setItem("kindred:profile.v1", "{not-json");
    await expect(localRepos.profile.load()).resolves.toEqual(EMPTY_PROFILE);
    window.localStorage.setItem("kindred:profile.v1", "null");
    await expect(localRepos.profile.load()).resolves.toEqual(EMPTY_PROFILE);
  });

  it("hostile hidden-field keys round-trip and stay isolated per key", async () => {
    const keys = [`</script>`, `moment:{"x":1}`, ` 空格 `];
    const p = { ...EMPTY_PROFILE, name: "Ada", hidden: keys };
    await localRepos.profile.save(p);
    expect((await localRepos.profile.load()).hidden).toEqual(keys);
  });

  it("retired hostile legacy fields are dropped, not resurfaced", async () => {
    window.localStorage.setItem(
      "kindred:profile.v1",
      JSON.stringify({
        ...EMPTY_PROFILE,
        name: "Ada",
        bio: `<script>alert(1)</script>`,
        interests: [`<img src=x>`],
      }),
    );
    const loaded = await localRepos.profile.load();
    expect(loaded.name).toBe("Ada");
    expect("bio" in loaded).toBe(false);
    expect("interests" in loaded).toBe(false);
  });
});

describe("security boundary: saved people port", () => {
  beforeEach(resetStorage);

  it("hostile ids never enter the list (people lookup is the gate)", async () => {
    for (const hostile of HOSTILE_STRINGS) {
      await localRepos.saved.togglePerson(hostile, hostile);
    }
    // None of the hostile ids exist in the people directory, so every one
    // is filtered at read time — the list must stay empty and not throw.
    expect(await localRepos.saved.listPeople()).toEqual([]);
  });

  it("round-trips a hostile sessionId verbatim alongside a real person", async () => {
    const personId = seedPeople[0].id;
    const hostile = `</script>{"inject":true} 中文`;
    await localRepos.saved.togglePerson(personId, hostile);
    const list = await localRepos.saved.listPeople();
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe(hostile);
    expect(list[0].personId).toBe(personId);
  });

  it("survives a poisoned storage blob without throwing", async () => {
    window.localStorage.setItem("kindred:saved-people:v1", "{{{");
    expect(await localRepos.saved.listPeople()).toEqual([]);
    window.localStorage.setItem("kindred:saved-people:v1", JSON.stringify({ not: "an array" }));
    expect(await localRepos.saved.listPeople()).toEqual([]);
  });

  it("a poisoned blob does not wedge subsequent writes", async () => {
    window.localStorage.setItem("kindred:saved-people:v1", "not json at all");
    const personId = seedPeople[0].id;
    await localRepos.saved.togglePerson(personId, "s1");
    expect((await localRepos.saved.listPeople()).map((r) => r.personId)).toEqual([personId]);
  });
});

describe("security boundary: intents port", () => {
  beforeEach(resetStorage);

  it("round-trips hostile rawText and city byte-for-byte", async () => {
    for (const hostile of HOSTILE_STRINGS) {
      resetStorage();
      const it = await localRepos.intents.publish({
        kind: "other",
        rawText: hostile,
        city: hostile,
      });
      const loaded = await localRepos.intents.getById(it.id);
      expect(loaded?.rawText).toBe(hostile);
      expect(loaded?.rawText_zh).toBe(hostile);
      expect(loaded?.city).toBe(hostile.trim());
      expect((await localRepos.intents.listMine()).map((i) => i.id)).toEqual([it.id]);
    }
  });

  it("hostile input in one wish never corrupts its neighbours", async () => {
    const good = await localRepos.intents.publish({
      kind: "tennis",
      rawText: "tennis saturday morning",
      city: "Lisbon",
    });
    const evil = await localRepos.intents.publish({
      kind: "other",
      rawText: `</script>"}]},[{"id":"${good.id}`,
      city: `{"evil":1}`,
    });
    const list = await localRepos.intents.listMine();
    expect(list).toHaveLength(2);
    expect(list.find((i) => i.id === good.id)?.rawText).toBe("tennis saturday morning");
    expect(list.find((i) => i.id === good.id)?.city).toBe("Lisbon");
    expect(list.find((i) => i.id === evil.id)?.rawText).toBe(`</script>"}]},[{"id":"${good.id}`);
  });

  it("city is trimmed on publish and update; whitespace-only clears on update", async () => {
    const it = await localRepos.intents.publish({
      kind: "run",
      rawText: "run",
      city: "  Lisbon  ",
    });
    expect(it.city).toBe("Lisbon");
    const cleared = await localRepos.intents.update(it.id, { city: "   " });
    expect(cleared?.city).toBe("");
  });

  it("survives a poisoned storage blob: list is empty, publish still works", async () => {
    window.localStorage.setItem("kindred:sidebyside.my-intents.v1", "[broken");
    expect(await localRepos.intents.listMine()).toEqual([]);
    const it = await localRepos.intents.publish({ kind: "run", rawText: "run", city: "Lisbon" });
    expect((await localRepos.intents.listMine()).map((i) => i.id)).toEqual([it.id]);
  });

  it("prototype-pollution payload in rawText does not pollute Object.prototype", async () => {
    const before = (Object.prototype as Record<string, unknown>)["polluted"];
    await localRepos.intents.publish({
      kind: "other",
      rawText: `{"__proto__":{"polluted":true}}`,
      city: "Lisbon",
    });
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBe(before);
  });
});
