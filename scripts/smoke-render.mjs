#!/usr/bin/env node
/**
 * Renders every route of the real router, for every role, and fails on any
 * error thrown during render.
 *
 * The role is passed into the router, which hands the shell a session without
 * calling the server. That matters: sidebars, table columns and whole sections
 * are hidden per role, so rendering one role four times — which is what this
 * did before the role was threaded through — tested a quarter of what it
 * claimed to.
 *
 * The build only proves the code type-checks and bundles. This proves the app
 * actually renders and that every route in the tree resolves — including the
 * ones you can only get to by clicking a link, which is exactly where dead
 * screens hide.
 *
 * Browser globals the app touches are stubbed; that is the only concession to
 * running outside a browser.
 */
import { createServer } from "vite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { installMockApi, requested } from "./mock-api.mjs";
import { renderToString } from "react-dom/server";
import React from "react";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.document = {
  documentElement: { classList: { toggle() {} } },
  getElementById: () => null,
};
globalThis.window = globalThis;
globalThis.scrollTo = () => {};

// Route loaders warm the query cache before the render, so screens see real
// content instead of a page of skeletons — and they see it through the real
// request path rather than a direct fixture import.
installMockApi();

const PATHS = [
  "/login",
  "/register",
  "/password-reset",
  "/password-reset/some-token",
  // The three the e-mails point at. Before these existed an invitation arrived,
  // the person clicked, and the product answered with a 404.
  "/verify-email/some-token",
  "/invitation/some-token",
  "/styleguide",
  "/elevators",
  "/elevators/e1",
  "/elevators/new",
  "/elevators/e1/edit",
  "/elevators/e1/visits/new",
  "/maintenance-visits",
  "/maintenance-visits?elevator=e1",
  "/maintenance-visits?visit_date_after=2026-10-01&visit_date_before=2026-10-31",
  "/maintenance-visits/v1",
  "/maintenance-visits/v2",
  "/customers",
  "/customers/new",
  "/customers/c1",
  "/customers/c1/edit",
  "/customers/c1/contacts/new",
  "/customers/c1/contacts/c1-contact-1",
  "/customers/c6/edit",
  "/complexes",
  "/complexes/new",
  "/complexes/s1",
  "/complexes/s1/edit",
  "/complexes/s4",
  "/buildings",
  "/buildings/new",
  "/buildings/b1/edit",
  "/contracts",
  "/contracts/new",
  "/contracts/k1",
  "/contracts/k1/edit",
  // A contract nobody stated a VAT rate on, and one deliberately at 0%. The
  // server sends null totals for the first and real ones for the second, and
  // the two must not arrive on screen looking alike — see the assertions.
  "/contracts/k-novat",
  "/contracts/k-novat/edit",
  "/contracts/k-zerovat",
  "/qr-labels",
  "/scan",
  // Both halves of the scanned-label route, because they are different screens
  // and only one of them is the happy one. Under Node there is no decoder and
  // no camera, so `/scan` renders the branch a phone without either would get —
  // which is the branch worth asserting: it must still offer a way through.
  "/q/qr-demo-token",
  "/q/qr-unknown-token",
  "/users",
  "/users/invite",
  // Three colleagues on purpose. Each one puts a different set of controls on
  // the page: u1 is the last active owner, u2 is whoever is signed in, and u3
  // is a technician, whose assignment panel is the page every other role does
  // not get. Rendering one of them would leave two branches untested.
  "/users/u1",
  "/users/u2",
  "/users/u3",
  "/audit-logs",
  "/outbox",
  "/notifications",
  // Spelled the way the app writes it: the router JSON-quotes a string that
  // would otherwise parse as a boolean. A bare `?unread=true` typed by hand is
  // read too, and the router rewrites the address to this form.
  "/notifications?unread=%22true%22",
  "/plan",
  "/plan?unassigned=%22true%22",
  "/plan/calendar",
  "/plan/calendar?view=%22month%22",
  "/today",
  "/week",
  "/faults",
  "/faults?status=%22closed%22",
  "/faults/f1",
  "/faults/f2",
  "/faults/f4",
  "/my-faults",
  "/elevators/e1/faults/new",
  "/inspections",
  "/inspections?days=%2230%22",
  "/elevators/e1/inspections/new",
  "/billing",
  "/billing?needs_price=%22true%22",
  "/billing/d1",
  "/billing/d2",
  "/settings",
  // Its own route rather than a tab behind a click, which is what makes it
  // renderable here at all: the password form and the session list are the two
  // controls on this screen that can sign somebody out if they are wrong.
  "/settings/profile",
];

const ROLES = ["owner", "operations", "technician", "accountant"];

