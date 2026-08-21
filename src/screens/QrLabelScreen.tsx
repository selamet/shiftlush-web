import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, QrCode, Building2, Users, Download, Search, TriangleAlert } from "lucide-react";
import demoElevators from "@fixtures/demo-elevators.json";
import company from "@fixtures/demo-company.json";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InspectionLabel } from "@/components/ui/inspection-label";

/**
 * Sheet geometry, taken from the design and stated in real millimetres.
 *
 * 3 x 63.3 + 2 x 10 = 209.9 ≈ 210, and 4 x 69.25 + 2 x 10 = 297. The preview is
 * rendered at these sizes so what you see is what leaves the printer.
 */
const COLS = 3;
const ROWS = 4;
const PER_SHEET = COLS * ROWS;
const CELL_W = "63.3mm";
const CELL_H = "69.25mm";
const QR_SIDE = "29.6mm";

type Elevator = (typeof demoElevators)[number];

/**
 * One printed label.
 *
 * Read in a machine room: dim light, dust, and a sticker that has been there
 * for years. Hence heavy type, maximum contrast, and no rule thinner than
 * 0.7mm — a hairline that survives on screen disappears on scuffed vinyl.
 *
 * The inspection label colour is deliberately absent. A single-colour print
 * cannot distinguish it, and the value changes over time: printing it would
 * mean reprinting the physical sticker every time the inspection result does.
 */
function Label({ elevator }: { elevator: Elevator }) {
  return (
    <div
      className="flex flex-col justify-between border-[0.7mm] border-black bg-white p-[4mm] text-black"
      style={{ width: CELL_W, height: CELL_H }}
    >
      <div className="flex flex-col leading-tight">
        <span className="text-[11pt] font-bold">{elevator.name}</span>
        <span className="truncate text-[9.5pt] font-medium">{elevator.building}</span>
      </div>

      <div
        className="mx-auto grid place-items-center border-[0.7mm] border-black"
        style={{ width: QR_SIDE, height: QR_SIDE }}
      >
        <QrCode className="size-[22mm]" aria-hidden="true" />
      </div>

      <div className="flex flex-col items-center gap-[0.5mm] leading-tight">
        <span className="font-mono text-[10pt] font-bold tracking-tight">
          {elevator.registration_number}
        </span>
        <span className="text-[8.5pt] font-bold uppercase">{company.display_name}</span>
        <span className="text-[8.5pt] font-semibold">{company.phone}</span>
      </div>
    </div>
  );
}

/** An empty cell is drawn, not omitted — the waste has to be visible. */
function EmptyCell() {
  return (
    <div
      className="border-[0.5mm] border-dashed border-neutral-400"
      style={{ width: CELL_W, height: CELL_H }}
    />
  );
}

function Sheet({ page, rows }: { page: number; rows: Elevator[] }) {
  const { t } = useTranslation();
  const blanks = PER_SHEET - rows.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2 print:hidden">
        <span className="text-label">{t("qrLabels.page", { n: page })}</span>
        <span className="tnum text-help text-muted-foreground">
          {t("qrLabels.filledOf", { filled: rows.length, total: PER_SHEET })}
        </span>
        {blanks > 0 && (
          <span className="tnum text-help text-warning">
            {t("qrLabels.emptyCells", { count: blanks })}
          </span>
        )}
      </div>

      {/* Always white paper with black ink, even in dark theme: the preview
          simulates the sheet, not the interface. */}
      <div
        className="grid bg-white p-[10mm] shadow-md print:shadow-none"
        style={{ width: "210mm", gridTemplateColumns: `repeat(${COLS}, ${CELL_W})` }}
      >
        {rows.map((elevator) => (
          <Label key={elevator.id} elevator={elevator} />
        ))}
        {Array.from({ length: blanks }).map((_, index) => (
          <EmptyCell key={`blank-${index}`} />
        ))}
      </div>
    </div>
  );
}

