import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "../db/client.server";
import { users, inviteCodes, profiles } from "../db/schema";
import { createSession, destroySession, getSessionUser, newId } from "../db/session.server";
import { AuthError, type AuthUser } from "../auth-types";
import { EMPTY_PROFILE } from "../profile-shape";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  buildGoogleAuthorizeUrl,
  createOAuthState,
  exchangeGoogleCode,
  parseOAuthState,
} from "../google-oauth.server";

/**
 * Temporary: invite codes may be reused any number of times.
 * Flip to false to restore single-use consumption (mark usedBy on signup).
 */
export const INVITE_CODES_UNLIMITED_REUSE = true;

/** Server-fn transport often strips custom Error fields — embed code in message JSON. */
function fail(code: string, message: string): never {
  throw new Error(JSON.stringify({ code, message }));
}

function toAuthError(e: unknown): never {
  if (e instanceof AuthError) fail(e.code, e.message);
  // Already serialized by fail()
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message) as { code?: string };
      if (typeof parsed.code === "string") throw e;
    } catch (inner) {
      if (inner === e) throw e;
    }
    const msg = e.message || "";
    if (/ECONNREFUSED|ENOTFOUND|connect ECONN|database|postgres/i.test(msg)) {
      fail("db_unavailable", msg);
    }
  }
  fail("server_error", e instanceof Error ? e.message : String(e));
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

      const invite = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
      if (!invite[0]) throw new AuthError("invite_invalid", "That invite code isn't valid.");
      if (!INVITE_CODES_UNLIMITED_REUSE && invite[0].usedBy) {
        throw new AuthError("invite_invalid", "That invite code has already been used.");
      }

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing[0]) throw new AuthError("email_taken", "An account with this email already exists.");

      const id = newId("u");
      const passwordHash = await bcrypt.hash(data.password, 10);
      const name = (data.name?.trim() || email.split("@")[0]) ?? "member";

      await db.insert(users).values({ id, email, passwordHash, provider: "email", name, avatar: "" });
      if (!INVITE_CODES_UNLIMITED_REUSE) {
        await db
          .update(inviteCodes)
          .set({ usedBy: id, usedAt: new Date() })
          .where(eq(inviteCodes.code, code));
      }
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
      if (!row.passwordHash) {
        throw new AuthError("invalid_credentials", "This account uses Google sign-in. Continue with Google instead.");
      }
      const ok = await bcrypt.compare(data.password, row.passwordHash);
      if (!ok) throw new AuthError("invalid_credentials", "Email or password is incorrect.");
      await createSession(row.id);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar,
        provider: (row.provider as AuthUser["provider"]) || "email",
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
        .select({ code: inviteCodes.code, usedBy: inviteCodes.usedBy })
        .from(inviteCodes)
        .where(eq(inviteCodes.code, code))
        .limit(1);
      const row = rows[0];
      if (!row) return { valid: false };
      if (INVITE_CODES_UNLIMITED_REUSE) return { valid: true };
      return { valid: !row.usedBy };
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

function safePostAuthRedirect(target: string | undefined): string {
  if (!target) return "/";
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  if (target === "/auth" || target.startsWith("/auth?") || target.startsWith("/auth/")) return "/";
  return target;
}

function oauthCookieOpts(maxAgeSeconds: number) {
  const secure = process.env.COOKIE_SECURE === "1" || process.env.COOKIE_SECURE === "true";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: maxAgeSeconds,
  };
}

/** Start Google OAuth — returns authorize URL; client should navigate there. */
export const startGoogleOAuthFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ redirect: z.string().optional() }))
  .handler(async ({ data }): Promise<{ url: string }> => {
    try {
      const redirectPath = safePostAuthRedirect(data.redirect);
      const { state, nonce } = createOAuthState(redirectPath);
      setCookie(GOOGLE_OAUTH_STATE_COOKIE, nonce, oauthCookieOpts(10 * 60));
      const url = buildGoogleAuthorizeUrl(state);
      return { url };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("missing_env:")) {
        fail("oauth_not_configured", "Google sign-in is not configured on this server.");
      }
      toAuthError(e);
    }
  });

/** Finish Google OAuth after /auth/callback receives code+state. */
export const completeGoogleOAuthFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<{ redirect: string; user: AuthUser }> => {
    try {
      const parsed = parseOAuthState(data.state);
      if (!parsed) throw new AuthError("oauth_state_invalid", "Sign-in expired. Please try Google again.");

      const cookieNonce = getCookie(GOOGLE_OAUTH_STATE_COOKIE);
      deleteCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: "/" });
      if (!cookieNonce || cookieNonce !== parsed.nonce) {
        throw new AuthError("oauth_state_invalid", "Sign-in expired. Please try Google again.");
      }

      const profile = await exchangeGoogleCode(data.code);
      const db = getDb();

      const bySub = await db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1);
      let row = bySub[0];

      if (!row) {
        const byEmail = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
        if (byEmail[0]) {
          await db
            .update(users)
            .set({
              googleSub: profile.sub,
              provider: "google",
              name: byEmail[0].name || profile.name,
              avatar: byEmail[0].avatar || profile.picture,
            })
            .where(eq(users.id, byEmail[0].id));
          const refreshed = await db.select().from(users).where(eq(users.id, byEmail[0].id)).limit(1);
          row = refreshed[0]!;
        } else {
          const id = newId("u");
          await db.insert(users).values({
            id,
            email: profile.email,
            passwordHash: null,
            provider: "google",
            googleSub: profile.sub,
            name: profile.name,
            avatar: profile.picture,
          });
          await db.insert(profiles).values({
            userId: id,
            data: EMPTY_PROFILE as unknown as Record<string, unknown>,
          });
          const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
          row = created[0]!;
        }
      } else {
        await db
          .update(users)
          .set({
            name: row.name || profile.name,
            avatar: row.avatar || profile.picture,
            email: profile.email,
            provider: "google",
          })
          .where(eq(users.id, row.id));
        const refreshed = await db.select().from(users).where(eq(users.id, row.id)).limit(1);
        row = refreshed[0]!;
      }

      await createSession(row.id);
      const user: AuthUser = {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar,
        provider: "google",
        createdAt: row.createdAt.getTime(),
      };
      return { redirect: parsed.redirectPath, user };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[completeGoogleOAuth]", msg);
      if (msg.startsWith("missing_env:")) {
        fail("oauth_not_configured", "Google sign-in is not configured on this server.");
      }
      if (msg.startsWith("google_")) {
        // Dev: surface Google's reason so we can diagnose redirect_uri / secret / invalid_grant.
        const detail =
          process.env.NODE_ENV !== "production" ? msg.replace(/^google_[^:]+:/, "").slice(0, 180) : "";
        fail(
          "oauth_failed",
          detail
            ? `Google sign-in failed (${detail}).`
            : "Google sign-in failed. Please try again.",
        );
      }
      toAuthError(e);
    }
  });
