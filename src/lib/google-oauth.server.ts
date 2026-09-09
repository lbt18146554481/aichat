import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_COOKIE = "maitri_oauth_state";

export { STATE_COOKIE as GOOGLE_OAUTH_STATE_COOKIE };

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

export function getGoogleOAuthConfig() {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
  };
}

function stateSecret(): string {
  return process.env.SESSION_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "dev-oauth-secret";
}

/** Compact signed payload: nonce.exp.redirectB64.sig */
export function createOAuthState(redirectPath: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const exp = String(Date.now() + 10 * 60 * 1000);
  const redirectB64 = Buffer.from(redirectPath, "utf8").toString("base64url");
  const body = `${nonce}.${exp}.${redirectB64}`;
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return { state: `${body}.${sig}`, nonce };
}

export function parseOAuthState(state: string): { nonce: string; redirectPath: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [nonce, exp, redirectB64, sig] = parts;
  if (!nonce || !exp || !redirectB64 || !sig) return null;
  const body = `${nonce}.${exp}.${redirectB64}`;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;
  let redirectPath: string;
  try {
    redirectPath = Buffer.from(redirectB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!redirectPath.startsWith("/") || redirectPath.startsWith("//")) redirectPath = "/";
  if (redirectPath === "/auth" || redirectPath.startsWith("/auth?") || redirectPath.startsWith("/auth/")) {
    redirectPath = "/";
  }
  return { nonce, redirectPath };
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
    console.error("[google token]", tokenRes.status, text.slice(0, 500));
    throw new Error(`google_token_failed:${tokenRes.status}:${text.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("google_token_missing");

  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!infoRes.ok) {
    const text = await infoRes.text().catch(() => "");
    console.error("[google userinfo]", infoRes.status, text.slice(0, 500));
    throw new Error(`google_userinfo_failed:${infoRes.status}:${text.slice(0, 200)}`);
  }
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.sub || !info.email) throw new Error("google_profile_incomplete");
  return {
    sub: info.sub,
    email: info.email.trim().toLowerCase(),
    emailVerified: Boolean(info.email_verified),
    name: (info.name || info.email.split("@")[0] || "member").trim(),
    picture: (info.picture || "").trim(),
  };
}
