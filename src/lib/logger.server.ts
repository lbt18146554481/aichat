import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function serializeError(err: unknown): Record<string, unknown> | string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const any = err as Error & { status?: number; code?: string; error?: unknown };
    return {
      name: err.name,
      message: err.message,
      status: any.status,
      code: any.code,
      detail: any.error ?? undefined,
      stack: err.stack?.split("\n").slice(0, 6).join("\n"),
    };
  }
  try {
    return JSON.parse(JSON.stringify(err));
  } catch {
    return String(err);
  }
}

function write(level: LogLevel, scope: string, message: string, data?: unknown) {
  const ts = new Date().toISOString();
  const lineObj: Record<string, unknown> = { ts, level, scope, message };
  if (data !== undefined) {
    lineObj.data =
      data instanceof Error || (data && typeof data === "object" && "message" in (data as object))
        ? serializeError(data)
        : data;
  }
  const line = JSON.stringify(lineObj);

  const prefix = `[${ts}] [${level}] [${scope}] ${message}`;
  if (level === "error") console.error(prefix, data ?? "");
  else if (level === "warn") console.warn(prefix, data ?? "");
  else console.log(prefix, data ?? "");

  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {
    /* ignore file write failures */
  }
}

export const log = {
  debug: (scope: string, message: string, data?: unknown) => write("debug", scope, message, data),
  info: (scope: string, message: string, data?: unknown) => write("info", scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => write("warn", scope, message, data),
  error: (scope: string, message: string, data?: unknown) => write("error", scope, message, data),
  filePath: LOG_FILE,
};
