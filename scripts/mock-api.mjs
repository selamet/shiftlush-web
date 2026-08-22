/**
 * A stand-in API for the render smoke test.
 *
 * The test renders synchronously, so nothing async resolves during the render
 * itself — but the router awaits its loaders first, and the loaders warm the
 * query cache. Serving those loaders from here means the screens render real
 * content against the real request path: the same URLs, the same paging
 * envelope, the same field names the server sends.
 *
 * That makes this stricter than the fixtures it replaces. A screen reading a
 * field the contract does not have now renders `undefined` in the test, where
 * before the fixture simply had whatever field the screen wanted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function fixture(name) {
  return JSON.parse(readFileSync(join(ROOT, "fixtures", `${name}.json`), "utf8"));
}

/** The server's paging envelope, as SL-27 corrected it in the contract. */
function page(rows) {
  return {
    results: rows,
    pagination: { page: 1, page_size: 25, total: rows.length, total_pages: 1 },
  };
}

/**
 * Routes are matched most-specific first, so `/customers/{id}` is tried before
 * the collection. Each entry returns the body for that path.
 */
function resolve(path, search) {
  const customers = fixture("demo-customers");

  const detail = /^\/api\/v1\/customers\/([^/]+)$/.exec(path);
  if (detail) {
    return customers.find((row) => row.id === detail[1]) ?? customers[0];
  }

  if (path === "/api/v1/customers") return page(customers);

  if (path === "/api/v1/buildings") {
    const customer = search.get("customer");
    const rows = fixture("demo-buildings");
    return page(customer ? rows.filter((row) => row.customer_id === customer) : rows);
  }

  if (path === "/api/v1/contracts") {
    const customer = search.get("customer");
    const rows = fixture("demo-contracts");
    return page(customer ? rows.filter((row) => row.customer_id === customer) : rows);
  }

  return null;
}

/**
 * Installs the stub. Anything not routed above answers 404 in the documented
 * error envelope rather than throwing, so a screen that asks for something this
 * file does not know about exercises its own error state instead of crashing
 * the test with an unrelated message.
 */
export function installMockApi() {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const body = resolve(url.pathname, url.searchParams);

    if (body === null) {
      return new Response(
        JSON.stringify({ error: { code: "NOT_FOUND", request_id: "smoke" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}
