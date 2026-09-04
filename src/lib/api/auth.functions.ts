import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client.server";
import { users, inviteCodes, profiles } from "../db/schema";
import { createSession, destroySession, getSessionUser, newId } from "../db/session.server";
import { AuthError, type AuthUser } from "../auth-types";
import { EMPTY_PROFILE } from "../profile-shape";

function toAuthError(e: unknown): never {
  if (e instanceof AuthError) throw e;
  throw new AuthError("server_error", e instanceof Error ? e.message : String(e));
}

export const meFn = createServerFn({ method: "GET" }).handler(async (): Promise<AuthUser | null> => {
  return getSessionUser();
});

export const signUpFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(128),
      inviteCode: z.string().min(1),
      name: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AuthUser> => {
    try {
      const email = data.email.trim().toLowerCase();
      const code = data.inviteCode.trim().toUpperCase();
      const db = getDb();

      const invite = await db
        .select()
        .from(inviteCodes)
        .where(and(eq(inviteCodes.code, code), isNull(inviteCodes.usedBy)))
        .limit(1);
      if (!invite[0]) throw new AuthError("invite_invalid", "That invite code isn't valid or has been used.");

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing[0]) throw new AuthError("email_taken", "An account with this email already exists.");

      const id = newId("u");
      const passwordHash = await bcrypt.hash(data.password, 10);
      const name = (data.name?.trim() || email.split("@")[0]) ?? "member";

      await db.insert(users).values({ id, email, passwordHash, name, avatar: "" });
      await db
        .update(inviteCodes)
        .set({ usedBy: id, usedAt: new Date() })
        .where(eq(inviteCodes.code, code));
      await db.insert(profiles).values({ userId: id, data: EMPTY_PROFILE as unknown as Record<string, unknown> });

      await createSession(id);
      return {
        id,
        email,
        name,
        avatar: "",
        provider: "email",
        createdAt: Date.now(),
      };
    } catch (e) {
      toAuthError(e);
    }
  });

export const signInFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<AuthUser> => {
    try {
      const email = data.email.trim().toLowerCase();
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const row = rows[0];
      if (!row) throw new AuthError("account_not_found", "No account yet. Join with an invite code to create one.");
      const ok = await bcrypt.compare(data.password, row.passwordHash);
      if (!ok) throw new AuthError("invalid_credentials", "Email or password is incorrect.");
      await createSession(row.id);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar,
        provider: "email",
        createdAt: row.createdAt.getTime(),
      };
    } catch (e) {
      toAuthError(e);
    }
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true as const };
});

export const deleteAccountFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) throw new AuthError("unauthorized", "Sign in required.");
  const db = getDb();
  await db.delete(users).where(eq(users.id, user.id));
  await destroySession();
  return { ok: true as const };
});

export const validateInviteFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string() }))
  .handler(async ({ data }): Promise<{ valid: boolean }> => {
    try {
      const code = data.code.trim().toUpperCase();
      if (!code) return { valid: false };
      const db = getDb();
      const rows = await db
        .select({ code: inviteCodes.code })
        .from(inviteCodes)
        .where(and(eq(inviteCodes.code, code), isNull(inviteCodes.usedBy)))
        .limit(1);
      return { valid: rows.length > 0 };
    } catch (e) {
      toAuthError(e);
    }
  });

export const listMyInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.createdBy, user.id))
    .orderBy(desc(inviteCodes.createdAt));
  return rows.map((r) => ({
    code: r.code,
    createdBy: r.createdBy,
    usedBy: r.usedBy,
    createdAt: r.createdAt.getTime(),
    usedAt: r.usedAt ? r.usedAt.getTime() : null,
  }));
});

export const remainingInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return 0;
  const db = getDb();
  const rows = await db.select({ code: inviteCodes.code }).from(inviteCodes).where(eq(inviteCodes.createdBy, user.id));
  return Math.max(0, 3 - rows.length);
});

export const generateInviteFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) throw new AuthError("unauthorized", "Sign in required.");
  const db = getDb();
  const existing = await db.select({ code: inviteCodes.code }).from(inviteCodes).where(eq(inviteCodes.createdBy, user.id));
  if (existing.length >= 3) return null;

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];

  await db.insert(inviteCodes).values({
    code,
    createdBy: user.id,
    usedBy: null,
    usedAt: null,
  });
  return {
    code,
    createdBy: user.id,
    usedBy: null as string | null,
    createdAt: Date.now(),
    usedAt: null as number | null,
  };
});
