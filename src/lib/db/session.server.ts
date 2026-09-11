import { randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "./client.server";
import { authSessions, users } from "./schema";
import type { AuthUser } from "../auth-types";

export const SESSION_COOKIE = "maitri_session";
const SESSION_DAYS = 30;

export function newId(prefix = ""): string {
  const id = randomBytes(8).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

function cookieOpts(maxAgeSeconds: number) {
  // Pure HTTP (IP / no TLS) cannot use Secure cookies — browsers drop them.
  // Enable only when the site is served over HTTPS: COOKIE_SECURE=1
  const secure = process.env.COOKIE_SECURE === "1" || process.env.COOKIE_SECURE === "true";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure,
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({ token, userId, expiresAt });
  setCookie(SESSION_COOKIE, token, cookieOpts(SESSION_DAYS * 24 * 60 * 60));
  return token;
}

export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    const db = getDb();
    await db.delete(authSessions).where(eq(authSessions.token, token));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatar: users.avatar,
      createdAt: users.createdAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
    provider: "email",
    createdAt: row.createdAt.getTime(),
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("unauthorized");
  }
  return user;
}
