#!/usr/bin/env node
// Guards the "single repo, isolated native shell" contract:
//  1. No business code imports @capacitor/* directly (only the bridge / native entry may).
//  2. The web build output never contains native shell assets.
//  3. The native bundle (native/www) has a root index.html + hashed assets.
// Exits non-zero with a readable report so CI fails loudly.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const errors = [];
const checks = [];

const ALLOWED_CAPACITOR_IMPORTERS = new Set([
  join("src", "lib", "platform", "bridge.ts"),
  join("src", "native-entry.tsx"),
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// --- 1. Import isolation -----------------------------------------------------
const srcFiles = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const offenders = [];
for (const file of srcFiles) {
  const rel = relative(root, file);
  if (ALLOWED_CAPACITOR_IMPORTERS.has(rel.split("/").join(sep))) continue;
  const code = readFileSync(file, "utf8");
  if (/from\s+["']@capacitor\/|import\(\s*["']@capacitor\//.test(code)) {
    offenders.push(rel);
  }
}
if (offenders.length) {
  errors.push(
    `Direct @capacitor/* imports outside the platform bridge:\n  - ${offenders.join("\n  - ")}\n` +
      `  Use "@/lib/platform" instead.`,
  );
} else {
  checks.push(`import isolation: ${srcFiles.length} source files clean`);
}

// --- 2. Web output is native-free -------------------------------------------
const webOut = join(root, ".output");
if (existsSync(webOut)) {
  const leaked = walk(webOut)
    .map((f) => relative(root, f))
    .filter((f) => /native-entry|capacitor/i.test(f));
  if (leaked.length) {
    errors.push(`Native shell code leaked into the web build output:\n  - ${leaked.join("\n  - ")}`);
  } else {
    checks.push("web build output: no native/Capacitor artifacts");
  }
} else {
  checks.push("web build output: not present (skipped)");
}

// --- 3. Native bundle shape --------------------------------------------------
const www = join(root, "native", "www");
if (existsSync(www)) {
  if (!existsSync(join(www, "index.html"))) {
    errors.push("native/www/index.html missing — Capacitor needs the entry at the webDir root.");
  } else {
    const html = readFileSync(join(www, "index.html"), "utf8");
    if (!/src="\/assets\//.test(html)) {
      errors.push('native/www/index.html does not reference absolute "/assets/..." paths.');
    } else {
      checks.push("native bundle: root index.html with absolute asset paths");
    }
  }
  if (!existsSync(join(www, "assets"))) {
    errors.push("native/www/assets missing — the native bundle did not emit any assets.");
  }
} else {
  checks.push("native bundle: not built (skipped)");
}

for (const c of checks) console.log(`ok  ${c}`);
if (errors.length) {
  console.error("\nnative isolation check FAILED:\n");
  for (const e of errors) console.error(`- ${e}\n`);
  process.exit(1);
}
console.log("\nnative isolation check passed.");
