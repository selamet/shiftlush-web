# shiftlush-web

ShiftLush frontend — Vite + React 19 + TypeScript, client-side SPA.

The backend lives in the sibling `shiftlush-api` repository. The two are joined
only by the OpenAPI contract; this app never touches a database and never
renders on the server.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

The backend is expected at `http://localhost:8000/api/v1`
(`VITE_API_URL` in `.env.local`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check, then produce the static bundle in `dist/` |
| `npm run typecheck` | Types only |
| `npm run lint:tr` | Fails if any Turkish character appears under `src/` |
| `npm run lint:i18n` | Fails on a translation key with no entry in `messages/tr.json` |
| `npm run verify` | All of the above, then the build |

## Language rule

**No Turkish anywhere in `src/`** — not in strings, not in comments. Every
user-facing string lives in `messages/tr.json` and reaches the UI through
`t()`. `messages/` and `fixtures/` sit outside `src/` so the rule needs no
exceptions, and `npm run lint:tr` enforces it.

Enum values are the one case that needs care: the API owns them and may add new
ones at any time. Resolve them with `enumLabel()` from `src/lib/i18n.ts`, never
with a bare `t()` — an untranslated value must render as its raw code rather
than blank or crashing.

## Design system

`src/styles/globals.css` holds every token, light and dark, transcribed from the
design phase. Nothing outside that file may introduce a colour.

Three rules keep the periodic-inspection label from colliding with the system
status colours, which want the same four hues:

1. **Form** — the inspection label is a filled 13px square; system status is a
   pale-background block or a 3px left stripe. Saturated fill inside a data cell
   always means "inspection label".
2. **Saturation** — label colours are matte and mid-saturation; system colours
   are either a very pale surface or dark ink. The band between is unused.
3. **Placement** — the label appears only in the label column and the record
   header. System status never enters a data column.

Enum *states* carry no colour at all. They are separated by chip weight and
icon: the expected value renders as plain text so scanning 500 rows stays fast,
and the chip gets heavier as the deviation gets more consequential.

Run the app to browse the living reference at `/` (`src/styleguide/`).

## Structure

```
messages/tr.json          all user-facing text
fixtures/                 demo data (also keeps Turkish out of src/)
src/
├── components/ui/        design system primitives
├── components/layout/    app shell, sidebar, role-based nav
├── screens/              product screens
├── lib/                  i18n, formatting, theme, session, utils
├── styles/globals.css    design tokens
├── styleguide/           living design system reference
└── router.tsx            route tree
```

## Screens

Built: login, app shell, elevator list, elevator form. Not yet built: elevator
detail, address picker, contract detail, QR label printing — the remaining
routes render a named placeholder rather than 404, so the gap stays visible.

Two behaviours are worth knowing before touching them:

- **Boot skeleton.** The access token lives in memory, so a page load has no
  session and no role until the refresh call returns. The shell renders at full
  fidelity during that gap and only role-dependent parts are skeletons, so
  nothing shifts when the session lands. Do not replace it with a spinner.
- **One save per record.** The elevator form's tabs are navigation, not
  transaction boundaries. Saving per tab would teach users to save six times and
  produce half-written records. Empty fields are counted in neutral grey; red is
  reserved for values that are actually invalid.

## Documentation

- `docs/design-brief.md` — the design-phase prompts
- `docs/design-input.md` — distilled design input (screens, labels, enums)
- `../shiftlush-api/faz1-sartname.md` — full technical specification
