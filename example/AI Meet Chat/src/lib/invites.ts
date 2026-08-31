// Frontend-only invite code demo layer.
//
// Codes come from two sources:
//   1. A small built-in seed whitelist (so the very first user can sign up).
//   2. Codes that logged-in users generate themselves; each user starts
//      with `INITIAL_INVITES` codes.
//
// Codes are single-use — consuming one removes it from the pool. Real
// persistence is expected to be swapped in on the backend later; the
// shape (code, createdBy, usedBy, createdAt) mirrors what a real
// `invite_codes` table would look like.

export interface InviteCode {
  code: string;
  createdBy: string; // user id, or "seed"
  usedBy: string | null; // user id after consumption
  createdAt: number;
  usedAt: number | null;
}

const KEY = "kindred:invites.v1";
const SEED_CODES = ["KINDRED2026", "WELCOME", "FRIENDS"];
export const INITIAL_INVITES = 3;

function readAll(): InviteCode[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as InviteCode[];
  } catch {
    /* noop */
  }
  // First read — plant the seed codes.
  const now = Date.now();
  const seeded: InviteCode[] = SEED_CODES.map((c) => ({
    code: c,
    createdBy: "seed",
    usedBy: null,
    createdAt: now,
    usedAt: null,
  }));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seeded));
  } catch {
    /* noop */
  }
  return seeded;
}

function writeAll(rows: InviteCode[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* noop */
  }
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** True if the code exists and hasn't been used. */
export function validateInvite(code: string): boolean {
  const norm = code.trim().toUpperCase();
  if (!norm) return false;
  return readAll().some((r) => r.code === norm && !r.usedBy);
}

/** Mark the code as used. Returns true on success. */
export function consumeInvite(code: string, byUserId = "self"): boolean {
  const norm = code.trim().toUpperCase();
  const rows = readAll();
  const idx = rows.findIndex((r) => r.code === norm && !r.usedBy);
  if (idx < 0) return false;
  rows[idx] = { ...rows[idx], usedBy: byUserId, usedAt: Date.now() };
  writeAll(rows);
  return true;
}

/** Codes this user has generated (used or not). */
export function listMyCodes(userId: string): InviteCode[] {
  return readAll()
    .filter((r) => r.createdBy === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** How many more codes this user is allowed to generate. */
export function remainingInvites(userId: string): number {
  const generated = listMyCodes(userId).length;
  return Math.max(0, INITIAL_INVITES - generated);
}

/** Generate a fresh code for the user. Returns null if quota reached. */
export function generateInvite(userId: string): InviteCode | null {
  if (remainingInvites(userId) <= 0) return null;
  const rows = readAll();
  let code = randomCode();
  // Extremely unlikely, but avoid collision.
  while (rows.some((r) => r.code === code)) code = randomCode();
  const row: InviteCode = {
    code,
    createdBy: userId,
    usedBy: null,
    createdAt: Date.now(),
    usedAt: null,
  };
  writeAll([row, ...rows]);
  return row;
}
