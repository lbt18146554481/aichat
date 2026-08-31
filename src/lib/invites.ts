// Invite codes — server-backed.

import {
  validateInviteFn,
  listMyInvitesFn,
  remainingInvitesFn,
  generateInviteFn,
} from "./api/auth.functions";
import { asAuthError } from "./auth-errors";

export interface InviteCode {
  code: string;
  createdBy: string;
  usedBy: string | null;
  createdAt: number;
  usedAt: number | null;
}

export const INITIAL_INVITES = 3;

export async function validateInvite(code: string): Promise<boolean> {
  try {
    const res = await validateInviteFn({ data: { code } });
    return res.valid;
  } catch (e) {
    throw asAuthError(e);
  }
}

/** @deprecated sync stub — use validateInvite (async) */
export function validateInviteSync(_code: string): boolean {
  return false;
}

export async function listMyCodes(_userId?: string): Promise<InviteCode[]> {
  return listMyInvitesFn();
}

export async function remainingInvites(_userId?: string): Promise<number> {
  return remainingInvitesFn();
}

export async function generateInvite(_userId?: string): Promise<InviteCode | null> {
  return generateInviteFn();
}

// consumeInvite is server-side only during signup; kept for test compatibility shape
export function consumeInvite(_code: string, _byUserId = "self"): boolean {
  return false;
}
