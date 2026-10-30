#!/usr/bin/env node
/**
 * Build a self-contained iOS zip for a friend to open in Xcode.
 * Vendors Capacitor SPM plugins so CapApp-SPM does not need the monorepo node_modules.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const stage = "/tmp/Compamore-iOS-pack";
const outZip = join(
  process.env.HOME || "/Users/lubitong",
  "Desktop/Compamore-iOS-for-friend-Xcode.zip",
);

const plugins = [
  { npm: "@capacitor/app", dir: "CapacitorApp" },
  { npm: "@capacitor/browser", dir: "CapacitorBrowser" },
  { npm: "@capacitor/keyboard", dir: "CapacitorKeyboard" },
  { npm: "@capacitor/splash-screen", dir: "CapacitorSplashScreen" },
  { npm: "@capacitor/status-bar", dir: "CapacitorStatusBar" },
];

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// Sync capacitor config into ios first
execSync("npx cap copy ios", { cwd: root, stdio: "inherit" });

execSync(
  [
    "rsync -a",
    "--exclude DerivedData",
    "--exclude '**/xcuserdata'",
    "--exclude '**/.DS_Store'",
    "--exclude '**/Pods'",
    "--exclude build",
    `"${join(root, "native/ios")}/"`,
    `"${join(stage, "Compamore-iOS")}/"`,
  ].join(" "),
  { stdio: "inherit", shell: "/bin/zsh" },
);

const depsRoot = join(stage, "Compamore-iOS/App/capacitor-spm-deps");
mkdirSync(depsRoot, { recursive: true });

for (const { npm, dir } of plugins) {
  const src = join(root, "node_modules", npm);
  if (!existsSync(join(src, "Package.swift"))) {
    throw new Error(`Missing SPM package for ${npm} at ${src}`);
  }
  const dest = join(depsRoot, dir);
  // Filter relative to package root — do NOT match the monorepo ".../node_modules/..." prefix.
  cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const rel = from.slice(src.length).replaceAll("\\", "/");
      if (!rel) return true;
      if (rel.startsWith("/android") || rel.includes("/android/")) return false;
      if (rel.startsWith("/dist") || rel.includes("/dist/")) return false;
      if (rel.includes("/node_modules")) return false;
      if (rel.includes("/.git")) return false;
      return true;
    },
  });
}

const packageSwift = `// swift-tools-version: 5.9
import PackageDescription

// Self-contained for friend Xcode pack — plugins vendored under capacitor-spm-deps/
// (Do not copy this file back over the repo CapApp-SPM/Package.swift used with node_modules.)
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),
        .package(name: "CapacitorApp", path: "../capacitor-spm-deps/CapacitorApp"),
        .package(name: "CapacitorBrowser", path: "../capacitor-spm-deps/CapacitorBrowser"),
        .package(name: "CapacitorKeyboard", path: "../capacitor-spm-deps/CapacitorKeyboard"),
        .package(name: "CapacitorSplashScreen", path: "../capacitor-spm-deps/CapacitorSplashScreen"),
        .package(name: "CapacitorStatusBar", path: "../capacitor-spm-deps/CapacitorStatusBar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
`;

writeFileSync(join(stage, "Compamore-iOS/App/CapApp-SPM/Package.swift"), packageSwift);

const guide = readFileSync(join(root, "native/给朋友的Xcode部署说明.md"), "utf8");
writeFileSync(join(stage, "README-Xcode-CN.md"), guide);

rmSync(outZip, { force: true });
execSync(`cd /tmp && zip -r -q "${outZip}" Compamore-iOS-pack -x "*.DS_Store"`, {
  stdio: "inherit",
});

console.log(`[pack-ios] wrote ${outZip}`);
console.log(`[pack-ios] CapApp-SPM deps vendored: ${plugins.map((p) => p.dir).join(", ")}`);
