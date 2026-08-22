/**
 * Build config, and the home of the two notes about `index.html` that would
 * otherwise ship to every reader.
 *
 * `index.html` is on the critical path and HTML comments are not stripped, so a
 * page of prose in there is a page of prose downloaded in a machine room. The
 * comments in that file are kept to a line or two; the reasoning lives here,
 * where it costs nobody anything.
 *
 * ---------------------------------------------------------------------------
 * Why the fonts are self-hosted
 *
 * `index.html` used to open with a `<link rel="stylesheet">` to
 * fonts.googleapis.com. That is render-blocking: nothing paints until the
 * stylesheet arrives, and it cannot arrive until a DNS lookup and a TLS
 * handshake to a second host have finished — after which the stylesheet names a
 * *third* host, fonts.gstatic.com, for another lookup and another handshake.
 * The `preconnect` hints that sat above it shortened the second pair; they did
 * not make the stylesheet non-blocking. For a technician on one bar in a
 * basement, that was the first paint spent on somebody else's DNS.
 *
 * Self-hosted the cost is zero extra connections: the woff2 files come down the
 * connection already open for the page, multiplexed with the JavaScript. The
 * `@font-face` rules are inline in the `<head>`, so the faces cost no request
 * either.
 *
 * What the reader sees while a face is in flight: `font-display: swap`, so the
 * text is painted immediately in system-ui and reflows into Source Sans 3 when
 * the file lands. A maintenance record that flashes in the wrong font is
 * readable; the browser's own default — `block`, which hides the text for up to
 * three seconds — would leave somebody staring at a blank screen holding a page
 * that had already loaded. Both Source Sans 3 slices are preloaded, so on a
 * connection that is merely slow rather than broken the font usually wins the
 * race against ~700 kB of JavaScript and there is no flash at all.
 *
 * What is shipped: the *variable* woff2 slices — one file spans the whole
 * weight range each family uses, instead of one file per weight — for the
 * `latin` and `latin-ext` subsets, which is what Turkish needs (ç/ö/ü are in
 * latin, ğ/ı/İ/ş in latin-ext). The other seven subsets Google serves
 * (cyrillic, greek, vietnamese, …) are not shipped. The browser fetches a slice
 * only when a character in its `unicode-range` is actually laid out.
 *
 * To regenerate `public/assets/fonts/`, fetch this URL with a modern-browser
 * user agent — an old one is answered with TTF instead of woff2 — and take the
 * `latin` and `latin-ext` blocks of each family:
 *
 *   https://fonts.googleapis.com/css2
 *     ?family=Source+Sans+3:wght@300..700
 *     &family=Source+Code+Pro:wght@400..600
 *     &display=swap
 *
 * The `v19` / `v31` in each filename is Google's own version for that family,
 * and it is in the filename on purpose: these files live under `/assets/`,
 * which `vercel.json` serves `immutable`, so a replacement that kept the same
 * name would be a face no returning browser would ever pick up.
 * ---------------------------------------------------------------------------
 */
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/**
 * The origin of the API, if this build was told about one.
 *
 * Returns null rather than guessing whenever a preconnect would be a lie: no
 * variable set, a relative base like `/api` (same origin — that connection is
 * already open), or a value that is not a URL at all. A preconnect to the wrong
 * host is not free; it is a DNS lookup and a TLS handshake spent on nothing,
 * which is the cost this is here to remove rather than to duplicate.
 */
function apiOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Opens the connection to the API while the JavaScript is still downloading.
 *
 * `VITE_API_URL` names a different host from the app, so the first data request
 * of the session pays a DNS lookup, a TCP handshake and a TLS handshake — and
 * pays them at the worst possible moment, once ~700 kB of JavaScript has parsed
 * and a screen is finally ready to ask for something. On a phone in a machine
 * room those round trips are most of a second, spent while the user watches a
 * skeleton.
 *
 * The hint is injected here rather than written into `index.html` by hand
 * because the hostname is a build-time variable: production, staging and every
 * preview deployment point at different origins, so a literal host would be
 * correct for one of them and a wasted handshake for the rest. `loadEnv` reads
 * the `.env` files *and* the real environment, which is how Vercel supplies it.
 *
 * `crossorigin="use-credentials"`, not a bare `crossorigin`: the API client
 * calls `fetch` with `credentials: "include"` for the refresh cookie, and
 * browsers keep credentialed and anonymous connections in separate pools. A
 * mismatched hint warms a socket the app then declines to use.
 */
function apiPreconnect(apiUrl: string | undefined): Plugin {
  const origin = apiOrigin(apiUrl);
  return {
    name: "shiftlush:api-preconnect",
    transformIndexHtml() {
      if (!origin) return [];
      return [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: origin, crossorigin: "use-credentials" },
          injectTo: "head",
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");

  return {
    plugins: [react(), tailwindcss(), apiPreconnect(env.VITE_API_URL)],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        "@messages": path.resolve(import.meta.dirname, "./messages"),
        "@fixtures": path.resolve(import.meta.dirname, "./fixtures"),
      },
    },
    server: {
      port: 5173,
    },
  };
});
