import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, FileDown, Image as ImageIcon, Siren } from "lucide-react";
import { errorMessage, supportReference } from "@/api/errors";
import {
  portalElevatorQuery,
  portalFileUrl,
  portalInspectionsQuery,
  portalVisitsQuery,
  type PortalFile,
  type PortalInspection,
  type PortalVisit,
} from "@/api/portal-queries";
import { toDisplay } from "@/lib/date";
import { enumLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { Button, buttonVariants } from "@/components/ui/button";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { ChecklistResultChip, ElevatorStatusChip, VisitStatusChip } from "@/components/ui/status-chip";

/**
 * One lift, as its building manager sees it: what was done on each visit and
 * what each inspection found.
 *
 * A visit reads as its date, the technician's first name, whether it was
 * completed, and anything that needs attention — the full checklist is a tap
 * away for the manager who wants to show a resident. Photos and inspection
 * reports open through a link the server signs at the moment of the tap.
 */
export function PortalElevatorScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const liftId = id ?? "";
  const lift = useQuery({ ...portalElevatorQuery(liftId), enabled: Boolean(liftId) });
  const visits = useQuery({ ...portalVisitsQuery({ elevator: liftId, page_size: 12 }), enabled: Boolean(liftId) });
  const inspections = useQuery({
    ...portalInspectionsQuery({ elevator: liftId, page_size: 10 }),
    enabled: Boolean(liftId),
  });

  if (lift.isPending) return <DetailSkeleton />;
  if (lift.isError) {
    return (
      <ListError
        message={errorMessage(lift.error, t)}
        reference={supportReference(lift.error)}
        onRetry={() => void lift.refetch()}
      />
    );
  }

  const data = lift.data;

  return (
    <>
      <Link to="/portal" className="inline-flex items-center gap-1 self-start text-help text-muted-foreground hover:underline">
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        {t("portal.nav.lifts")}
      </Link>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-title">{data.name}</h1>
          <ElevatorStatusChip value={data.status} />
        </div>
        <p className="text-body text-muted-foreground">{data.building_name}</p>
        <Link
          to="/portal/faults"
          search={{ elevator: data.id }}
          className={cn(buttonVariants({ size: "lg" }), "mt-1 self-start")}
        >
          <Siren />
          {t("portal.faults.report")}
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle">
        <Fact label={t("portal.home.lastMaintenance")}>{toDisplay(data.last_maintenance_date) || "—"}</Fact>
        <Fact label={t("portal.home.nextMaintenance")}>{toDisplay(data.next_maintenance_date) || "—"}</Fact>
        <Fact label={t("portal.home.nextInspection")}>{toDisplay(data.next_inspection_date) || "—"}</Fact>
        <Fact label={t("portal.home.label")}>
          <InspectionLabel value={data.inspection_label} />
        </Fact>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-cardtitle">{t("portal.lift.visits")}</h2>
        {visits.isPending ? (
          <p className="text-help text-subtle">{t("common.loading")}</p>
        ) : visits.isError ? (
          <p className="text-help text-destructive">{errorMessage(visits.error, t)}</p>
        ) : visits.data.results.length === 0 ? (
          <p className="text-help text-muted-foreground">{t("portal.lift.noVisits")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visits.data.results.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-cardtitle">{t("portal.lift.inspections")}</h2>
        {inspections.isPending ? (
          <p className="text-help text-subtle">{t("common.loading")}</p>
        ) : inspections.isError ? (
          <p className="text-help text-destructive">{errorMessage(inspections.error, t)}</p>
        ) : inspections.data.results.length === 0 ? (
          <p className="text-help text-muted-foreground">{t("portal.lift.noInspections")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {inspections.data.results.map((inspection) => (
              <InspectionCard key={inspection.id} inspection={inspection} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card p-3">
      <span className="text-help text-muted-foreground">{label}</span>
      <span className="tnum text-body">{children}</span>
    </div>
  );
}

/** Opens a file through a freshly signed link; says so in words if it cannot. */
function useOpenFile() {
  const { t } = useTranslation();
  const [failure, setFailure] = useState("");
  async function open(id: string) {
    setFailure("");
    try {
      const { download_url } = await portalFileUrl(id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFailure(errorMessage(error, t));
    }
  }
  return { open, failure };
}

function VisitCard({ visit }: { visit: PortalVisit }) {
  const { t } = useTranslation();
  const files = useOpenFile();
  const attention = visit.items.filter((item) => item.result === "attention_needed");
  const photos = visit.photos as unknown as PortalFile[];

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tnum text-cell font-medium">{toDisplay(visit.visit_date)}</span>
        <VisitStatusChip value={visit.status} />
      </div>
      {visit.technician_first_name && (
        <p className="text-help text-muted-foreground">{t("portal.lift.technician", { name: visit.technician_first_name })}</p>
      )}
      {attention.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {attention.map((item) => (
            <li key={item.item} className="flex items-center justify-between gap-2 text-help">
              <span>{enumLabel("visit.checklistItem", item.item)}</span>
              <ChecklistResultChip value={item.result} />
            </li>
          ))}
        </ul>
      ) : (
        visit.items.length > 0 && <p className="text-help text-muted-foreground">{t("portal.lift.allOk")}</p>
      )}
      {visit.parts_replaced && (
        <p className="text-help text-muted-foreground">{t("portal.lift.parts", { parts: visit.parts_replaced })}</p>
      )}
      {visit.items.length > 0 && (
        <details className="text-help">
          <summary className="cursor-pointer text-primary">{t("portal.lift.fullChecklist", { count: visit.items.length })}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {visit.items.map((item) => (
              <li key={item.item} className="flex items-center justify-between gap-2">
                <span>{enumLabel("visit.checklistItem", item.item)}</span>
                <ChecklistResultChip value={item.result} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <Button key={photo.id} size="sm" variant="secondary" onClick={() => void files.open(photo.id)}>
              <ImageIcon aria-hidden="true" />
              {t("portal.lift.photo", { index: index + 1 })}
            </Button>
          ))}
        </div>
      )}
      {files.failure && <p className="text-help text-destructive">{files.failure}</p>}
    </li>
  );
}

function InspectionCard({ inspection }: { inspection: PortalInspection }) {
  const { t } = useTranslation();
  const files = useOpenFile();
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <InspectionLabel value={inspection.label} />
          <span className="tnum text-cell">{toDisplay(inspection.inspected_on)}</span>
        </span>
        {inspection.report && (
          <Button size="sm" variant="secondary" onClick={() => void files.open(inspection.report as string)}>
            <FileDown aria-hidden="true" />
            {t("portal.lift.report")}
          </Button>
        )}
      </div>
      <p className="text-help text-muted-foreground">
        {[inspection.inspection_body, inspection.report_number].filter(Boolean).join(" · ") || "—"}
      </p>
      {inspection.nonconformities.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border-subtle pt-2">
          {inspection.nonconformities.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-help">
              <span className="min-w-0 break-words">{item.description}</span>
              <span className="text-muted-foreground">{enumLabel("inspection.nonconformityStatus", item.status)}</span>
            </li>
          ))}
        </ul>
      )}
      {files.failure && <p className="text-help text-destructive">{files.failure}</p>}
    </li>
  );
}
