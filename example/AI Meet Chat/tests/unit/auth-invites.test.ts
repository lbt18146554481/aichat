// Invite + auth gating rules.
//
// These are the rules that decide whether a person can get into Maitri at
// all, so they get tests: single-use codes, invite-gated signup, and the
// "no account on this device yet" branch that routes a visitor to signup.

import { beforeEach, describe, expect, it } from "vitest";
import { consumeInvite, validateInvite } from "@/lib/invites";
import { AuthError, loadUser, signIn, signOut, signUp } from "@/lib/auth";

beforeEach(() => {
  window.localStorage.clear();
});

describe("invite codes", () => {
  it("accepts a seeded code and is case/space insensitive", () => {
    expect(validateInvite(" welcome ")).toBe(true);
  });

  it("rejects unknown codes", () => {
    expect(validateInvite("NOPE-NOPE")).toBe(false);
  });

  it("is single use", () => {
    expect(consumeInvite("WELCOME")).toBe(true);
    expect(validateInvite("WELCOME")).toBe(false);
    expect(consumeInvite("WELCOME")).toBe(false);
  });
});

describe("sign up", () => {
  it("requires an invite code", async () => {
    await expect(signUp({ provider: "google", inviteCode: "" })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an invalid invite and does not create a user", async () => {
    await expect(signUp({ provider: "google", inviteCode: "BAD" })).rejects.toMatchObject({
      code: "invite_invalid",
    });
    expect(loadUser()).toBeNull();
  });

  it("creates a user with a valid invite and burns the code", async () => {
    const user = await signUp({ provider: "google", inviteCode: "FRIENDS" });
    expect(user.provider).toBe("google");
    expect(loadUser()?.id).toBe(user.id);
    expect(validateInvite("FRIENDS")).toBe(false);
  });

  it("refuses WeChat before the code is consumed", async () => {
    await expect(signUp({ provider: "wechat", inviteCode: "WELCOME" })).rejects.toMatchObject({
      code: "wechat_unavailable",
    });
    // The code must survive a provider that never completed.
    expect(validateInvite("WELCOME")).toBe(true);
  });
});

describe("sign in", () => {
  it("routes a fresh device to signup instead of provisioning silently", async () => {
    await expect(signIn({ provider: "apple" })).rejects.toMatchObject({
      code: "account_not_found",
    });
  });

  it("returns the existing account, and sign out clears it", async () => {
    const created = await signUp({ provider: "apple", inviteCode: "KINDRED2026" });
    const back = await signIn({ provider: "apple" });
    expect(back.id).toBe(created.id);
    signOut();
    expect(loadUser()).toBeNull();
  });
});
