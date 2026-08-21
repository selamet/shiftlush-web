import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, QrCode, Building2, Users } from "lucide-react";
import demoElevators from "@fixtures/demo-elevators.json";
import demoSession from "@fixtures/demo-session.json";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const PER_SHEET = 12;

/**
 * One printed label.
 *
 * This gets read in a machine room: dim light, dust, and a sticker that has
 * been there for years. So the type is heavy, the contrast is maximal, and
 * there are no hairlines — a 1px rule that survives on screen disappears on a
 * scuffed vinyl label. Printed in black on white regardless of the app theme.
 */
function Label({
  registrationNumber,
  name,
  building,
}: {
  registrationNumber: string;
  name: string;
  building: string;
}) {
  return (
    <div className="flex h-[74.25mm] w-[70mm] flex-col justify-between border-2 border-black bg-white p-[4mm] text-black">
      <div className="flex items-start justify-between gap-[2mm]">
        <div className="flex min-w-0 flex-col">
          <span className="text-[11pt] font-bold leading-tight">{name}</span>
          <span className="truncate text-[8.5pt] leading-tight">{building}</span>
        </div>
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="3.6" y="2.6" width="24.8" height="26.8" rx="4.2" stroke="black" strokeWidth="3" />
          <rect x="9" y="6.6" width="14" height="10.4" rx="1.6" fill="black" />
          <path d="M9.4 21.6h13.2M9.4 25.4h13.2" stroke="black" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>

      {/* Minimum 25x25mm at error-correction level H (30% recoverable). */}
      <div className="mx-auto grid size-[30mm] place-items-center border-2 border-black">
        <QrCode className="size-[24mm]" aria-hidden="true" />
      </div>

      <div className="flex flex-col items-center gap-[1mm]">
        <span className="font-mono text-[10pt] font-bold tracking-tight">
          {registrationNumber}
        </span>
        <span className="text-[8pt] font-semibold">
          {demoSession.companyName} · {demoSession.phone}
        </span>
      </div>
    </div>
  );
}

export function QrLabelScreen() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(demoElevators.slice(0, 6).map((e) => e.id));

  const rows = demoElevators.filter((row) => selected.includes(row.id));
  const sheets = Math.max(1, Math.ceil(rows.length / PER_SHEET));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t("qrLabels.title")}</h1>
          <p className="text-help text-muted-foreground">{t("qrLabels.sheetLayout")}</p>
        </div>
        <Button size="sm" disabled={rows.length === 0} onClick={() => window.print()}>
          <Printer />
          {t("common.print")}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] print:block">
        {/* Selection ------------------------------------------------------ */}
        <div className="flex flex-col gap-3 print:hidden">
          <div className="flex gap-2">
            <Button variant="secondary" size="xs">
              <Building2 />
              {t("qrLabels.selectByBuilding")}
            </Button>
            <Button variant="secondary" size="xs">
              <Users />
              {t("qrLabels.selectByCustomer")}
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border-subtle bg-card">
            {demoElevators.map((row) => (
              <label
                key={row.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  onChange={() => toggle(row.id)}
                  className="size-4 shrink-0 rounded-xs accent-primary"
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-cell">{row.name}</span>
                  <span className="truncate text-help text-muted-foreground">{row.building}</span>
                </span>
                <span className="ml-auto font-mono tnum text-help text-subtle">
                  {row.registration_number}
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between text-help text-muted-foreground">
            <span className="tnum">{t("qrLabels.labelCount", { count: rows.length })}</span>
            <span className="tnum">{t("qrLabels.sheetCount", { count: sheets })}</span>
          </div>

          <Alert tone="info" title={t("qrLabels.printNotice")}>
            <p className="text-help">{t("qrLabels.minSize")}</p>
          </Alert>
        </div>

        {/* Preview -------------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <span className="text-colhead uppercase text-subtle print:hidden">
            {t("qrLabels.preview")}
          </span>

          {rows.length === 0 ? (
            <div className="grid place-items-center rounded-lg border border-dashed border-border-strong p-12 text-body text-muted-foreground">
              {t("qrLabels.emptySelection")}
            </div>
          ) : (
            <div
              className={cn(
                // A4 at real proportions so the preview is trustworthy.
                "mx-auto w-[210mm] origin-top scale-[0.62] bg-white p-[10mm] shadow-md",
                "grid grid-cols-3 content-start gap-0",
                "print:scale-100 print:shadow-none print:p-0",
              )}
            >
              {rows.slice(0, PER_SHEET).map((row) => (
                <Label
                  key={row.id}
                  registrationNumber={row.registration_number}
                  name={row.name}
                  building={row.building}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
