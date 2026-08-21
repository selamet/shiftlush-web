import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Printer, TriangleAlert } from "lucide-react";
import demoElevators from "@fixtures/demo-elevators.json";
import { enumLabel } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";

type Elevator = (typeof demoElevators)[number];

/**
 * Seven columns, chosen for what someone scanning 500 rows actually needs:
 * the identifier (to match the paper in their hand), the name (to tell two
 * elevators in one building apart), building and customer (whose it is),
 * status and label (what needs attention), the next inspection date (how
 * urgent), and brand/model (which spare part).
 *
 * The other 24 fields — pit depth, rated speed, CE number — are record fields,
 * not search criteria, and live on the detail screen. Three of these columns
 * carry two lines, which is what keeps a 12-column table at seven and off
 * horizontal scroll.
 */
export function ElevatorListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const readOnly = role === "technician";

  const columns: ListColumn<Elevator>[] = [
    {
      key: "elevator.fields.registrationNumber",
      sticky: true,
      cell: (row) => (
        <Link to="/elevators/$id" params={{ id: row.id }} className="hover:underline">
          {/* The building rides along here below md, where its own column drops. */}
          <span className="flex flex-col leading-tight">
            <span className="font-mono tnum text-cell">{row.registration_number}</span>
            <span className="truncate text-help text-muted-foreground md:hidden">
              {row.building}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: "elevator.singular",
      hideOnMobile: true,
      cell: (row) => (
        <Stacked
          primary={row.name}
          secondary={
            <>
              {row.category ? (
                enumLabel("elevator.category", row.category)
              ) : (
                <span className="italic">{t("elevator.hints.categoryMissing")}</span>
              )}
              {row.stop_count != null &&
                ` · ${t("elevator.hints.stopCount", { count: row.stop_count })}`}
            </>
          }
        />
      ),
    },
    {
      key: "building.singular",
      hideOnMobile: true,
      cell: (row) => <Stacked primary={row.building} secondary={row.customer} />,
    },
    {
      key: "elevator.fields.status",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <ElevatorStatusChip value={row.status} />
          {/* A serious non-conformity at inspection, so it is surfaced in the
              row rather than buried among 31 record fields. */}
          {!row.has_car_door && (
            <span className="inline-flex items-center gap-1 text-help text-warning">
              <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
              {t("elevator.hints.noCarDoorShort")}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "elevator.fields.inspectionLabel",
      cell: (row) => <InspectionLabel value={row.inspection_label} />,
    },
    {
      key: "elevator.fields.nextInspectionDate",
      cell: (row) => (
        <span className="tnum whitespace-nowrap text-muted-foreground">
          {formatDate(row.next_inspection_date) || "—"}
        </span>
      ),
    },
    {
      key: "elevator.fields.brand",
      hideOnMobile: true,
      cell: (row) => <Stacked primary={row.brand ?? "—"} secondary={row.model ?? ""} />,
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="elevator.title"
      primaryActionKey={readOnly ? undefined : "elevator.add"}
      exportable
      filters={[
        { labelKey: "elevator.fields.status" },
        { labelKey: "elevator.fields.inspectionLabel", count: 2 },
        { labelKey: "building.singular" },
        { labelKey: "customer.singular", count: 1 },
        { labelKey: "elevator.fields.category" },
      ]}
      activeFilters={[
        {
          labelKey: "elevator.fields.inspectionLabel",
          value: enumLabel("elevator.inspectionLabel", "yellow"),
        },
        {
          labelKey: "elevator.fields.inspectionLabel",
          value: enumLabel("elevator.inspectionLabel", "red"),
        },
        { labelKey: "customer.singular", value: demoElevators[3].customer },
      ]}
      columns={columns}
      rows={demoElevators}
      rowKey={(row) => row.id}
      total={342}
      selectable={!readOnly}
      bulkActions={() => (
        <>
          <Button size="xs" variant="secondary">
            <Printer />
            {t("qr.printSelected")}
          </Button>
          <Button size="xs" variant="secondary">
            {t("list.changeStatus")}
          </Button>
          <Button size="xs" variant="secondary">
            {t("contract.actions.addElevator")}
          </Button>
        </>
      )}
      emptyTitleKey="empty.noElevators"
      prerequisite={{ labelKey: "building.add", to: "/buildings" }}
    />
  );
}