/**
 * Text that must appear on a route that fetches its data.
 *
 * "It rendered something" is too weak once screens are query-driven: a page of
 * loading skeletons clears the length check comfortably. These assert that the
 * loader filled the cache and the screen read from it, which is the whole point
 * of prefetching in the route.
 *
 * Add an entry as each screen moves off fixtures.
 */
/**
 * Text that must appear even though the tab holding it is not the one showing.
 *
 * The elevator form keeps every panel mounted and hides the inactive ones,
 * because unmounting an uncontrolled input throws away what was typed in it.
 * That is invisible from the outside — the page looks identical either way —
 * so it is asserted rather than trusted.
 */
const EXPECT_HIDDEN = {
  // Schindler is on the manufacturing tab; the form opens on identity.
  "/elevators/e1/edit": "Schindler",
};

const EXPECT = {
  // Every role has notifications of its own. The list renders each kind's
  // sentence, including a contract with no customer name, and a kind this
  // client does not know falls back to a plain notice rather than a blank row.
  "/notifications": [
    "Sol asansör (A Blok) asansörünün bakımı 13.10.2026 tarihinde yapılmalıydı.",
    "Dadaş Konakları Site Yönetimi ile yapılan 2026-0043 numaralı sözleşmenin süresi 31.01.2027 tarihinde doluyor.",
    "2025-0112 numaralı sözleşmenin süresi 18.10.2026 tarihinde doldu",
    "Yeni bildirim",
    "Tümünü okundu say",
    // The bell is in the top bar of every signed-in page.
    "Bildirimler",
  ],
  "/notifications?unread=%22true%22": ["Sol asansör asansörünün bakımı gecikti", "Yeni"],

  // There is no IndexedDB under Node, so the outbox is empty for every role —
  // which is the state that has to render without one, as on a phone in
  // private mode.
  "/outbox": "Gönderilmeyi bekleyen kayıt yok",
  "/customers": "Dadaş",
  "/customers/c1": "Dadaş",
  // The edit form must arrive with the record already in its inputs; an empty
  // form here would mean the loader or the defaultValue wiring is broken.
  "/customers/c1/edit": "Dadaş",
  // The contact form is reached through the customer, so it has to name the
  // customer; and the edit form has to arrive with the contact in its inputs.
  "/customers/c1/contacts/new": "Dadaş",
  "/customers/c1/contacts/c1-contact-1": "Ayşe Demir",
  // An individual customer, so the half of the form only they see is actually
  // rendered rather than only type-checked. The label is the tell: a TC field
  // where an organisation would show a tax office.
  "/customers/c6/edit": "TC kimlik no",
  // The invitation must name who is inviting; a link asking for a password
  // without saying who sent it is indistinguishable from phishing.
  "/invitation/some-token": "Yükseliş",
  // Node has no BarcodeDetector and no camera, so this renders exactly what a
  // phone without either would get. Both halves are asserted: the screen must
  // say why there is no camera *and* still put a way through on the page. A
  // scanner that renders only an apology is the dead end this replaced.
  "/scan": ["Bu telefon QR okuyamıyor", "Kimlik numarasıyla bul"],
  // A resolved label names the lift before the thirty-one-field record lands.
  // Asserting the number as well as the name catches the narrowed `by-qr`
  // response being read as though it were the full one.
  "/q/qr-demo-token": ["Sol asansör", "25-2019-004512"],
  // The half that matters. Every token but one is a 404 from the mock, which is
  // what the server answers for an unknown label and for another firm's alike —
  // and the screen has to turn that into something a person can act on rather
  // than into a raw error.
  "/q/qr-unknown-token": ["Bu QR bir asansöre çözümlenmedi", "Kimlik numarasıyla bul"],
  "/buildings": "Blok",
  "/complexes": "Dadaş Konakları",
  // The blocks inside the estate, not the estate's own name: this asserts the
  // related list came back from the server's `complex` filter rather than the
  // card falling through to its empty state.
  "/complexes/s1": "Blok",
  "/complexes/s1/edit": "Dadaş Konakları",
  // An empty complex, which is the only kind that may be deleted. s1 has
  // blocks in it and renders the refusal instead, so without this the
  // button is never rendered by anything.
  "/complexes/s4": "Sil",
  // A line closed in June is still part of this contract, and the count says so
  // whether or not the closed rows are expanded. Asserted for every role,
  // because the two tables on this screen — the technical register and the
  // billing ledger — are different components and each states it separately.
  "/contracts/k1": "1 kapatılmış satır",
  // The null totals have to arrive as a sentence, not as an empty cell. Both
  // halves are asserted: the reason in place of each amount, and the heading of
  // the notice that says what to do about it. Asserted for every role, because
  // the alert's body differs by whether the reader may edit the contract while
  // the fact it reports does not.
  "/contracts/k-novat": ["Hesaplanamıyor (KDV oranı girilmemiş)", "Aylık toplam hesaplanamıyor"],
  // The edit form must describe the record in front of the user rather than
  // repeat the old permanent warning, which said the same thing on every
  // contract whether or not it had a rate.
  "/contracts/k-novat/edit": "Bir oran girip kaydedin",
  // And the other half of the distinction: a contract settled at 0% shows its
  // rate and its totals like any other, marked as a decision rather than a gap.
  // If this ever renders the "unstated" sentence the two states have collapsed
  // into one, which is the failure the server added `vat_status` to prevent.
  "/contracts/k-zerovat": ["KDV uygulanmıyor", "1.800,00"],
  // The edit form must arrive with the record in its inputs, on the tab that
  // is showing and on the ones that are not.
  "/elevators/e1/edit": "25-2019",
  "/elevators": "25-2018",
  "/elevators/e1": "25-2019",
  // Two independent sections on one screen: the colleagues table, and the
  // pending invitations underneath it.
  "/users": ["Hakan Çelik", "nur.aydin@yukselisasansor.com", "Süresi doldu"],
  // The reason takes the place of the control it replaces, so asserting the
  // sentence is asserting that the screen explained itself rather than simply
  // rendering nothing where a button used to be.
  "/users/u1": ["Mehmet Yılmaz", "Firmanın tek aktif sahibi pasifleştirilemez."],
  "/users/u2": ["Ayşe Demir", "Kendinizi pasifleştiremezsiniz."],
  // The assignment panel is the reason a technician has a page at all, and a
  // customer name proves it rendered its list rather than a loading line.
  "/users/u3": ["Hakan Çelik", "Dadaş", "Atanmış müşteriler", "Pasifleştir"],
  // The company record has to arrive in the inputs, and for every role: the
  // four differ only in whether the fields can be written. A screen that filled
  // the form for the owner and left it empty for everybody else would pass a
  // check that only looked at one of them.
  "/settings": ["Yükseliş Asansör Bakım ve Servis Ltd. Şti.", "Cumhuriyet Caddesi"],
  // Three independent things on the profile tab, so three assertions. The
  // password form has to be a form and not the sentence it replaced; the
  // session list has to have read the three rows the mock serves — the device
  // label is the tell, because it is derived from the user-agent header rather
  // than copied out of the response; and exactly one row has to be marked as
  // this one.
  "/settings/profile": [
    "Mevcut şifreniz",
    "Chrome · macOS",
    "Safari · iOS",
    "Edge · Windows",
    "Bu cihaz",
    // The e-mail choices, one per kind, as the server stored them — and the
    // one the server will not let anybody turn off, said as such.
    "E-posta ile de gönder",
    "Bu bildirim her zaman e-postayla da gönderilir; kapatılamaz.",
    "Bakım gecikti",
  ],
};

