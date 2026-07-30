// Unit-test config kept separate from vite.config.ts on purpose: the app
// config loads the TanStack Start / Nitro plugin chain, which we don't want
// (and don't need) when running plain logic tests in jsdom.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
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
