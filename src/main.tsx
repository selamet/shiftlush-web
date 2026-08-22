import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@/lib/i18n";
import "@/styles/globals.css";
import { router } from "@/router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initSentry } from "@/lib/sentry";

// Before the first render, so a screen that throws on its way up is reported
// rather than merely drawn as a failure. Does nothing without VITE_SENTRY_DSN,
// which is local development.
//
// This is also the only module that may import src/lib/sentry.ts:
// scripts/smoke-render.mjs renders the router under Node, where a browser SDK
// that reaches for `window` at import time breaks the render check, and this is
// the one file that render never loads.
initSentry();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    {/* Outside the router on purpose: the screen-level boundary inside the
        shell keeps the navigation standing, and this one catches what is left
        — the shell, the providers, the public screens and the router itself. */}
    <ErrorBoundary where="root">
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
