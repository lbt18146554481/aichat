import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sign in with Apple (web / Services ID).
 *
 * Env (put real values in `.env` — never commit secrets):
 * - APPLE_CLIENT_ID   — Services ID, e.g. info.pelegant.meetup.services
 * - APPLE_TEAM_ID     — 10-char Team ID
 * - APPLE_KEY_ID      — Key ID from the .p8 filename / Apple Developer
 * - APPLE_PRIVATE_KEY — PEM body (prefer this in production)
 *   OR APPLE_PRIVATE_KEY_PATH — path to AuthKey_XXXX.p8
 * - APPLE_REDIRECT_URI — must match Apple Developer Return URL
 */

export type AppleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function loadApplePrivateKeyPem(): string {
  const inline = process.env.APPLE_PRIVATE_KEY?.trim();
  if (inline) {
    return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  }
  const pathEnv = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
  if (!pathEnv) throw new Error("missing_env:APPLE_PRIVATE_KEY");
  const abs = resolve(process.cwd(), pathEnv);
  return readFileSync(abs, "utf8");
}

export function getAppleOAuthConfig() {
  return {
    clientId: requireEnv("APPLE_CLIENT_ID"),
    teamId: requireEnv("APPLE_TEAM_ID"),
    keyId: requireEnv("APPLE_KEY_ID"),
    redirectUri: requireEnv("APPLE_REDIRECT_URI"),
    privateKeyPem: loadApplePrivateKeyPem(),
  };
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** Apple requires a short-lived ES256 JWT as client_secret. */
export function createAppleClientSecret(): string {
  const { clientId, teamId, keyId, privateKeyPem } = getAppleOAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 180, // ~6 months (Apple max)
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function buildAppleAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getAppleOAuthConfig();
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  return url.toString();
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) throw new Error("apple_id_token_invalid");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("apple_id_token_invalid");
  }
}

export async function exchangeAppleCode(code: string): Promise<AppleProfile> {
  const { clientId, redirectUri } = getAppleOAuthConfig();
  const clientSecret = createAppleClientSecret();
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    console.error("[apple token]", tokenRes.status, text.slice(0, 500));
    throw new Error(`apple_token_failed:${tokenRes.status}:${text.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as { id_token?: string };
  if (!tokenJson.id_token) throw new Error("apple_id_token_missing");

  const claims = decodeJwtPayload(tokenJson.id_token);
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) throw new Error("apple_profile_incomplete");

  const emailRaw = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  // Apple may omit email on later sign-ins; keep a stable placeholder keyed by sub.
  const email = emailRaw || `apple-${sub.slice(0, 16)}@privaterelay.appleid.com`;
  const emailVerified =
    claims.email_verified === true ||
    claims.email_verified === "true" ||
    Boolean(emailRaw);

  return {
    sub,
    email,
    emailVerified,
    name: (emailRaw.split("@")[0] || "member").trim(),
  };
}