export function QrLabelScreen() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(demoElevators.map((row) => row.id));

  const rows = demoElevators.filter((row) => selected.includes(row.id));
  const pages: Elevator[][] = [];
  for (let i = 0; i < rows.length; i += PER_SHEET) {
    pages.push(rows.slice(i, i + PER_SHEET));
  }
  const blanks = pages.length * PER_SHEET - rows.length;
  const overflowing = rows.length > PER_SHEET;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  /** Which page and cell a label lands in — shown so the sheet holds no surprises. */
  function cellRef(index: number) {
    return `${Math.floor(index / PER_SHEET) + 1} / ${(index % PER_SHEET) + 1}`;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t("qrLabels.title")}</h1>
          <p className="text-help text-muted-foreground">{t("qrLabels.sheetSpec")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={rows.length === 0}>
            <Download />
            {t("qrLabels.downloadPdf")}
          </Button>
          <Button size="sm" disabled={rows.length === 0} onClick={() => window.print()}>
            <Printer />
            {t("common.print")}
          </Button>
        </div>
      </div>

      {/* Overflow states the outcome in numbers and offers both ways out — the
          cost of a wasted sheet is not the paper, it is the minute spent
          noticing afterwards. */}
      {overflowing && blanks > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-l-[3px] border-warning bg-warning-bg px-3 py-2.5 print:hidden">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="tnum text-body text-warning">
            {t("qrLabels.labelCount", { count: rows.length })} ·{" "}
            {t("qrLabels.pageCount", { count: pages.length })} ·{" "}
            {t("qrLabels.emptyCells", { count: blanks })}
          </span>
          <button
            type="button"
            onClick={() => setSelected((current) => current.slice(0, -1))}
            className="text-help text-warning underline"
          >
            {t("qrLabels.dropLast")}
          </button>
          <button type="button" className="text-help text-warning underline">
            {t("qrLabels.addMore", { count: blanks })}
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)] print:block">
        {/* Selection ------------------------------------------------------ */}
        <div className="flex flex-col gap-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="xs">
              <Building2 />
              {t("qrLabels.addBuilding")}
            </Button>
            <Button variant="secondary" size="xs">
              <Users />
              {t("qrLabels.addCustomer")}
            </Button>
          </div>

          <label className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={t("qrLabels.searchElevator")}
              className="h-control-sm w-full rounded-md border border-input bg-card pl-9 pr-3 text-body placeholder:text-subtle focus-ring"
            />
          </label>

          <div className="overflow-hidden rounded-lg border border-border-subtle bg-card">
            <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-1.5 text-colhead uppercase text-muted-foreground">
              <span className="w-4 shrink-0" />
              <span className="w-12 shrink-0">{t("qrLabels.cell")}</span>
              <span className="min-w-0 flex-1">{t("elevator.fields.registrationNumber")}</span>
              <span className="w-20 shrink-0">{t("elevator.fields.inspectionLabel")}</span>
            </div>
            {demoElevators.map((row) => {
              const index = rows.findIndex((candidate) => candidate.id === row.id);
              return (
                <label
                  key={row.id}
                  className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={index !== -1}
                    onChange={() => toggle(row.id)}
                    className="size-4 shrink-0 rounded-xs accent-primary"
                  />
                  {/* Where this label lands. A cell past the first sheet is
                      marked, so overflow is visible before printing. */}
                  <span
                    className={cn(
                      "w-12 shrink-0 tnum text-help",
                      index === -1 ? "text-subtle" : "text-muted-foreground",
                      index >= PER_SHEET && "font-medium text-warning",
                    )}
                  >
                    {index === -1 ? "—" : cellRef(index)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="font-mono tnum text-cell">{row.registration_number}</span>
                    <span className="truncate text-help text-muted-foreground">
                      {row.name} · {row.building}
                    </span>
                  </span>
                  <span className="w-20 shrink-0">
                    <InspectionLabel value={row.inspection_label} />
                  </span>
                </label>
              );
            })}
          </div>

          <p className="flex items-start gap-1.5 text-help text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            {t("qrLabels.regenerateWarning")}
          </p>
          <p className="text-help text-muted-foreground">{t("qrLabels.noPrinterHint")}</p>
        </div>

        {/* Preview -------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-2 print:hidden">
            <span className="text-colhead uppercase text-subtle">{t("qrLabels.preview")}</span>
            <span className="text-help text-muted-foreground">
              {t("qrLabels.previewSimulatesPaper")}
            </span>
          </div>

          {rows.length === 0 ? (
            /* Not a "nothing here" screen but a teaching one: the grid stays so
               a first-time user learns an A4 holds twelve and fills left to
               right, top to bottom. */
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="tnum text-label">{t("qrLabels.labelCount", { count: 0 })}</span>
                <span className="tnum text-help text-muted-foreground">
                  {t("qrLabels.emptyCells", { count: PER_SHEET })}
                </span>
                <span className="text-help text-muted-foreground">{t("qrLabels.noSelection")}</span>
              </div>
              <div className="max-w-full overflow-x-auto">
                <div className="w-[210mm] origin-top-left scale-[0.55] 2xl:scale-[0.7]">
                  <Sheet page={1} rows={[]} />
                </div>
              </div>
              <p className="text-help text-muted-foreground">{t("qrLabels.layoutStillShown")}</p>
              <p className="text-help text-muted-foreground">
                {t("qrLabels.printDisabledWhenEmpty")}
              </p>
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <div className="flex w-[210mm] origin-top-left scale-[0.55] flex-col gap-6 print:scale-100 2xl:scale-[0.7]">
                {pages.map((pageRows, index) => (
                  <Sheet key={index} page={index + 1} rows={pageRows} />
                ))}
              </div>
            </div>
          )}

          <p className="text-help text-muted-foreground print:hidden">
            {t("qrLabels.whitePaperInDark")}
          </p>
        </div>
      </div>
    </div>
  );
}
