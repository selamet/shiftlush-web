import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { visitAttachmentsQuery, visitKeys, visitQuery, type MaintenanceVisit } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { formatDateTime } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CHECKLIST_ITEMS, attentionCount, canReadVisits } from "@/lib/visit";
import type { Role } from "@/components/layout/nav-config";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { ChecklistResultChip, VisitStatusChip } from "@/components/ui/status-chip";
import { VisitsRestricted } from "@/components/visits/VisitsRestricted";

/**
 * Who may add a photo to this visit.
 *
 * The office roles may add to any visit. A technician may add to their own and
 * no one else's — a photo is evidence attached to a statement, and it belongs
 * to the person who made the statement. Mirrors the server's rule; the server
 * still decides, and a refusal is shown as it explained it.
 */
function canAddPhotos(role: Role | null, userId: string | null, visit: MaintenanceVisit) {
  if (role === "owner" || role === "admin" || role === "operations") return true;
  return role === "technician" && userId !== null && visit.technician === userId;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-4 md:p-5">
      <h2 className="mb-2 text-cardtitle">{title}</h2>
      {children}
    </section>
  );
}

/** Free text as the technician typed it, line breaks kept; a dash when nothing was. */
function Prose({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-body text-subtle">—</p>;
  return <p className="whitespace-pre-wrap break-words text-body">{text}</p>;
}

/**
 * One recorded visit: what was found, what was done, and the photos.
 *
 * Read-only for everyone. Correcting a visit is an owner's or admin's act on
 * the server and no screen offers it yet; until one does, a page with no edit
 * control is the honest one.
 *
 * Also where a visit's photos are retried. The form sends them after the visit
 * exists, and a photo that failed there — a dropped connection in a machine
 * room — is added again here, against a record that is already safe.
 */
export function VisitDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role, userId } = useSession();
  const visitId = id ?? "";
  const canRead = canReadVisits(role);

  const query = useQuery({ ...visitQuery(visitId), enabled: canRead && Boolean(visitId) });
  const photos = useQuery({
    ...visitAttachmentsQuery(visitId),
    enabled: canRead && Boolean(visitId),
  });

  if (!canRead) return <VisitsRestricted />;
  if (query.isPending) return <DetailSkeleton />;
  if (query.isError || !query.data) {
    return (
      <ListError
        message={errorMessage(query.error, t)}
        reference={supportReference(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const visit = query.data;
  const answers = new Map(visit.items.map((item) => [item.item, item]));
  const attention = attentionCount(visit.items);
  // Rows in the checklist's own order, then anything the server sent that this
  // client does not know yet — shown under its raw code rather than dropped,
  // so a newer API's seventeenth item is still on the record.
  const known = new Set<string>(CHECKLIST_ITEMS);
  const rows = [
    ...CHECKLIST_ITEMS.flatMap((item) => answers.get(item) ?? []),
    ...visit.items.filter((item) => !known.has(item.item)),
  ];

  const facts: Array<[string, React.ReactNode]> = [
    [t("visit.fields.visitDate"), <span className="tnum">{toDisplay(visit.visit_date)}</span>],
    [t("visit.fields.technician"), visit.technician_name || "—"],
    [t("visit.fields.status"), <VisitStatusChip value={visit.status} />],
    [
      t("visit.fields.checked"),
      <span className="tnum">
        {t("visit.answeredCount", { answered: visit.items.length, total: CHECKLIST_ITEMS.length })}
      </span>,
    ],
    [t("visit.fields.recordedAt"), <span className="tnum">{formatDateTime(visit.created_at)}</span>],
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/maintenance-visits" className="hover:underline">
            {t("visit.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <Link to="/elevators/$id" params={{ id: visit.elevator }} className="hover:underline">
            {visit.elevator_name}
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-title">
            {t("visit.detailTitle", { date: toDisplay(visit.visit_date) })}
          </h1>
          <VisitStatusChip value={visit.status} />
        </div>
        <Link
          to="/elevators/$id"
          params={{ id: visit.elevator }}
          className="self-start text-body text-primary hover:underline"
        >
          {visit.elevator_name}
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 bg-card p-3">
            <span className="text-help text-muted-foreground">{label}</span>
            <span className="text-body">{value}</span>
          </div>
        ))}
      </section>

      {/* The reason a visit did not go to plan is the first thing anyone opening
          it needs, so it sits above the checklist rather than among the notes. */}
      {visit.status !== "completed" && (
        <Section title={t("visit.fields.statusNote")}>
          <Prose text={visit.status_note} />
        </Section>
      )}

      <Section title={t("visit.checklist")}>
        {attention > 0 && (
          <p className="mb-2 flex items-center gap-1.5 text-body text-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {t("visit.attentionSummary", { count: attention })}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-body text-subtle">{t("visit.checklistEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => {
              const flagged = row.result === "attention_needed";
              return (
                <li
                  key={row.id}
                  className={cn(
                    "flex flex-col gap-1 border-b border-border-subtle py-2.5 last:border-0",
                    // The rows somebody has to act on, marked the way the form
                    // marked them while they were being answered.
                    flagged && "-mx-2 rounded-md border-l-[3px] border-l-warning bg-warning-bg/40 px-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-cell", flagged && "font-medium")}>
                      {enumLabel("visit.checklistItem", row.item)}
                    </span>
                    <ChecklistResultChip value={row.result} />
                  </div>
                  {row.note?.trim() && (
                    <p className="whitespace-pre-wrap break-words text-help text-muted-foreground">
                      {row.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t("visit.fields.workNotes")}>
        <Prose text={visit.work_notes} />
      </Section>

      <Section title={t("visit.fields.partsReplaced")}>
        <Prose text={visit.parts_replaced} />
      </Section>

      <Section title={t("visit.photos")}>
        <AttachmentsPanel
          objectType="maintenance_visit"
          objectId={visit.id}
          attachments={photos.data?.results ?? []}
          invalidateKey={visitKeys.attachments(visit.id)}
          canWrite={canAddPhotos(role, userId, visit)}
          // A visit holds photos and nothing else; a "which sort of document"
          // picker here would be a question with one right answer.
          fixedCategory="photo"
        />
      </Section>
    </div>
  );
}
