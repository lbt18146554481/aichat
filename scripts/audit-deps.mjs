#!/usr/bin/env node
/**
 * Dependency vulnerability gate.
 *
 * Runs `npm audit --json` and fails the process when any advisory at or above
 * the configured severity threshold is found. Used locally (`npm run audit`)
 * and in CI (.github/workflows/dependency-audit.yml) so newly vulnerable
 * packages are caught before a release.
 *
 * Usage:
 *   node scripts/audit-deps.mjs [--level=high] [--json]
 */
import { execFileSync } from "node:child_process";

const ORDER = ["info", "low", "moderate", "high", "critical"];

const args = process.argv.slice(2);
const levelArg = args.find((a) => a.startsWith("--level="));
const level = (levelArg ? levelArg.split("=")[1] : "high").toLowerCase();
const asJson = args.includes("--json");

if (!ORDER.includes(level)) {
  console.error(`Unknown --level=${level}. Expected one of: ${ORDER.join(", ")}`);
  process.exit(2);
}

const threshold = ORDER.indexOf(level);

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json", "--audit-level=info"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // npm audit exits non-zero when vulnerabilities exist; stdout is still valid JSON.
    if (error.stdout) return error.stdout;
    console.error("Failed to run `npm audit`:", error.message);
    process.exit(2);
  }
}

const raw = runAudit();

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("Could not parse `npm audit --json` output.");
  process.exit(2);
}

const vulns = Object.values(report.vulnerabilities ?? {});
const flagged = vulns
  .filter((v) => ORDER.indexOf(v.severity) >= threshold)
  .map((v) => ({
    name: v.name,
    severity: v.severity,
    range: v.range,
    direct: Boolean(v.isDirect),
    fixAvailable:
      typeof v.fixAvailable === "object" && v.fixAvailable
        ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? " (major)" : ""}`
        : v.fixAvailable
          ? "yes"
          : "none",
    via: (v.via ?? [])
      .map((entry) => (typeof entry === "string" ? entry : entry.title))
      .filter(Boolean),
  }))
  .sort((a, b) => ORDER.indexOf(b.severity) - ORDER.indexOf(a.severity));

if (asJson) {
  console.log(JSON.stringify({ level, count: flagged.length, findings: flagged }, null, 2));
} else if (flagged.length === 0) {
  console.log(`✅ No dependency vulnerabilities at severity >= ${level}.`);
} else {
  console.log(`❌ ${flagged.length} dependency vulnerability(ies) at severity >= ${level}:\n`);
  for (const f of flagged) {
    console.log(`  ${f.severity.toUpperCase()}  ${f.name}  ${f.range}`);
    console.log(`      direct: ${f.direct ? "yes" : "no"} · fix: ${f.fixAvailable}`);
    for (const title of f.via.slice(0, 3)) console.log(`      - ${title}`);
    console.log("");
  }
  console.log("Fix with `npm audit fix`, a version bump, or an `overrides` entry in package.json.");
}

process.exit(flagged.length > 0 ? 1 : 0);
