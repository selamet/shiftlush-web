import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * The unit suite.
 *
 * Deliberately its own config rather than `test` bolted onto vite.config.ts.
 * That config exists to build a browser bundle: it loads the React plugin and
 * Tailwind, neither of which any test here needs, and paying for them on every
 * run buys nothing. The aliases below mirror it because they are the only part
 * the tests do need — a fourth alias added there and not here fails loudly on
 * the first import, which is the failure mode you want.
 *
 * `tests/` sits outside `src/` on purpose. Every standalone check in scripts/
 * walks src/ — `lint:tr` forbids Turkish characters there, `lint:i18n` demands
 * that every t() key exists, `lint:buttons` demands that every button does
 * something. Test files are none of those things, and keeping them out of src/
 * means none of those checks needs an exception carved into it. It also means a
 * test may contain the Turkish it is asserting about, which `initials()` needs.
 *
 * The environment is node, not jsdom. Nothing under test renders: what is
 * tested here is which error a failure becomes and how many times the network
 * is touched. Rendering already has a check of its own — `npm run smoke` puts
 * all 41 routes through the real router for all four roles — and buying jsdom
 * to re-prove that would cost startup time on every run for a second opinion.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@messages": path.resolve(import.meta.dirname, "./messages"),
      "@fixtures": path.resolve(import.meta.dirname, "./fixtures"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
