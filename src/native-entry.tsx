import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initPlatform } from "./lib/platform/bridge";

const router = getRouter();

// Initialize native bridge (no-op on web) before first paint so the splash
// screen can be hidden and the status bar styled as early as possible.
await initPlatform();

await router.load();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
