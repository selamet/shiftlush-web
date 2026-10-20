import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ChevronRight, Loader2, TriangleAlert, X } from "lucide-react";
import {
  createVisit,
  elevatorKeys,
  elevatorQuery,
  visitKeys,
  visitTechniciansQuery,
  type Elevator,
  type MaintenanceVisit,
  type MaintenanceVisitWrite,
} from "@/api/queries";
import type { MaintenanceVisitStatus } from "@/api/enums";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { toDisplay, todayIso } from "@/lib/date";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { uploadAttachment, uploadRefusal } from "@/lib/upload";
import { cn } from "@/lib/utils";
import {
  MAX_VISIT_PHOTOS,
  VISIT_STATUSES,
  buildVisitBody,
  canRecordVisits,
  firstUnanswered,
  submitBlocker,
  type Checklist,
} from "@/lib/visit";
import { describeUploadFailure } from "@/components/attachments/AttachmentsPanel";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Segmented } from "@/components/ui/segmented";
import { ChecklistField, checklistInputId } from "@/components/visits/ChecklistField";
import { VisitsRestricted } from "@/components/visits/VisitsRestricted";

/**
 * Photo types the form takes. The server's list minus PDF: this picker opens
 * the camera, and a PDF is not a photo of anything.
 */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Fields this form draws. A server error naming any other has to be said at the top. */
const DRAWN_FIELDS = new Set(["technician", "status", "status_note", "work_notes", "parts_replaced"]);

interface Photo {
  id: string;
  file: File;
  /** An object URL for the thumbnail; revoked when the photo leaves. */
  preview: string;
  /** Minted per photo and kept across its retries — one file, one intention. */
  idempotencyKey: string;
  state: "waiting" | "sending" | "sent" | "failed";
  error?: string;
}

/**
 * Recording a maintenance visit against one elevator.
 *
 * Mobile first and one column at every width, because the person filling it in
 * is standing next to the lift: phone in one hand, gloves on, often in a dim
 * machine room. Everything is a large target, the checklist is answered with
 * the thumb, and the save button sits at the bottom of the screen where that
 * thumb already is.
 *
 * This screen only decides whether the form can be drawn at all — the role,
 * the record, the contract. The form itself is below, mounted once those are
 * settled, so its idempotency key and its date are minted exactly once for
 * exactly one visit.
 */
export function VisitFormScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();
  const elevatorId = id ?? "";
  const allowed = canRecordVisits(role);

  const query = useQuery({ ...elevatorQuery(elevatorId), enabled: allowed && Boolean(elevatorId) });

  if (!allowed) return <VisitsRestricted />;
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

  const elevator = query.data;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/elevators" className="hover:underline">
            {t("elevator.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <Link to="/elevators/$id" params={{ id: elevator.id }} className="hover:underline">
            {elevator.name}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{t("visit.record")}</span>
        </nav>
        <h1 className="text-title">{t("visit.record")}</h1>
        <p className="flex flex-wrap items-center gap-x-2 text-help text-muted-foreground">
          <span className="text-body text-foreground">{elevator.name}</span>
          <span className="font-mono tnum">{elevator.registration_number}</span>
          <span>·</span>
          <span>{elevator.building_name}</span>
        </p>
      </div>

      {elevator.current_contract ? (
        <VisitForm elevator={elevator} contractId={elevator.current_contract.id} />
      ) : (
        // Reached by a stale link or a contract that ended since the elevator
        // page was opened. Said plainly, with the way back, instead of a form
        // the server will refuse at the end.
        <div className="flex flex-col gap-3">
          <Alert tone="warning" title={t("visit.noContract")} />
          <Link
            to="/elevators/$id"
            params={{ id: elevator.id }}
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "self-start")}
          >
            {t("visit.backToElevator")}
          </Link>
        </div>
      )}
    </div>
  );
}

