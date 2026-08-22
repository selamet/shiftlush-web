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

  // The firm, and the person signed in. Note the missing trailing slash on
  // both: the contract spells the auth endpoints and `/company` without one,
  // and a mock lenient about that would hide the redirect this file exists to
  // catch.
  if (path === "/api/v1/company") {
    const company = fixture("demo-company");
    return method === "PATCH" ? { ...company, ...body } : company;
  }
  if (path === "/api/v1/auth/me") {
    // u2 is whoever is signed in, the same colleague the user screens assume.
    const me = fixture("demo-users").find((one) => one.id === "u2");
    return { ...me, company_id: "co-1", company_name: fixture("demo-company").display_name };
  }

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

  // A scanned label. Exactly one token resolves and every other one falls
  // through to the 404 below — which is what the server does for a token that
  // does not exist and for one belonging to another firm alike, and is the
  // branch the resolve screen exists for. A mock that answered every token
  // would leave the only interesting half of that screen unrendered.
  const byQr = /^\/api\/v1\/elevators\/by-qr\/([^/]+)\/$/.exec(path);
  if (byQr) {
    if (byQr[1] !== "qr-demo-token") return null;
    const detail = fixture("demo-elevator-detail");
    // Narrowed to the contract's `ElevatorByQr`, not the whole record. The
    // point of that endpoint is that it is small; handing back the detail
    // response here would hide a screen reading a field it will not be sent.
    return {
      id: detail.id,
      registration_number: detail.registration_number,
      name: detail.name,
      building_name: detail.building_name,
      customer_name: detail.customer_name,
      status: detail.status,
      inspection_label: detail.inspection_label,
      has_car_door: detail.has_car_door,
      brand: detail.brand,
      model: detail.model,
      capacity_kg: detail.capacity_kg,
      capacity_persons: detail.capacity_persons,
      stop_count: detail.stop_count,
      speed_mps: detail.speed_mps,
      last_inspection_date: detail.last_inspection_date,
      next_inspection_date: detail.next_inspection_date,
    };
  }

  const elevator = /^\/api\/v1\/elevators\/([^/]+)\/$/.exec(path);
  if (elevator) {
    const detail = fixture("demo-elevator-detail");
    return { ...detail, id: elevator[1] };
  }

  if (method === "POST" && path === "/api/v1/elevators/") {
    return { ...fixture("demo-elevator-detail"), ...body, id: "e-new" };
  }
  if (path === "/api/v1/elevators/") return page(fixture("demo-elevators"));

  if (path === "/api/v1/attachments/") {
    // Filtered the way the server filters it. The settings screen asks for the
    // company's logos; a mock that ignored the query would hand it back the
    // elevator's inspection reports and the panel would look like it worked.
    const objectType = search.get("object_type");
    const category = search.get("category");
    let rows = fixture("demo-attachments");
    if (objectType) rows = rows.filter((row) => row.object_type === objectType);
    if (category) rows = rows.filter((row) => row.category === category);
    return page(rows);
  }

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

  const complex = /^\/api\/v1\/complexes\/([^/]+)\/$/.exec(path);
  if (method === "PATCH" && complex) {
    return { ...fixture("demo-complexes")[0], ...body, id: complex[1] };
  }
  if (method === "POST" && path === "/api/v1/complexes/") {
    return { ...fixture("demo-complexes")[0], ...body, id: "s-new" };
  }
  if (complex && method === "GET") {
    const rows = fixture("demo-complexes");
    return rows.find((row) => row.id === complex[1]) ?? rows[0];
  }
  if (path === "/api/v1/complexes/") {
    const customer = search.get("customer");
    const rows = fixture("demo-complexes");
    return page(customer ? rows.filter((row) => row.customer_id === customer) : rows);
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
    const inComplex = search.get("complex");
    let rows = fixture("demo-buildings");
    if (customer) rows = rows.filter((row) => row.customer_id === customer);
    // The complex detail page asks the server to narrow this rather than
    // filtering in the browser, so the mock has to honour the same parameter.
    if (inComplex) rows = rows.filter((row) => row.complex_id === inComplex);
    return page(rows);
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

  // The team. Two resources: colleagues who can sign in, and invitations that
  // have not become colleagues yet.
  const users = fixture("demo-users");

  const deactivated = /^\/api\/v1\/users\/([^/]+)\/deactivate\/$/.exec(path);
  if (method === "POST" && deactivated) {
    const row = users.find((one) => one.id === deactivated[1]) ?? users[0];
    return { ...row, is_active: false };
  }

  const assigned = /^\/api\/v1\/users\/([^/]+)\/customers\/$/.exec(path);
  if (method === "PUT" && assigned) {
    const row = users.find((one) => one.id === assigned[1]) ?? users[0];
    return { ...row, assigned_customer_ids: body?.customer_ids ?? [] };
  }

  const colleague = /^\/api\/v1\/users\/([^/]+)\/$/.exec(path);
  if (colleague) {
    const row = users.find((one) => one.id === colleague[1]) ?? users[0];
    return method === "PATCH" ? { ...row, ...body } : row;
  }

  if (path === "/api/v1/users/") {
    // Filtered the way the server filters it. The screens ask this endpoint how
    // many active owners are left before they offer to deactivate one, and a
    // mock that ignored the query would answer with the whole staff — turning
    // the last-owner guard off in exactly the test meant to exercise it.
    const role = search.get("role");
    const isActive = search.get("is_active");
    let rows = users;
    if (role) rows = rows.filter((one) => one.role === role);
    if (isActive) rows = rows.filter((one) => String(one.is_active) === isActive);
    return page(rows);
  }

  const invitations = fixture("demo-invitations");

  const resent = /^\/api\/v1\/invitations\/([^/]+)\/resend\/$/.exec(path);
  if (method === "POST" && resent) {
    return invitations.find((one) => one.id === resent[1]) ?? invitations[0];
  }
  if (method === "POST" && path === "/api/v1/invitations/") {
    return { ...invitations[0], ...body, id: "i-new" };
  }
  const revoked = /^\/api\/v1\/invitations\/([^/]+)\/$/.exec(path);
  if (method === "DELETE" && revoked) return {};
  if (path === "/api/v1/invitations/") return page(invitations);

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