/**
 * Text that must NOT appear.
 *
 * The user screens withhold the controls the server would refuse: nobody may
 * deactivate themselves, and nobody may deactivate the last active owner. A
 * render check cannot catch a regression that puts either button back — only
 * its absence can, and the absence is the whole safety property.
 */
const EXPECT_ABSENT = {
  // Read ones are not in the unread view — the filter reached the request.
  "/notifications?unread=%22true%22": ["2025-0112"],
  "/users/u1": "Pasifleştir",
  "/users/u2": "Pasifleştir",
  // A contract at 0% is settled, not unfinished. The moment this sentence
  // appears on it, the two VAT states have collapsed into one and a rate
  // somebody agreed reads as a rate somebody forgot.
  "/contracts/k-zerovat": "Hesaplanamıyor",
  // A session list says which devices someone carries and, through the address
  // it was last used from, roughly where they were when they did. The address
  // is on the record the screen already holds — the mock serves it, because the
  // contract does — and the screen must not print it. An absence is the only
  // way to check that, and it is the whole of what was decided here.
  "/settings/profile": ["88.230.14.7", "185.66.120.44", "AppleWebKit"],
};

/**
 * Text that must, or must not, appear for one role in particular.
 *
 * The maintenance visit screens are the first whose content differs by role
 * rather than merely narrowing: the accountant gets a statement that the
 * screen is not theirs, a technician records a visit in their own name, and
 * the office roles name a technician — or, for operations, are told they
 * cannot list one. Asserting one string for every role would prove only the
 * part they share.
 *
 * `all` applies to every role, `add` adds to it for one, and `replace` stands
 * in for it entirely — the accountant's page shares nothing with the others.
 */