function VisitForm({ elevator, contractId }: { elevator: Elevator; contractId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, fullName } = useSession();
  const idempotencyKey = useIdempotencyKey();
  // Today where the technician is standing, fixed when the form opens. Not
  // re-read at submit: a form opened at 23:55 and sent at 00:05 records the
  // visit on the day it happened, and a retry after midnight must send the
  // same body the first attempt did or the idempotency key no longer matches.
  const [visitDate] = useState(() => todayIso());

  const [status, setStatus] = useState<MaintenanceVisitStatus>("completed");
  const [checklist, setChecklist] = useState<Checklist>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoNotice, setPhotoNotice] = useState<string[]>([]);
  const [saved, setSaved] = useState<MaintenanceVisit | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  // Revoked on the way out. Each preview holds the decoded photo in memory, and
  // four phone photos are tens of megabytes on a device that has little to spare.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const held = previews.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
    };
  }, []);

  // Every office role names the technician; a technician is the technician.
  // The list is not asked for on their phone, where it would be a request for
  // a picker that is never drawn.
  const namesTechnician = role !== "technician";
  const technicians = useQuery({ ...visitTechniciansQuery(), enabled: namesTechnician });

  const { submit, state } = useSubmit<MaintenanceVisitWrite, MaintenanceVisit>({
    mutationFn: (body) => createVisit(body, idempotencyKey),
    // The elevator as well as the visits: the server moves its maintenance
    // dates on every completed visit, and the page this form returns to shows
    // them.
    invalidate: [visitKeys.all, elevatorKeys.detail(elevator.id)],
    onSuccess: (visit) => {
      setSaved(visit);
      void sendPhotos(visit, photos);
    },
  });

  function patchPhoto(id: string, patch: Partial<Photo>) {
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));
  }

  /**
   * The photos, one at a time, after the visit exists.
   *
   * After, because a photo has to be attached to a record and until the create
   * answers there is none. One at a time, because the connection this runs on
   * is the worst one anybody using the product has, and four transfers sharing
   * it means four slow failures instead of one.
   *
   * A failure here never touches the visit. It is already saved; what failed
   * is a file, and the screen says which one and offers to send it again.
   */
  async function sendPhotos(visit: MaintenanceVisit, queue: Photo[]) {
    let failed = 0;
    for (const photo of queue) {
      if (photo.state === "sent") continue;
      patchPhoto(photo.id, { state: "sending", error: undefined });
      try {
        await uploadAttachment({
          objectType: "maintenance_visit",
          objectId: visit.id,
          category: "photo",
          file: photo.file,
          idempotencyKey: photo.idempotencyKey,
        });
        patchPhoto(photo.id, { state: "sent" });
      } catch (error) {
        failed += 1;
        patchPhoto(photo.id, { state: "failed", error: describeUploadFailure(error, t) });
      }
    }
    if (queue.length > 0) {
      await queryClient.invalidateQueries({ queryKey: visitKeys.attachments(visit.id) });
    }
    // Everything arrived: on to the record, which is the confirmation that it
    // exists. Anything missing keeps the person here, with the files still in
    // memory, until they retry or choose to leave without them.
    if (failed === 0) void navigate({ to: "/maintenance-visits/$id", params: { id: visit.id } });
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const notices: string[] = [];
    const room = MAX_VISIT_PHOTOS - photos.length;
    const added: Photo[] = [];
    for (const file of Array.from(files)) {
      const refusal = uploadRefusal(file, PHOTO_TYPES);
      if (refusal) {
        notices.push(
          `${file.name}: ${refusal === "type" ? t("visit.photoType") : t("visit.photoTooLarge")}`,
        );
        continue;
      }
      if (added.length >= room) {
        notices.push(t("visit.photoLimit", { count: MAX_VISIT_PHOTOS }));
        break;
      }
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      added.push({
        id: crypto.randomUUID(),
        file,
        preview,
        idempotencyKey: crypto.randomUUID(),
        state: "waiting",
      });
    }
    setPhotos((current) => [...current, ...added]);
    setPhotoNotice(notices);
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.preview);
    previews.current.delete(photo.preview);
    setPhotos((current) => current.filter((one) => one.id !== photo.id));
    setPhotoNotice([]);
  }

  function goToFirstUnanswered() {
    const item = firstUnanswered(checklist);
    if (!item) return;
    const input = document.getElementById(checklistInputId(item));
    // Focus moves the keyboard and the screen reader there; the scroll is for
    // the sighted thumb, centred so the row is not hidden under the sticky bar.
    input?.focus({ preventScroll: true });
    input?.closest("li")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (saved) {
    return (
      <SavedState
        visit={saved}
        elevatorId={elevator.id}
        photos={photos}
        onRetry={() => void sendPhotos(saved, photos)}
      />
    );
  }

  const blocker = submitBlocker(status, checklist);
  // The server's refusal wins; failing that, a list that never arrived is said
  // where the empty picker is rather than left to look like a firm with no
  // technicians.
  const technicianError =
    state.fields.technician ??
    (technicians.isError ? errorMessage(technicians.error, t) : undefined);
  const needsReason = status !== "completed";
  // Errors on fields this form does not draw — the elevator, the contract, the
  // date, or the technician when a technician is signed in. Left to the field
  // map they would be shown nowhere and the form would simply refuse.
  const orphaned = Object.entries(state.fields)
    .filter(([field]) => !DRAWN_FIELDS.has(field) || (field === "technician" && !namesTechnician))
    .map(([, message]) => message);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocker || state.pending) return;
        const values = formValues(event.currentTarget);
        submit(
          buildVisitBody({
            elevatorId: elevator.id,
            contractId,
            role,
            technicianId: values.technician,
            visitDate,
            status,
            statusNote: values.status_note,
            workNotes: values.work_notes,
            partsReplaced: values.parts_replaced,
            checklist,
          }),
        );
      }}
    >
      {(state.message || orphaned.length > 0) && (
        <Alert tone="error" block title={state.message || orphaned[0]}>
          {state.message && orphaned.length > 0 && <p>{orphaned.join(" ")}</p>}
          {!state.message && orphaned.length > 1 && <p>{orphaned.slice(1).join(" ")}</p>}
          {state.reference && (
            <p className="text-help">
              {t("errors.requestIdLabel")}: <span className="font-mono">{state.reference}</span>
            </p>
          )}
        </Alert>
      )}

      {/* The facts the form fills in by itself, shown so nobody has to wonder
          which day or which contract this will be recorded against. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle">
        <div className="flex flex-col gap-0.5 bg-card p-3">
          <dt className="text-help text-muted-foreground">{t("visit.fields.visitDate")}</dt>
          <dd className="tnum text-body">{toDisplay(visitDate)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 bg-card p-3">
          <dt className="text-help text-muted-foreground">{t("visit.fields.contract")}</dt>
          <dd className="font-mono tnum text-body">
            {elevator.current_contract?.contract_number}
          </dd>
        </div>
        {!namesTechnician && (
          <div className="col-span-2 flex flex-col gap-0.5 bg-card p-3">
            <dt className="text-help text-muted-foreground">{t("visit.fields.technician")}</dt>
            <dd className="text-body">{fullName}</dd>
          </div>
        )}
      </dl>

      {namesTechnician && (
        <Field
          label={t("visit.fields.technician")}
          htmlFor="visit-technician"
          required
          error={technicianError}
          bindChild={false}
        >
          <SearchableSelect
            id="visit-technician"
            name="technician"
            required
            disabled={technicians.isPending}
            invalid={Boolean(technicianError)}
            placeholder={t("visit.selectTechnician")}
            aria-describedby={technicianError ? "visit-technician-error" : undefined}
            options={(technicians.data ?? []).map((technician) => ({
              value: technician.id,
              label: technician.name,
            }))}
          />
        </Field>
      )}

      <div className="flex flex-col gap-2">
        <Segmented
          name="status"
          label={t("visit.fields.status")}
          options={VISIT_STATUSES.map((value) => ({
            value,
            label: enumLabel("visit.status", value),
          }))}
          value={status}
          onChange={setStatus}
        />
        {state.fields.status && <p className="text-help text-destructive">{state.fields.status}</p>}
      </div>

      {needsReason && (
        <Field
          label={t("visit.fields.statusNote")}
          htmlFor="visit-status-note"
          required
          hint={
            status === "access_denied"
              ? t("visit.statusNoteHintDenied")
              : t("visit.statusNoteHint")
          }
          error={state.fields.status_note}
        >
          <Textarea
            name="status_note"
            required
            rows={3}
            invalid={Boolean(state.fields.status_note)}
          />
        </Field>
      )}

      <ChecklistField checklist={checklist} onChange={setChecklist} required={!needsReason} />

      <Field label={t("visit.fields.workNotes")} htmlFor="visit-work-notes" error={state.fields.work_notes}>
        <Textarea name="work_notes" rows={3} invalid={Boolean(state.fields.work_notes)} />
      </Field>

      <Field
        label={t("visit.fields.partsReplaced")}
        htmlFor="visit-parts"
        hint={t("visit.partsReplacedHint")}
        error={state.fields.parts_replaced}
      >
        <Textarea name="parts_replaced" rows={2} invalid={Boolean(state.fields.parts_replaced)} />
      </Field>

      <section className="flex flex-col gap-2" aria-labelledby="visit-photos-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="visit-photos-title" className="text-cardtitle">
            {t("visit.photos")}
            <span className="ml-2 text-help font-normal text-muted-foreground">
              {t("common.optional")}
            </span>
          </h2>
          <span className="tnum text-help text-muted-foreground">
            {photos.length}/{MAX_VISIT_PHOTOS}
          </span>
        </div>
        {/* `capture` asks a phone for the rear camera rather than the gallery,
            which is where a photo of a worn rope comes from. A desktop browser
            ignores it and opens the file picker. */}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => {
            addPhotos(event.target.files);
            // Cleared so the same photo chosen twice still fires a change.
            event.target.value = "";
          }}
        />
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={photo.id} className="relative overflow-hidden rounded-md border border-border">
                <img
                  src={photo.preview}
                  alt={t("visit.photoAlt", { index: index + 1 })}
                  className="aspect-square w-full object-cover"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label={t("visit.removePhoto", { index: index + 1 })}
                  className="absolute right-1 top-1 h-control-lg w-control-lg pointer-coarse:h-control-lg pointer-coarse:w-control-lg"
                  onClick={() => removePhoto(photo)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_VISIT_PHOTOS && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="self-start"
            onClick={() => photoInput.current?.click()}
          >
            <Camera aria-hidden="true" />
            {t("visit.addPhoto")}
          </Button>
        )}
        {photoNotice.map((notice) => (
          <p key={notice} className="text-help text-destructive">
            {notice}
          </p>
        ))}
        <p className="text-help text-muted-foreground">{t("visit.photosHint")}</p>
      </section>

      {/* Pinned to the bottom of a phone screen, where the thumb is, and with
          the reason it is not live yet right above it — a disabled button that
          does not say why is a form that looks broken. */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-card p-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        {blocker && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-help text-muted-foreground">
            <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span>{t("visit.checklistIncomplete", { count: blocker.missing })}</span>
            <Button type="button" variant="link" size="xs" onClick={goToFirstUnanswered}>
              {t("visit.goToFirstUnanswered")}
            </Button>
          </p>
        )}
        <Button
          type="submit"
          size="xl"
          className="w-full md:w-auto md:self-start"
          disabled={Boolean(blocker) || state.pending}
        >
          {state.pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {state.pending ? t("common.saving") : t("visit.save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * After the visit is saved: the photos on their way, and what to do if one
 * did not make it.
 *
 * The form is gone by now, on purpose — the visit exists, and a second press of
 * "save" has nothing left to do. What is left is the files, which are still in
 * memory here and nowhere else, so this is the one place a failed photo can be
 * retried without taking it again.
 */
function SavedState({
  visit,
  elevatorId,
  photos,
  onRetry,
}: {
  visit: MaintenanceVisit;
  elevatorId: string;
  photos: Photo[];
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const sending = photos.some((photo) => photo.state === "sending" || photo.state === "waiting");
  const failed = photos.filter((photo) => photo.state === "failed");

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="success" block title={t("visit.saved")}>
        {photos.length > 0 && sending && <p>{t("visit.photosSending")}</p>}
      </Alert>

      {photos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="flex items-center gap-3 rounded-md border border-border-subtle bg-card p-2"
            >
              <img
                src={photo.preview}
                alt={t("visit.photoAlt", { index: index + 1 })}
                className="size-12 shrink-0 rounded-sm object-cover"
              />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-cell">{photo.file.name}</span>
                <span
                  className={cn(
                    "text-help",
                    photo.state === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {photo.state === "failed" ? photo.error : t(`visit.photoState.${photo.state}`)}
                </span>
              </div>
              {photo.state === "sending" && (
                <Loader2 className="ml-auto size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
              {photo.state === "sent" && (
                <CheckCircle2 className="ml-auto size-4 shrink-0 text-success" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}

      {failed.length > 0 && !sending && (
        <Alert tone="warning" block title={t("visit.photosFailed", { count: failed.length })}>
          <p>{t("visit.photosFailedHint")}</p>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {failed.length > 0 && !sending && (
          <Button type="button" size="lg" onClick={onRetry}>
            {t("visit.retryPhotos")}
          </Button>
        )}
        <Link
          to="/maintenance-visits/$id"
          params={{ id: visit.id }}
          className={buttonVariants({ variant: failed.length > 0 ? "secondary" : "primary", size: "lg" })}
        >
          {t("visit.openSaved")}
        </Link>
        <Link
          to="/elevators/$id"
          params={{ id: elevatorId }}
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          {t("visit.backToElevator")}
        </Link>
      </div>
    </div>
  );
}
