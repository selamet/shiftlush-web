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

/** A calendar day where the run happens, as `YYYY-MM-DD`. */
function localDay(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** This month's plan, dated around today. See the planned-visits route below. */
function plannedVisits() {
  const now = new Date();
  const today = localDay(now);
  const period = today.slice(0, 7);
  const first = `${period}-01`;
  const last = localDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const place = {
    building: "b1",
    building_name: "A Blok",
    neighborhood_name: "Muratpaşa",
    district: 2045,
    district_name: "Yakutiye",
    customer: "c1",
    customer_name: "Dadaş Konakları Site Yönetimi",
    period,
    manually_edited: false,
    created_at: `${first}T00:30:00Z`,
    updated_at: `${first}T00:30:00Z`,
  };
  const hakan = { technician: "u3", technician_name: "Hakan Çelik" };
  const nobody = { technician: null, technician_name: null };
  return [
    { ...place, ...hakan, id: "p1", elevator: "e1", elevator_name: "Sol asansör", due_date: today, planned_date: null, status: "planned", visit: null, latest_visit_status: null, is_overdue: false },
    { ...place, ...hakan, id: "p2", elevator: "e2", elevator_name: "Sağ asansör", due_date: first, planned_date: null, status: "planned", visit: null, latest_visit_status: "access_denied", is_overdue: first < today },
    { ...place, ...nobody, id: "p3", elevator: "e3", elevator_name: "Yük asansörü", building: "b2", building_name: "B Blok", due_date: last, planned_date: null, status: "planned", visit: null, latest_visit_status: null, is_overdue: false },
    { ...place, ...hakan, id: "p4", elevator: "e4", elevator_name: "Servis asansörü", due_date: first, planned_date: today, status: "done", visit: "v1", latest_visit_status: "completed", is_overdue: false, manually_edited: true },
  ];
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

  // The caller's own sessions, and the two ways of ending one. Exactly one row
  // carries `is_current`, as the contract promises — the profile tab decides
  // which row gets no "end this" control from that flag alone, so a mock that
  // set it on none of them or on all of them would render a screen the server
  // can never produce.
  if (method === "DELETE" && /^\/api\/v1\/auth\/sessions\/[^/]+$/.test(path)) return {};
  if (method === "POST" && path === "/api/v1/auth/sessions/revoke-others") return {};
  if (path === "/api/v1/auth/sessions") return fixture("demo-auth-sessions");
  if (method === "POST" && path === "/api/v1/auth/password") {
    // The shape sign-in answers with, because that is what this endpoint
    // answers with: a client that does not adopt it signs itself out.
    const me = fixture("demo-users").find((one) => one.id === "u2");
    return {
      access: "smoke-access-token",
      user: { ...me, company_id: "co-1", company_name: fixture("demo-company").display_name },
    };
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

  // Notifications, the signed-in person's own. One of each shape the screens
  // have to handle: unread and read, a contract and an elevator, a contract
  // with no customer name, and a kind this client has never heard of — the
  // server may add kinds before the client ships their wording.
  const notifications = fixture("demo-notifications");
  if (path === "/api/v1/notifications/unread-count/") {
    return { count: notifications.filter((row) => row.read_at === null).length };
  }
  if (method === "POST" && path === "/api/v1/notifications/read-all/") {
    return { count: notifications.filter((row) => row.read_at === null).length };
  }
  const readOne = /^\/api\/v1\/notifications\/([^/]+)\/read\/$/.exec(path);
  if (method === "POST" && readOne) {
    const row = notifications.find((one) => one.id === readOne[1]);
    return row ? { ...row, read_at: row.read_at ?? "2026-10-20T08:00:00Z" } : null;
  }
  if (path === "/api/v1/notifications/preferences/") {
    if (method === "PUT") return body;
    return [
      { kind: "contract_renewal_due", email: true },
      { kind: "contract_expired", email: true },
      { kind: "contract_auto_renewed", email: true },
      { kind: "contract_auto_renewal_blocked", email: true },
      { kind: "maintenance_overdue", email: false },
      { kind: "visit_assigned", email: true },
      { kind: "fault_reported", email: true },
      { kind: "fault_emergency", email: true, locked: true },
      { kind: "fault_assigned", email: true },
      { kind: "fault_resolved", email: true },
    ].map((row) => ({ locked: false, ...row }));
  }
  if (path === "/api/v1/notifications/") {
    // Narrowed the way the server narrows it: `true` is unread, `false` read.
    const unread = search.get("unread");
    let rows = notifications;
    if (unread === "true") rows = rows.filter((row) => row.read_at === null);
    if (unread === "false") rows = rows.filter((row) => row.read_at !== null);
    const size = Number(search.get("page_size")) || rows.length;
    return page(rows.slice(0, size));
  }

  // The maintenance plan, built for whatever month the run happens in: the
  // screens default to the current period and to "today", so a fixture with
  // fixed dates would be a plan for a month nobody is looking at. One row of
  // each kind the screens draw differently — due today, tried and turned away,
  // unassigned, done.
  if (path.startsWith("/api/v1/planned-visits/")) {
    const rows = plannedVisits();
    const summaryOrList = path === "/api/v1/planned-visits/summary/" || path === "/api/v1/planned-visits/";
    if (method === "POST" && path === "/api/v1/planned-visits/bulk-assign/") {
      return { count: (body?.ids ?? []).length };
    }
    // A technician's day as the server orders it: the "due that day" rule, no
    // cancelled rows, every stop placed but the last, so the screens draw both
    // the ordered stops and the "position unknown" group. Before the detail
    // pattern below, which would read "route" as a row id.
    if (path === "/api/v1/planned-visits/route/") {
      const day = search.get("date");
      const who = search.get("technician") === "me" ? "u3" : search.get("technician");
      const due = rows.filter(
        (row) =>
          row.technician === who &&
          row.status !== "cancelled" &&
          (row.planned_date ? row.planned_date === day : row.status === "planned" && row.due_date <= day),
      );
      const stops = due.map((row, index) => {
        const placed = index < due.length - 1;
        return {
          ...row,
          latitude: placed ? (39.9 + index * 0.004).toFixed(6) : null,
          longitude: placed ? (41.26 + index * 0.003).toFixed(6) : null,
          leg_km: placed ? (index === 0 ? 1.2 : 0.5) : null,
        };
      });
      const unplaced = stops.filter((stop) => stop.latitude === null).map((stop) => stop.id);
      return { date: day, technician: who, total_km: stops.length > 1 ? 3.2 : 0, stops, unplaced };
    }
    const one = /^\/api\/v1\/planned-visits\/([^/]+)\/$/.exec(path);
    if (one && !summaryOrList) {
      const row = rows.find((candidate) => candidate.id === one[1]);
      if (!row) return null;
      return method === "PATCH" ? { technician: row.technician, planned_date: row.planned_date, ...body } : row;
    }
    // Narrowed the way the server narrows it. `me` is the fixture's one
    // technician: the stub has no session to resolve it against.
    let narrowed = rows.filter((row) => row.period === search.get("period"));
    const technician = search.get("technician");
    if (technician) narrowed = narrowed.filter((row) => row.technician === (technician === "me" ? "u3" : technician));
    if (search.get("unassigned") === "true") narrowed = narrowed.filter((row) => row.technician === null);
    for (const param of ["status", "elevator"]) {
      const value = search.get(param);
      if (value) narrowed = narrowed.filter((row) => row[param] === value);
    }
    const district = search.get("district");
    if (district) narrowed = narrowed.filter((row) => String(row.district) === district);
    const dueBefore = search.get("due_before");
    if (dueBefore) narrowed = narrowed.filter((row) => row.due_date <= dueBefore);

    if (path === "/api/v1/planned-visits/summary/") {
      const count = (list, status) => list.filter((row) => row.status === status).length;
      const overdue = (list) => list.filter((row) => row.is_overdue).length;
      const assigned = narrowed.filter((row) => row.technician);
      const technicians = [...new Set(assigned.map((row) => row.technician))].map((id) => {
        const mine = assigned.filter((row) => row.technician === id);
        return {
          technician: id,
          technician_name: mine[0].technician_name,
          planned: count(mine, "planned"),
          done: count(mine, "done"),
          cancelled: count(mine, "cancelled"),
          overdue: overdue(mine),
        };
      });
      return {
        period: search.get("period"),
        total: narrowed.length,
        by_status: {
          planned: count(narrowed, "planned"),
          done: count(narrowed, "done"),
          cancelled: count(narrowed, "cancelled"),
        },
        unassigned: narrowed.filter((row) => row.status === "planned" && !row.technician).length,
        overdue: overdue(narrowed),
        technicians,
      };
    }
    if (path === "/api/v1/planned-visits/") {
      const size = Number(search.get("page_size")) || narrowed.length;
      return page(narrowed.slice(0, size));
    }
  }

  // A resident's report from the sticker. Only the demo token is a lift; any
  // other answers 404, as the server does for a sticker it does not know.
  const publicReport = /^\/api\/v1\/public\/elevators\/([^/]+)\/faults\/$/.exec(path);
  if (method === "POST" && publicReport) {
    return publicReport[1] === "qr-demo-token" ? { reference: "K7M2QX" } : null;
  }

  // Faults. Filtered the way the server filters them, one status at a time —
  // the board asks once per active status and would show closed ones under
  // "open" if this ignored the parameter.
  if (path.startsWith("/api/v1/faults/")) {
    const faults = fixture("demo-faults");
    const action = /^\/api\/v1\/faults\/([^/]+)\/(assign|arrive|resolve|close|cancel)\/$/.exec(path);
    if (method === "POST" && action) {
      const row = faults.find((one) => one.id === action[1]);
      if (!row) return null;
      const now = "2026-10-20T09:00:00Z";
      const next = {
        assign: { status: "assigned", assigned_at: now, technician: body?.technician },
        arrive: { status: "on_site", on_site_at: now },
        resolve: { status: "resolved", resolved_at: now, ...body },
        close: { status: "closed", closed_at: now },
        cancel: { status: "cancelled", cancelled_at: now, cancel_reason: body?.reason ?? "" },
      }[action[2]];
      return { ...row, ...next };
    }
    const one = /^\/api\/v1\/faults\/([^/]+)\/$/.exec(path);
    if (one) {
      const row = faults.find((candidate) => candidate.id === one[1]);
      if (!row) return null;
      return method === "PATCH"
        ? { ...row, ...body, billable_overridden: row.billable_overridden || "billable" in (body ?? {}) }
        : row;
    }
    if (method === "POST" && path === "/api/v1/faults/") {
      return { ...faults[0], ...body, id: "f-new", reference: "N3W0NE", status: body?.technician ? "assigned" : "open" };
    }
    if (path === "/api/v1/faults/") {
      let rows = faults;
      for (const param of ["status", "technician", "priority", "elevator", "customer"]) {
        const value = search.get(param);
        if (value) rows = rows.filter((row) => row[param] === value);
      }
      return page(rows);
    }
  }

  // Inspections. One lift's history — a yellow label with one defect still
  // open and one fixed through a fault — and a due list with a correction
  // deadline already passed (the sealing risk) and an inspection coming up.
  if (path.startsWith("/api/v1/inspections/") || path.startsWith("/api/v1/nonconformities/")) {
    const inspections = fixture("demo-inspections");
    if (path === "/api/v1/inspections/due/") {
      return [
        {
          type: "correction", date: "2026-07-12", days_left: -3, elevator: "e1", elevator_name: "Sol asansör",
          building_name: "A Blok", customer_name: "Dadaş Konakları Site Yönetimi", label: "yellow",
          inspection: "i1", open_nonconformities: 1, sealed_if_missed: true,
        },
        {
          type: "inspection", date: "2026-11-10", days_left: 20, elevator: "e2", elevator_name: "Sağ asansör",
          building_name: "A Blok", customer_name: "Dadaş Konakları Site Yönetimi", label: "blue",
          inspection: null, open_nonconformities: 0, sealed_if_missed: false,
        },
      ];
    }
    const openFault = /^\/api\/v1\/nonconformities\/([^/]+)\/open-fault\/$/.exec(path);
    if (method === "POST" && openFault) {
      const item = inspections.flatMap((one) => one.nonconformities).find((one) => one.id === openFault[1]);
      return item ? { ...item, fault: item.fault ?? "f1" } : null;
    }
    const defect = /^\/api\/v1\/nonconformities\/([^/]+)\/$/.exec(path);
    if (defect) {
      const item = inspections.flatMap((one) => one.nonconformities).find((one) => one.id === defect[1]);
      return item ? { ...item, ...(method === "PATCH" ? body : {}) } : null;
    }
    if (method === "POST" && path === "/api/v1/inspections/") {
      return { ...inspections[0], ...body, id: "i-new", nonconformities: [], report: null };
    }
    const one = /^\/api\/v1\/inspections\/([^/]+)\/$/.exec(path);
    if (one) {
      const row = inspections.find((candidate) => candidate.id === one[1]);
      return row ? { ...row, ...(method === "PATCH" ? body : {}) } : null;
    }
    if (path === "/api/v1/inspections/") {
      let rows = inspections;
      for (const param of ["elevator", "kind", "label"]) {
        const value = search.get(param);
        if (value) rows = rows.filter((row) => row[param] === value);
      }
      return page(rows);
    }
  }

  // The customer portal (M6), as one building manager sees it: two lifts,
  // one with a fault being worked on; a visit with a photo and one item that
  // needs attention; an inspection with its report. The refresh answers 404,
  // like the staff one does for a visitor with no session — the render check
  // signs in to the portal through an override, never through this.
  if (path.startsWith("/api/v1/portal/")) {
    if (path === "/api/v1/portal/auth/refresh") return null;
    if (path === "/api/v1/portal/me") return fixture("demo-portal-me");
    const lifts = [
      {
        id: "e1", name: "Sol asansör", building: "b1", building_name: "A Blok", status: "active",
        last_maintenance_date: "2026-10-14", next_maintenance_date: "2026-11-13",
        inspection_label: "yellow", next_inspection_date: "2027-03-14",
      },
      {
        id: "e2", name: "Sağ asansör", building: "b1", building_name: "A Blok", status: "out_of_service",
        last_maintenance_date: "2026-09-15", next_maintenance_date: "2026-10-15",
        inspection_label: "green", next_inspection_date: "2027-03-14",
      },
    ];
    const lift = /^\/api\/v1\/portal\/elevators\/([^/]+)\/$/.exec(path);
    if (lift) return lifts.find((one) => one.id === lift[1]) ?? null;
    if (path === "/api/v1/portal/elevators/") return page(lifts);
    if (path === "/api/v1/portal/visits/") {
      return page([
        {
          id: "v1", elevator: "e1", elevator_name: "Sol asansör", visit_date: "2026-10-14", status: "completed",
          technician_first_name: "Hakan", parts_replaced: "Kabin aydınlatma armatürü (1 adet)",
          items: [
            { item: "brake_system", result: "ok" },
            { item: "hoisting_ropes", result: "attention_needed" },
          ],
          photos: [{ id: "att-photo", original_filename: "kabin.jpg", mime_type: "image/jpeg", category: "photo" }],
          signature_state: "signed", signer_name: "Ayşe Kaya", signer_role: "manager",
          signed_at: "2026-10-14T11:20:00+03:00", amended_after_signature: false,
          signature: { id: "att-signature", original_filename: "imza.png", mime_type: "image/png", category: "signature" },
        },
      ]);
    }
    if (path === "/api/v1/portal/inspections/") {
      return page([
        {
          id: "i1", elevator: "e1", elevator_name: "Sol asansör", kind: "periodic", inspected_on: "2026-03-14",
          inspection_body: "TÜV Austria Türk", report_number: "PK-2026-18442", label: "yellow",
          next_inspection_due: "2027-03-14", report: "att-report",
          nonconformities: [
            { id: "nc1", description: "Kuyu dibi aydınlatması yetersiz", severity: "yellow", status: "open", fixed_on: null },
          ],
        },
      ]);
    }
    const portalFaults = [
      {
        id: "pf1", reference: "K7M2QX", elevator: "e1", elevator_name: "Sol asansör", building_name: "A Blok",
        channel: "customer_portal", status: "assigned", priority: "high", description: "Kapı tam kapanmıyor.",
        reported_at: "2026-10-20T07:50:00Z", assigned_at: "2026-10-20T08:00:00Z", on_site_at: null,
        resolved_at: null, closed_at: null, cancelled_at: null, technician_first_name: "Hakan",
        resolution_notes: "", reported_by_me: true,
      },
      {
        id: "pf2", reference: "Z9Q1AA", elevator: "e2", elevator_name: "Sağ asansör", building_name: "A Blok",
        channel: "staff", status: "closed", priority: "normal", description: "Gürültü.",
        reported_at: "2026-10-10T09:00:00Z", assigned_at: null, on_site_at: null, resolved_at: "2026-10-10T10:30:00Z",
        closed_at: "2026-10-11T08:00:00Z", cancelled_at: null, technician_first_name: "Hakan",
        resolution_notes: "Kılavuz raylar yağlandı.", reported_by_me: false,
      },
    ];
    if (method === "POST" && path === "/api/v1/portal/faults/") {
      return { ...portalFaults[0], ...body, id: "pf-new", reference: "N3W0NE", status: "open" };
    }
    if (path === "/api/v1/portal/faults/") return page(portalFaults);
    // The signed-in contact's own customer's reports, without the office's
    // delivery state, recipients or errors — the portal's shape.
    if (path === "/api/v1/portal/reports/") {
      return page(
        fixture("demo-customer-reports")
          .filter((report) => report.customer === "c1")
          .map(({ id, period, file, generated_at, summary }) => ({ id, period, file, generated_at, summary })),
      );
    }
    const file = /^\/api\/v1\/portal\/files\/([^/]+)\/download-url\/$/.exec(path);
    if (file) return { download_url: `https://files.example/${file[1]}`, expires_in: 300 };
    return null;
  }

  // The office's side of the portal: the first contact has an active account,
  // the rest none — so the card shows both a deactivate and an invite.
  const portalAccounts = /^\/api\/v1\/customers\/([^/]+)\/portal-accounts\/$/.exec(path);
  if (portalAccounts) {
    const contacts = fixture("demo-customers").find((one) => one.id === portalAccounts[1])?.contacts ?? [];
    return page(
      contacts.slice(0, 1).map((contact) => ({
        id: "pa1", email: contact.email, customer: portalAccounts[1], contact: contact.id,
        contact_name: contact.full_name, status: "active", invited_at: "2026-10-01T09:00:00Z",
        accepted_at: "2026-10-02T09:00:00Z", deactivated_at: null, last_login_at: "2026-10-20T18:00:00Z",
      })),
    );
  }
  const portalInvite = /^\/api\/v1\/customers\/([^/]+)\/portal-invitations\/$/.exec(path);
  if (method === "POST" && portalInvite) {
    return {
      id: "pa-new", email: "", customer: portalInvite[1], contact: body?.contact, contact_name: "",
      status: "invited", invited_at: "2026-10-21T09:00:00Z", accepted_at: null, deactivated_at: null, last_login_at: null,
    };
  }
  const portalOff = /^\/api\/v1\/portal-accounts\/([^/]+)\/deactivate\/$/.exec(path);
  if (method === "POST" && portalOff) return { id: portalOff[1], status: "inactive" };

  // Monthly customer reports: September for three customers — one sent, one
  // with nobody ticked, one whose mail failed — and August's, made while the
  // firm's switch was off. The preview answers with bytes, as the server does.
  if (path.startsWith("/api/v1/customer-reports/")) {
    const reports = fixture("demo-customer-reports");
    if (method === "POST" && path === "/api/v1/customer-reports/preview/") {
      return { __raw: "%PDF-1.4\n", type: "application/pdf" };
    }
    const sent = /^\/api\/v1\/customer-reports\/([^/]+)\/send\/$/.exec(path);
    if (method === "POST" && sent) {
      const report = reports.find((one) => one.id === sent[1]);
      return report ? { ...report, delivery: "sent", sent_at: "2026-10-23T09:00:00Z", recipients: ["aysedemir@example.com"], error: "" } : null;
    }
    const link = /^\/api\/v1\/customer-reports\/([^/]+)\/download-url\/$/.exec(path);
    if (link) return { download_url: `https://files.example/${link[1]}.pdf`, expires_in: 300 };
    const one = /^\/api\/v1\/customer-reports\/([^/]+)\/$/.exec(path);
    if (one) return reports.find((report) => report.id === one[1]) ?? null;
    if (path === "/api/v1/customer-reports/") {
      let rows = reports;
      for (const param of ["customer", "period", "delivery"]) {
        const value = search.get(param);
        if (value) rows = rows.filter((row) => row[param] === value);
      }
      return page(rows);
    }
  }

  // Invoice drafts: one waiting for a price on a fault line, one issued, one
  // paid. The CSV and the PDF answer with bytes, as the server does.
  if (path.startsWith("/api/v1/invoice-drafts/") || path.startsWith("/api/v1/invoice-lines/")) {
    const drafts = fixture("demo-invoice-drafts");
    if (path === "/api/v1/invoice-drafts/export.csv/") return { __raw: "kunde;toplam\n", type: "text/csv" };
    const pdf = /^\/api\/v1\/invoice-drafts\/([^/]+)\/pdf\/$/.exec(path);
    if (pdf) return { __raw: "%PDF-1.4\n", type: "application/pdf" };
    const action = /^\/api\/v1\/invoice-drafts\/([^/]+)\/(issue|mark-paid|cancel|lines)\/$/.exec(path);
    if (method === "POST" && action) {
      const draft = drafts.find((one) => one.id === action[1]);
      if (!draft) return null;
      if (action[2] === "lines") return { id: "l-new", draft: draft.id, kind: "manual", elevator: null, fault: null, needs_price: false, position: 9, amount: body?.unit_price ?? "0.00", ...body };
      const next = { issue: { status: "issued", ...body }, "mark-paid": { status: "paid", ...body }, cancel: { status: "cancelled", cancel_reason: body?.reason ?? "" } }[action[2]];
      return { ...draft, ...next };
    }
    const lineRoute = /^\/api\/v1\/invoice-lines\/([^/]+)\/$/.exec(path);
    if (lineRoute) {
      if (method === "DELETE") return {};
      const found = drafts.flatMap((one) => one.lines).find((one) => one.id === lineRoute[1]);
      return found ? { ...found, ...body, needs_price: false } : null;
    }
    const one = /^\/api\/v1\/invoice-drafts\/([^/]+)\/$/.exec(path);
    if (one) {
      const draft = drafts.find((candidate) => candidate.id === one[1]);
      return draft ? { ...draft, ...(method === "PATCH" ? body : {}) } : null;
    }
    if (path === "/api/v1/invoice-drafts/") {
      let rows = drafts;
      for (const param of ["status", "customer", "contract"]) {
        const value = search.get(param);
        if (value) rows = rows.filter((row) => row[param] === value);
      }
      if (search.get("needs_price") === "true") rows = rows.filter((row) => row.needs_price);
      const period = search.get("period");
      if (period) rows = rows.filter((row) => row.period_start.slice(0, 7) <= period && row.period_end.slice(0, 7) >= period);
      return page(rows);
    }
  }

  if (path === "/api/v1/audit-logs/") return page(fixture("demo-audit-logs-elevator"));

  // Maintenance visits. The create answers with the read shape — the view
  // serializes the new row with its read serializer, whatever the contract
  // says about the 201 — because the form needs the new id to attach photos
  // to and to navigate to.
  const visits = fixture("demo-maintenance-visits");
  if (method === "POST" && path === "/api/v1/maintenance-visits/") {
    return { ...visits[0], ...body, id: "v-new", items: body?.items ?? [] };
  }
  // Before the detail route, whose pattern would otherwise read "technicians"
  // as a visit id.
  if (path === "/api/v1/maintenance-visits/technicians/") {
    return fixture("demo-users")
      .filter((one) => one.role === "technician" && one.is_active)
      .map((one) => ({ id: one.id, name: one.full_name }));
  }
  const visit = /^\/api\/v1\/maintenance-visits\/([^/]+)\/$/.exec(path);
  if (visit && method === "GET") {
    return visits.find((row) => row.id === visit[1]) ?? null;
  }
  if (path === "/api/v1/maintenance-visits/") {
    // Narrowed the way the server narrows it. The elevator page asks for one
    // lift's visits, and for its latest completed one; a mock that ignored
    // either would show the history of every lift in the firm under this one.
    let rows = visits;
    for (const param of ["elevator", "status", "technician"]) {
      const value = search.get(param);
      if (value) rows = rows.filter((row) => row[param] === value);
    }
    // Inclusive at both ends, as the server's filter is. ISO days compare
    // correctly as strings, which is the point of the format.
    const after = search.get("visit_date_after");
    const before = search.get("visit_date_before");
    if (after) rows = rows.filter((row) => row.visit_date >= after);
    if (before) rows = rows.filter((row) => row.visit_date <= before);
    return page(rows);
  }

  // The address typeahead, answering with the town the rest of these fixtures
  // are in. The ids are the real ones from the address dataset — 25 is
  // Erzurum's plate code and therefore its primary key — so what a form picks
  // here is a row the server would also have.
  if (path === "/api/v1/provinces/") {
    return [
      { id: 25, name: "Erzurum", legal_name: "Erzurum", display_name: "Erzurum" },
      { id: 34, name: "İstanbul", legal_name: "İstanbul", display_name: "İstanbul" },
    ];
  }
  if (path === "/api/v1/districts/") {
    const province = Number(search.get("province"));
    // Mirrors the server: no province, no answer. A mock that returned the
    // whole list would let the client skip a step the API refuses to skip.
    if (!province) return [];
    return [{ id: 2045, province_id: province, name: "Yakutiye" }];
  }
  if (path === "/api/v1/neighborhoods/") {
    const district = Number(search.get("district"));
    const term = (search.get("search") ?? "").trim();
    if (!district || term.length < 2) return [];
    return [
      {
        id: 21659,
        district_id: district,
        district_name: "Yakutiye",
        province_name: "Erzurum",
        name: "Muratpaşa",
        postal_code: "25100",
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

  // Taking an elevator off a contract, and putting one on. Matched before the
  // contract's own detail route, which would otherwise swallow both.
  //
  // The DELETE answers 204 with no body, the way the contract declares it — and
  // note what it is not: the line is closed on the server by filling in
  // `removed_at`, not removed from the record. A mock that returned a contract
  // with one fewer line would be modelling a delete that does not happen.
  const closedLine = /^\/api\/v1\/contracts\/([^/]+)\/elevators\/([^/]+)\/$/.exec(path);
  if (method === "DELETE" && closedLine) return {};

  const addedLines = /^\/api\/v1\/contracts\/([^/]+)\/elevators\/$/.exec(path);
  if (method === "POST" && addedLines) {
    return { ...fixture("demo-contract"), id: addedLines[1] };
  }

  /* The three VAT states, because they render differently and only one of them
     used to exist here. `unset` is the one that matters most: `vat_amount` and
     `monthly_total` are null, so a screen that renders them with formatMoney
     alone shows two blanks and looks like it failed to load. Serving a contract
     that is deliberately zero-rated next to it is what keeps the smoke render
     honest about the two not looking the same. */
  const VAT_FIXTURES = {
    "k-novat": "demo-contract-vat-unset",
    "k-zerovat": "demo-contract-vat-zero",
  };

  const contract = /^\/api\/v1\/contracts\/([^/]+)\/$/.exec(path);
  if (contract && method === "GET") {
    const named = VAT_FIXTURES[contract[1]];
    if (named) return fixture(named);
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
    // A file rather than a record: the CSV export and the PDF.
    if (body && typeof body === "object" && "__raw" in body) {
      return new Response(body.__raw, { status: 200, headers: { "Content-Type": body.type } });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}
