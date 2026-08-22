/**
 * A stand-in API for the render smoke test.
 *
 * The test renders synchronously, so nothing async resolves during the render
 * itself — but the router awaits its loaders first, and the loaders warm the
 * query cache. Serving those loaders from here means the screens render real
 * content against the real request path: the same URLs, the same paging
 * envelope, the same field names the server sends.
 *
 * Paths are spelled the way the contract spells them, trailing slash included.
 * A mock that is lenient about the shape of a URL is a mock that hides the one
 * bug this arrangement exists to catch.
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
function resolve(path, search, method, body) {
  // Writes are answered, not just reads. A form that submits during the smoke
  // test must get a record back, or the screen renders its error state and the
  // test passes while proving the opposite of what it claims.
  // Public authentication. These are the paths a signed-out person reaches,
  // and the smoke test renders every one of them.
  const invitation = /^\/api\/v1\/invitations\/verify\/([^/]+)$/.exec(path);
  if (invitation) {
    return {
      email: "yeni@example.com",
      first_name: "Nur",
      last_name: "Yeni",
      role: "operations",
      company_name: "Yükseliş Asansör",
      expires_at: "2026-12-31T23:59:59Z",
    };
  }
  if (method === "POST" && path === "/api/v1/auth/email/verify") return {};

  if (method === "POST" && path === "/api/v1/customers/") {
    return { ...fixture("demo-customers")[0], ...body, id: "c-new" };
  }
  const patched = /^\/api\/v1\/customers\/([^/]+)\/$/.exec(path);
  if (method === "PATCH" && patched) {
    const rows = fixture("demo-customers");
    const before = rows.find((row) => row.id === patched[1]) ?? rows[0];
    return { ...before, ...body, id: patched[1] };
  }

  // Contacts. Created under the customer, edited by their own id — the two
  // paths the contact form uses, and both have to answer or the form renders
  // its error state and the smoke run passes on a broken screen.
  const nested = /^\/api\/v1\/customers\/([^/]+)\/contacts\/$/.exec(path);
  if (nested) {
    const contacts = fixture("demo-customers")[0].contacts;
    if (method === "POST") return { ...contacts[0], ...body, id: "k-new", customer_id: nested[1] };
    return page(contacts);
  }
  const contact = /^\/api\/v1\/customer-contacts\/([^/]+)\/$/.exec(path);
  if (contact) {
    return { ...fixture("demo-customers")[0].contacts[0], ...body, id: contact[1] };
  }

  const customers = fixture("demo-customers");

  const detail = /^\/api\/v1\/customers\/([^/]+)\/$/.exec(path);
  if (detail) {
    return customers.find((row) => row.id === detail[1]) ?? customers[0];
  }

  if (path === "/api/v1/customers/") return page(customers);

  const elevator = /^\/api\/v1\/elevators\/([^/]+)\/$/.exec(path);
  if (elevator) {
    const detail = fixture("demo-elevator-detail");
    return { ...detail, id: elevator[1] };
  }

  if (method === "POST" && path === "/api/v1/elevators/") {
    return { ...fixture("demo-elevator-detail"), ...body, id: "e-new" };
  }
  if (path === "/api/v1/elevators/") return page(fixture("demo-elevators"));

  if (path === "/api/v1/attachments/") return page(fixture("demo-attachments"));

  if (path === "/api/v1/audit-logs/") return page(fixture("demo-audit-logs-elevator"));

  if (path === "/api/v1/provinces/") {
    return [
      { id: 34, name: "İstanbul", legal_name: "İstanbul", display_name: "İstanbul" },
      { id: 6, name: "Ankara", legal_name: "Ankara", display_name: "Ankara" },
    ];
  }
  if (path === "/api/v1/districts/") {
    const province = Number(search.get("province"));
    // Mirrors the server: no province, no answer. A mock that returned the
    // whole list would let the client skip a step the API refuses to skip.
    if (!province) return [];
    return [{ id: 3401, province_id: province, name: "Kadıköy" }];
  }
  if (path === "/api/v1/neighborhoods/") {
    const district = Number(search.get("district"));
    const term = (search.get("search") ?? "").trim();
    if (!district || term.length < 2) return [];
    return [
      {
        id: 340101,
        district_id: district,
        district_name: "Kadıköy",
        province_name: "İstanbul",
        name: "Caferağa",
        postal_code: "34710",
        type: "neighborhood",
      },
    ];
  }

  const building = /^\/api\/v1\/buildings\/([^/]+)\/$/.exec(path);
  if (building && method === "GET") {
    return { ...fixture("demo-buildings")[0], id: building[1] };
  }
  if (method === "POST" && path === "/api/v1/buildings/") {
    return { ...fixture("demo-buildings")[0], ...body, id: "b-new" };
  }

  if (path === "/api/v1/buildings/") {
    const customer = search.get("customer");
    const rows = fixture("demo-buildings");
    return page(customer ? rows.filter((row) => row.customer_id === customer) : rows);
  }

  const contract = /^\/api\/v1\/contracts\/([^/]+)\/$/.exec(path);
  if (contract && method === "GET") {
    return { ...fixture("demo-contract"), id: contract[1] };
  }
  if (method === "POST" && path === "/api/v1/contracts/") {
    return { ...fixture("demo-contract"), ...body, id: "k-new" };
  }

  if (path === "/api/v1/contracts/") {
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
/** Every URL the stub was asked for, so a test can assert what was *not* asked. */
export const requested = [];

export function installMockApi() {
  requested.length = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    requested.push(url.pathname);
    const sent = init.body ? JSON.parse(init.body) : undefined;
    const body = resolve(url.pathname, url.searchParams, init.method ?? "GET", sent);

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