const VISITS_RESTRICTED = "Bakım kayıtları rolünüzde görünmüyor";
const BILLING_RESTRICTED = "Faturalar rolünüzde görünmüyor";
const EXPECT_BY_ROLE = {
  // The money roles only: owner (and admin) and the accountant. Operations
  // runs the fleet and the technician the lifts; both get the restricted state.
  "/billing": {
    replace: {
      owner: ["Fiyat eksik", "Bu sayfadaki taslakların toplamı", "₺3.000,00", "YKS2026000123", "CSV olarak dışa aktar"],
      accountant: ["Fiyat eksik", "Bu sayfadaki taslakların toplamı", "₺3.000,00", "YKS2026000123", "CSV olarak dışa aktar"],
      operations: [BILLING_RESTRICTED],
      technician: [BILLING_RESTRICTED],
    },
  },
  "/billing?needs_price=%22true%22": {
    replace: {
      owner: ["Dadaş Konakları Site Yönetimi", "Yalnızca fiyatı eksik olanlar"],
      accountant: ["Dadaş Konakları Site Yönetimi", "Yalnızca fiyatı eksik olanlar"],
      operations: [BILLING_RESTRICTED],
      technician: [BILLING_RESTRICTED],
    },
  },
  // A draft: the unpriced line, the price box, the blocker said in words,
  // the totals and the actions a draft has.
  "/billing/d1": {
    replace: {
      owner: ["1 satırda fiyat eksik", "Kesildi olarak işaretle", "Satır ekle", "₺2.500,00", "KDV (%20)", "İptal et"],
      accountant: ["1 satırda fiyat eksik", "Kesildi olarak işaretle", "Satır ekle", "₺2.500,00", "KDV (%20)", "İptal et"],
      operations: [BILLING_RESTRICTED],
      technician: [BILLING_RESTRICTED],
    },
  },
  // Issued: read-only, with "paid" and "cancel" and nothing to edit.
  "/billing/d2": {
    replace: {
      owner: ["YKS2026000123", "Ödendi", "Eylül bakım bedeli."],
      accountant: ["YKS2026000123", "Ödendi", "Eylül bakım bedeli."],
      operations: [BILLING_RESTRICTED],
      technician: [BILLING_RESTRICTED],
    },
  },
  // The contract's own drafts, for the roles that see money.
  "/contracts/k1": { add: { owner: ["Fatura taslakları"], accountant: ["Fatura taslakları"] } },
  // The office's say over the customer portal: the contact with an account,
  // and the way to switch it off. Owner, admin and operations only.
  "/customers/c1": {
    add: { owner: ["Portal erişimi", "Etkin", "Erişimi kapat"], operations: ["Portal erişimi", "Etkin", "Erişimi kapat"] },
  },
  "/elevators/e1": {
    // The maintenance dates as the server sends them on the elevator.
    all: ["Bakım kaydı gir", "Bakım geçmişi", "14.10.2026", "13.11.2026", "Bu ayın planı", "Hakan Çelik", "Arıza bildir", "Muayene geçmişi", "PK-2026-18442", "Kuyu dibi aydınlatması yetersiz"],
    add: { owner: ["Muayene kaydı gir", "Arıza aç"], operations: ["Muayene kaydı gir", "Arıza aç"] },
    replace: { accountant: [] },
  },
  // What is due: the passed correction deadline named as a sealing risk, and
  // the inspection coming up. Technicians read it too.
  "/inspections": {
    all: ["Mühürlenme riski", "Sol asansör", "Sağ asansör", "Yaklaşan muayeneler", "1 açık uygunsuzluk"],
    replace: { accountant: ["Muayeneler rolünüzde görünmüyor"] },
  },
  "/inspections?days=%2230%22": {
    all: ["30 gün", "Mühürlenme riski"],
    replace: { accountant: ["Muayeneler rolünüzde görünmüyor"] },
  },
  "/elevators/e1/inspections/new": {
    all: ["Muayene türü", "Etiketi seçin", "Uygunsuzluk ekle", "Sonraki periyodik muayene"],
    replace: {
      technician: ["Muayene kaydını firma sahibi, yöneticiler ve operasyon ekibi girer."],
      accountant: ["Muayene kaydını firma sahibi, yöneticiler ve operasyon ekibi girer."],
    },
  },
  // The live board: the emergency first and named as one, the resident's
  // report marked, nobody sent yet said in words. Technicians read it too.
  "/faults": {
    all: ["K7M2QX", "Acil", "Kimse gönderilmedi", "P4N8TR", "M6C3LS"],
    replace: { accountant: ["Arızalar rolünüzde görünmüyor"] },
  },
  // History by status: the closed one, as a paged list.
  "/faults?status=%22closed%22": {
    all: ["Z9Q1AA"],
    replace: { accountant: ["Arızalar rolünüzde görünmüyor"] },
  },
  "/faults/f1": {
    all: ["Kabinde mahsur kalan var", "Ayşe Kaya", "Bildirildi", "Alarm çalıyor"],
    add: {
      owner: ["Teknisyen gönder", "İptal et"],
      operations: ["Teknisyen gönder", "İptal et"],
    },
    replace: { accountant: ["Arızalar rolünüzde görünmüyor"] },
  },
  // Assigned to the signed-in id: the technician gets "Vardım", and so does
  // the office, recording it on their behalf.
  "/faults/f2": {
    all: ["Vardım", "Teknisyen atandı"],
    replace: { accountant: ["Arızalar rolünüzde görünmüyor"] },
  },
  "/faults/f4": {
    all: ["elle değiştirildi", "Buton kontağı temizlendi."],
    add: { owner: ["Kapat"], operations: ["Kapat"] },
    replace: { accountant: ["Arızalar rolünüzde görünmüyor"] },
  },
  "/my-faults": {
    all: ["Arızalarım listesi teknisyenler içindir"],
    replace: {
      technician: ["Sağ asansör", "P4N8TR", "Arızalarım"],
      accountant: ["Arızalar rolünüzde görünmüyor"],
    },
  },
  "/elevators/e1/faults/new": {
    all: ["Kabinde mahsur kalan var", "Asansör durdu", "Arızayı kaydet"],
    add: { owner: ["Hemen gönderilecek teknisyen"], operations: ["Hemen gönderilecek teknisyen"] },
    replace: { accountant: ["Arızalar rolünüzde görünmüyor"] },
  },
  // The office's month: the summary, the rows in route order, an unassigned
  // row named as such, and a row somebody tried and was turned away from.
  "/plan": {
    all: ["Sol asansör", "Bu ay toplam", "Atanmamış", "Denendi: Erişim sağlanamadı", "Dönem"],
    replace: {
      technician: ["Bakım planı rolünüzde görünmüyor", "Bugünkü listenize gidin"],
      accountant: ["Bakım planı rolünüzde görünmüyor"],
    },
  },
  "/plan?unassigned=%22true%22": {
    all: ["Yük asansörü", "Yalnızca atanmamışlar"],
    replace: {
      technician: ["Bakım planı rolünüzde görünmüyor"],
      accountant: ["Bakım planı rolünüzde görünmüyor"],
    },
  },
  // The same rows by day: the week with its unassigned row and its tray, the
  // month with the way back to a week. Office only, like the list.
  "/plan/calendar": {
    all: ["Takvim", "Bu hafta", "Günü belirsiz", "Atanmamış", "Ay görünümü"],
    replace: {
      technician: ["Bakım planı rolünüzde görünmüyor"],
      accountant: ["Bakım planı rolünüzde görünmüyor"],
    },
  },
  "/plan/calendar?view=%22month%22": {
    all: ["Takvim", "Hafta görünümü"],
    replace: {
      technician: ["Bakım planı rolünüzde görünmüyor"],
      accountant: ["Bakım planı rolünüzde görünmüyor"],
    },
  },
  // A technician's day: their own rows due today, the done one kept and
  // marked. The office is pointed at the month; the accountant at nothing.
  "/today": {
    all: ["Bugün ve Bu hafta listeleri teknisyenler içindir"],
    replace: {
      // Today is the suggested route: the distance, a way to each placed stop,
      // and the stops it could not place under their own heading.
      technician: [
        "Sol asansör",
        "Sağ asansör",
        "Servis asansörü",
        "Yapıldı",
        "bakım kaldı",
        "Önerilen sıra",
        "Yol tarifi",
        "Konumu bilinmeyen",
      ],
      accountant: ["Bakım planı rolünüzde görünmüyor"],
    },
  },
  "/week": {
    all: ["Bugün ve Bu hafta listeleri teknisyenler içindir"],
    replace: {
      technician: ["Sol asansör", "Bu hafta"],
      accountant: ["Bakım planı rolünüzde görünmüyor"],
    },
  },
  "/elevators/e1/visits/new": {
    all: [
      "Fren sistemi",
      "Topraklama",
      "0/16",
      "2026-0043",
      "16 madde daha yanıtlanmalı",
      // The building's answer, none of it chosen yet.
      "Bina yetkilisi onayı",
      "İmza al",
      "Binada kimse yoktu",
      "İmzalamayı reddetti",
    ],
    add: {
      owner: ["Teknisyen seçin"],
      operations: ["Teknisyen seçin"],
      technician: ["Test User"],
    },
    replace: { accountant: [VISITS_RESTRICTED] },
  },
  "/maintenance-visits": {
    all: ["Sol asansör", "Hakan Çelik", "Erişim sağlanamadı"],
    replace: { accountant: [VISITS_RESTRICTED] },
  },
  "/maintenance-visits?elevator=e1": {
    all: ["Sol asansör"],
    replace: { accountant: [VISITS_RESTRICTED] },
  },
  // The October visit is in the range and the September one is not — the
  // range reaches the request rather than stopping at the address bar.
  "/maintenance-visits?visit_date_after=2026-10-01&visit_date_before=2026-10-31": {
    all: ["14.10.2026", "01.10.2026"],
    replace: { accountant: [VISITS_RESTRICTED] },
  },
  "/maintenance-visits/v1": {
    // The building's signature: its state, who signed and in what role.
    all: [
      "Halatlarda yer yer",
      "2 madde dikkat gerektiriyor",
      "Kabin aydınlatma armatürü",
      "Bina yetkilisi onayı",
      "İmzalı",
      "Ayşe Kaya",
      "Yönetici",
    ],
    replace: { accountant: [VISITS_RESTRICTED] },
  },
  "/maintenance-visits/v2": {
    all: ["Makine dairesi kilitliydi", "Kontrol listesi doldurulmamış"],
    replace: { accountant: [VISITS_RESTRICTED] },
  },
};

