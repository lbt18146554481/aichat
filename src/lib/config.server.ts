import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// Vite loads `.env` into process.env for the Node server during `vite dev`
// / production start. Always read env INSIDE this function (lazy).

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl: process.env.DATABASE_URL ?? "",
    sessionSecret: process.env.SESSION_SECRET ?? "dev-insecure-session-secret",
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
  };
}
