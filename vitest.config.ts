// Unit-test config kept separate from vite.config.ts on purpose: the app
// config loads the TanStack Start / Nitro plugin chain, which we don't want
// (and don't need) when running plain logic tests in jsdom.
import { defineConfig, type Plugin } from "vitest/config";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

/** Resolve TanStack-style `foo.server` imports to `foo.server.ts` for vitest. */
function resolveServerSuffix(): Plugin {
  return {
    name: "resolve-server-suffix",
    resolveId(id, importer) {
      if (!id.includes(".server") || id.endsWith(".ts") || id.endsWith(".js")) return null;
      if (!importer) return null;
      const base = path.resolve(path.dirname(importer), id);
      for (const ext of [".ts", ".tsx", ".js"]) {
        const candidate = base + ext;
        if (fs.existsSync(candidate)) return candidate;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveServerSuffix()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    globals: true,
    restoreMocks: true,
  },
});