/**
 * The accountant has no business with visits, and the elevator page must not
 * offer them a way in — the absence is the property being asserted.
 */
const EXPECT_ABSENT_BY_ROLE = {
  // An issued draft cannot be edited: no price box, no new line.
  "/billing/d2": { replace: { owner: ["Satır ekle"], accountant: ["Satır ekle"] } },
  "/contracts/k1": { add: { operations: ["Fatura taslakları"] } },
  "/customers/c1": { add: { technician: ["Portal erişimi"], accountant: ["Portal erişimi"] } },
  "/elevators/e1": {
    replace: { accountant: ["Bakım kaydı gir", "Bakım geçmişi", "Bu ayın planı", "Arıza bildir", "Muayene geçmişi"] },
    // Read-only for a technician: no record, no fault, no "fixed".
    add: { technician: ["Muayene kaydı gir", "Arıza aç"] },
  },
  // The board is live work; closed history is behind the status filter.
  "/faults": { all: ["Z9Q1AA"] },
  // Not theirs: a technician is offered nothing on somebody else's fault.
  "/faults/f1": { add: { technician: ["Teknisyen gönder", "İptal et"] } },
  // Only the office sends a technician from the create form.
  "/elevators/e1/faults/new": { add: { technician: ["Hemen gönderilecek teknisyen"] } },

  // Only the unassigned row: the filter reached the request.
  "/plan?unassigned=%22true%22": { all: ["Sol asansör"] },
  // An unassigned row is the office's to give, never on a technician's day.
  "/today": { all: ["Yük asansörü"] },
  "/maintenance-visits?visit_date_after=2026-10-01&visit_date_before=2026-10-31": {
    all: ["15.09.2026"],
  },
};

