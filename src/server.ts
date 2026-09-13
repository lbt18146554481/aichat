import "./lib/error-capture";
import "dotenv/config";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/**
 * Apple Sign In posts `application/x-www-form-urlencoded` to the return URL
 * (response_mode=form_post). Convert that into a GET so the SPA callback can
 * finish OAuth the same way as Google.
 */
async function rewriteAppleFormPost(request: Request): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/auth/callback" && url.pathname !== "/auth/callback/") return null;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return null;

  const body = await request.text();
  const params = new URLSearchParams(body);
  const dest = new URL("/auth/callback", url.origin);
  for (const key of ["code", "state", "error", "error_description", "user"]) {
    const value = params.get(key);
    if (value) dest.searchParams.set(key, value);
  }
  return Response.redirect(dest.toString(), 303);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const appleRewrite = await rewriteAppleFormPost(request);
      if (appleRewrite) return appleRewrite;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
