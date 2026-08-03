#!/usr/bin/env node
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const outDir = join(root, "dist", "native");
const wwwDir = join(root, "native", "www");
const viteBin = join(root, "node_modules", ".bin", "vite");

console.log("[native] Building SPA for iOS/Android...");
execSync(`${viteBin} build --config vite.native.config.ts`, { cwd: root, stdio: "inherit" });

console.log("[native] Copying dist/native -> native/www...");
if (existsSync(wwwDir)) {
  rmSync(wwwDir, { recursive: true, force: true });
}
mkdirSync(wwwDir, { recursive: true });
cpSync(outDir, wwwDir, { recursive: true, dereference: true });

// Vite keeps the input folder name, so the entry ends up at native/www/native/index.html.
// Capacitor expects the entry at the root of webDir.
const nestedHtml = join(wwwDir, "native", "index.html");
const rootHtml = join(wwwDir, "index.html");
if (existsSync(nestedHtml)) {
  renameSync(nestedHtml, rootHtml);
  rmSync(join(wwwDir, "native"), { recursive: true, force: true });
}

console.log("[native] Bundle ready at native/www");