function forRole(table, path, role) {
  const entry = table[path];
  if (!entry) return [];
  if (entry.replace?.[role]) return entry.replace[role];
  return [...(entry.all ?? []), ...(entry.add?.[role] ?? [])];
}

const server = await createServer({
  // No HMR: this renders each route once and exits. The websocket server it
  // would otherwise open is a listening socket nobody connects to.
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

let failures = 0;
try {
  await server.ssrLoadModule("/src/lib/i18n.ts");
  // Everything comes from the app's own module graph: importing the router
  // package separately creates a second instance and React context stops
  // matching, which looks like a render bug but is a module-identity bug.
  const { createRouterForPath, createRouterForPortalPath, RouterProvider } = await server.ssrLoadModule(
    "/src/router.tsx",
  );

  for (const path of PATHS) {
    const errors = [];
    for (const role of ROLES) {
      try {
        const router = createRouterForPath(path, role);
        await router.load();
        const html = renderToString(React.createElement(RouterProvider, { router }));
        if (!html || html.length < 40) throw new Error(`rendered ${html.length} characters`);

        // The error boundary must never be what this check renders.
        //
        // `renderToString` does not invoke error boundaries — a component that
        // throws still takes the render down, which is what the catch below
        // reports — so today this can only fire if a screen renders the
        // fallback deliberately. It is asserted anyway because the day that
        // changes, every broken screen in this list would start passing as a
        // tidily handled apology instead of failing, and the check would go on
        // printing OK while protecting nothing.
        if (html.includes("data-error-boundary")) {
          throw new Error("the error boundary rendered — something on this screen threw");
        }

        // One string or several. A screen assembled from two independent
        // sections needs an assertion per section, or half of it can stop
        // rendering without the check noticing.
        for (const needle of [EXPECT[path] ?? []].flat()) {
          if (!html.includes(needle)) {
            throw new Error(`data never reached the page — no "${needle}" in the markup`);
          }
        }

        for (const needle of forRole(EXPECT_BY_ROLE, path, role)) {
          if (!html.includes(needle)) {
            throw new Error(`no "${needle}" in the markup for this role`);
          }
        }

        for (const needle of forRole(EXPECT_ABSENT_BY_ROLE, path, role)) {
          if (html.includes(needle)) {
            throw new Error(`"${needle}" is offered to a role that has no access to it`);
          }
        }

        for (const needle of [EXPECT_ABSENT[path] ?? []].flat()) {
          if (html.includes(needle)) {
            throw new Error(
              `"${needle}" is on a page that must not offer it — the server refuses ` +
                `this action, so the interface must not present it.`,
            );
          }
        }

        const hidden = EXPECT_HIDDEN[path];
        if (hidden && !html.includes(hidden)) {
          throw new Error(
            `a field on a hidden tab is not in the form — no "${hidden}" in the markup. ` +
              `Unmounting inactive panels loses whatever was typed on them.`,
          );
        }
      } catch (error) {
        errors.push(`${role}: ${error.message}`);
      }
    }
    if (errors.length === 0) {
      console.log(`  OK    ${path}`);
    } else {
      failures += errors.length;
      console.error(`  FAIL  ${path}`);
      for (const message of errors) console.error(`          ${message}`);
    }
  }
  // The guard, checked as an anonymous visitor rather than through the
  // override every other case uses. Without it a signed-out person lands
  // inside the application and its loaders start making calls that can only
  // 401 — which is what filled a production network panel with red.
  // Asserted on the requests rather than on the resulting location, because
  // `router.load()` does not apply a redirect thrown in beforeLoad — the
  // existing `/` to `/elevators` redirect does not take effect here either.
  // What it does prove is the thing that was actually wrong: the loader never
  // runs, so a signed-out visitor makes no request that can only 401.
  requested.length = 0;
  const guarded = createRouterForPath("/elevators");
  await guarded.load();
  const askedFor = requested.filter((path) => path.startsWith("/api/v1/elevators"));

  if (askedFor.length > 0) {
    console.error(`  FAIL  anonymous visitor requested ${askedFor[0]}`);
    console.error("          The guard must run before the loaders, not in the component.");
    failures += 1;
  } else if (!requested.includes("/api/v1/auth/refresh")) {
    console.error("  FAIL  the session was never checked — the guard did not run at all");
    failures += 1;
  } else {
    console.log("  OK    anonymous visitor asks only whether they have a session");
  }

  // The sticker, scanned by a resident with no account: the public report
  // form, not a sign-in page — and not a single request beyond the guard's
  // own question. The firm's endpoint for the sticker is for staff; a resident
  // asking it would be a 401 at best.
  requested.length = 0;
  const resident = createRouterForPath("/q/qr-demo-token");
  await resident.load();
  const residentHtml = renderToString(React.createElement(RouterProvider, { router: resident }));
  const residentAsked = requested.filter((path) => path !== "/api/v1/auth/refresh");
  const residentMissing = ["Asansör arızası bildir", "Kabinde mahsur kalan var", 'name="website"', 'tabindex="-1"'].filter(
    (needle) => !residentHtml.includes(needle),
  );
  if (residentAsked.length > 0) {
    console.error(`  FAIL  a resident at the sticker requested ${residentAsked[0]}`);
    failures += 1;
  } else if (residentMissing.length > 0 || residentHtml.includes("data-error-boundary")) {
    console.error(`  FAIL  the public report did not render — no "${residentMissing[0]}"`);
    failures += 1;
  } else {
    console.log("  OK    a resident at the sticker gets the public report, and asks nothing else");
  }

  // The customer portal (M6): its own tree and its own session. Signed out,
  // every public page renders; signed in (through the override, as a demo
  // building manager), the three screens render. Neither ever asks the staff
  // session anything — no /auth/refresh, no staff endpoint — which is the
  // wall between the two principals, checked on the wire.
  const portalMe = JSON.parse(readFileSync("fixtures/demo-portal-me.json", "utf8"));
  const PORTAL = [
    ["/portal/login", null, ["Portala giriş", "Şifremi unuttum"]],
    ["/portal/accept/some-token", null, ["Hesabınızı açın", "Şifreyi kaydet ve giriş yap"]],
    ["/portal/password-reset", null, ["Şifre sıfırlama"]],
    ["/portal/password-reset/some-token", null, ["Yeni şifre belirleyin"]],
    [
      "/portal",
      portalMe,
      [
        "Dadaş Konakları Site Yönetimi",
        "Bizi arayın: 0442 000 00 00",
        "Sol asansör",
        "1 arıza üzerinde çalışılıyor",
        "Asansör şu anda çalışmıyor",
      ],
    ],
    [
      "/portal/elevators/e1",
      portalMe,
      ["Bakım ziyaretleri", "Halatlar ve kablolar", "PK-2026-18442", "Muayene raporu (PDF)", "1. fotoğraf"],
    ],
    ["/portal/faults", portalMe, ["Arıza bildir", "Kabinde mahsur kalan var", "K7M2QX", "Kılavuz raylar yağlandı."]],
  ];
  for (const [path, me, needles] of PORTAL) {
    requested.length = 0;
    const router = createRouterForPortalPath(path, me);
    await router.load();
    const html = renderToString(React.createElement(RouterProvider, { router }));
    const staffAsked = requested.filter((asked) => asked.startsWith("/api/v1/") && !asked.startsWith("/api/v1/portal/"));
    const missing = needles.filter((needle) => !html.includes(needle));
    if (html.includes("data-error-boundary") || missing.length > 0) {
      console.error(`  FAIL  ${path} (portal${me ? ", signed in" : ""}) — no "${missing[0] ?? "render"}"`);
      failures += 1;
    } else if (staffAsked.length > 0) {
      console.error(`  FAIL  ${path} (portal) asked the staff API: ${staffAsked[0]}`);
      failures += 1;
    } else {
      console.log(`  OK    ${path} (portal${me ? ", signed in" : ", signed out"})`);
    }
  }

  // A visitor with no portal session at the portal's home: sent to its login,
  // and the portal's data is never asked for.
  requested.length = 0;
  const portalGuest = createRouterForPortalPath("/portal", null);
  await portalGuest.load();
  const leaked = requested.filter((asked) => asked.startsWith("/api/v1/portal/") && asked !== "/api/v1/portal/auth/refresh");
  if (leaked.length > 0) {
    console.error(`  FAIL  a visitor with no portal session requested ${leaked[0]}`);
    failures += 1;
  } else {
    console.log("  OK    a visitor with no portal session asks the portal for nothing");
  }
  // The styleguide renders above, on a dev server, which is the only place it
  // is a route at all — `router.tsx` builds it inside an `import.meta.env.DEV`
  // branch so the production build folds the whole thing away. That is the
  // half a render check cannot see: it proves the page still works for whoever
  // is building the interface, and says nothing about what shipped.
  //
  // So the built output is read instead. `npm run verify` runs the build
  // immediately before this script, so `dist/` is the build being checked; a
  // bare `npm run smoke` has no build to look at and this is skipped rather
  // than failed.
  //
  // Asserted on a fixture value rather than on a filename, because a chunk
  // called `StyleGuide-*.js` is not the failure worth catching — the failure is
  // demo records reaching a technician's phone, whatever the chunk is named.
  failures += checkStyleguideStayedHome();
} finally {
  await server.close();
}

/** Returns 1 if the development-only styleguide is in the production build. */
function checkStyleguideStayedHome() {
  const assets = "dist/assets";
  if (!existsSync(assets)) {
    console.log("  SKIP  no dist/ — run `npm run build` to check what production ships");
    return 0;
  }
  const [demo] = JSON.parse(readFileSync("fixtures/demo-elevators.json", "utf8"));
  const marker = demo.registration_number;
  const leaked = readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => readFileSync(`${assets}/${name}`, "utf8").includes(marker));

  if (leaked.length > 0) {
    console.error(`  FAIL  the styleguide's demo records shipped in ${leaked.join(", ")}`);
    console.error("          /styleguide is for developers; production must not download it.");
    return 1;
  }
  console.log("  OK    the styleguide and its demo records are not in the production build");
  return 0;
}

if (failures > 0) {
  console.error(`\n${failures} render failure(s)`);
} else {
  console.log(`\nAll ${PATHS.length} routes render across ${ROLES.length} roles`);
}

/*
 * Exit rather than let the event loop drain.
 *
 * Rendering the routes takes about a second. Waiting for Node to decide it has
 * nothing left to do took five minutes, which was most of the CI run and all of
 * the reason a one-line change took six minutes to verify.
 *
 * The cause is the query cache: `gcTime` defaults to five minutes, so every
 * query the loaders populate schedules a collection timer that far out, and a
 * pending timer keeps the process alive. There were twenty-four of them.
 *
 * They could be cleared by giving the smoke run its own client, but that would
 * mean rendering against a cache configured differently from the real one --
 * and this script exists to render the real thing. So the verdict is printed
 * and the process ends, which is what a one-shot checker should do anyway.
 */
process.exit(failures > 0 ? 1 : 0);
