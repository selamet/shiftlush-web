import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "@tanstack/react-router";
import { ExternalLink, FileDown, FileText, Loader2, Printer, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import {
  LABELS_PER_PAGE,
  MAX_LABELS,
  MAX_PAGE_SIZE,
  addContractElevators,
  contractKeys,
  contractListQuery,
  elevatorKeys,
  elevatorListQuery,
  fetchLabelPdf,
  updateElevator,
  type ElevatorRow,
  type ElevatorWrite,
  buildingListQuery,} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { prerequisiteMissing } from "@/lib/prerequisite";
import { registrationNumber } from "@/lib/elevator";
import { enumLabel } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useListSearch } from "@/lib/list-search";
import { elevatorFilters as filters } from "@/screens/list-searches";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";
import {
  ListPage,
  Stacked,
  type ListColumn,
  type ListSelection,
} from "@/components/list/ListPage";

/**
 * The statuses this screen will set on many elevators at once.
 *
 * Typed against the contract's own write enum, so the list cannot drift from
 * what the server accepts: `uncontracted` is not in that enum at all — it is
 * derived from whether an open contract line exists, only the contract service
 * writes it, and sending it is refused with `STATUS_NOT_USER_SELECTABLE`.
 *
 * `sealed` *is* writable, and is still deliberately absent here. It is a legal
 * state imposed by an inspection body, and the record it belongs to carries the
 * report number and the date that justify it. Offering it in a strip that acts
 * on forty rows would let one click assert forty inspection outcomes that never
 * happened; it stays on the elevator's own form, next to the fields that explain
 * it. Both exclusions are named on screen rather than silently dropped, because
 * a control that quietly offers three of five choices reads as a bug.
 */
const BULK_STATUSES = [
  "active",
  "suspended",
  "out_of_service",
] as const satisfies readonly NonNullable<ElevatorWrite["status"]>[];

/** A dropdown shows a handful of contracts; the searching happens on the server. */
const PICKER_PAGE_SIZE = 20;

/** Copied from QrLabelScreen: the parent owns the query, the picker owns the typing. */
function useDebounced(value: string, delay = 300): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * The reason one elevator was refused, in the user's language.
 *
 * The server answers a rejected write with a code and, where the fault belongs
 * to a field, a `details` entry carrying a more specific one. The specific code
 * is the useful sentence — `STATUS_NOT_USER_SELECTABLE` says what happened,
 * `VALIDATION_ERROR` does not — so it wins when there is a translation for it.
 */
function refusalReason(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    for (const detail of error.details) {
      if (!detail.code) continue;
      const message = t(`errors.${detail.code}`);
      if (message !== `errors.${detail.code}`) return message;
    }
  }
  return errorMessage(error, t);
}

interface Refusal {
  id: string;
  name: string;
  reason: string;
}

interface BulkOutcome {
  succeeded: number;
  refused: Refusal[];
}

/**
 * An outcome and the selection it is about.
 *
 * A report is a statement about a specific set of elevators. Ticking one more
 * row does not make it false — the writes happened — but it does stop it being
 * a statement about what the strip now says is selected. Discarding it would
 * throw away the only record of which lifts were refused, so it is kept and
 * marked instead.
 */
interface Report extends BulkOutcome {
  /** Which panel produced it. A contract result under the label heading is nonsense. */
  panel: Panel;
  /** Membership, not order: re-ticking a row someone unticked is the same set. */
  members: string;
  size: number;
}

/** The ids an action will act on, and the names to report them by. */
interface Resolved {
  ids: string[];
  named: Map<string, string>;
}

/**
 * A filter selection that grew past one page between enabling the button and
 * pressing it. Rare, and still worth its own sentence: "unexpected error" would
 * send someone looking for a fault when the answer is "narrow the filter".
 */
const NOT_ENUMERABLE = "selection-not-enumerable";

/**
 * Turns a selection into the elevators it means.
 *
 * Row mode already holds the ids. Filter mode deliberately does not: `ListPage`
 * hands over the query instead, because those ids were never fetched and a
 * client that pretends to know a set only the server can enumerate is the whole
 * bug this distinction exists to prevent. So they are asked for — once, at the
 * moment the button is pressed, which is also what stops the set drifting
 * between the screen and the write.
 *
 * One request, never a loop over pages. The server's page ceiling is the limit
 * on what a screen may enumerate at all, and paging around it to assemble four
 * thousand ids would be the client deciding by itself to make forty requests
 * before making four thousand more. Anything larger is refused before this is
 * reached; the check below covers the count having moved since.
 *
 * `staleTime: 0` is what makes "asked for at the moment the button is pressed"
 * true. `fetchQuery` returns cached data without a request while the entry is
 * fresh, and the client's default is thirty seconds — long enough that pressing
 * "generate" and then "apply" would write against the ids the sheet was drawn
 * from. Worse, at a hundred rows a page this key is *identical* to the one the
 * table itself is showing, so the whole resolution would collapse into re-reading
 * the page on screen, and the `total > results.length` guard below would be
 * comparing two numbers from that same stale snapshot.
 */
async function resolveSelection(
  selection: ListSelection,
  queryClient: QueryClient,
): Promise<Resolved | null> {
  if (selection.mode === "rows") {
    return { ids: selection.ids, named: new Map() };
  }

  const page = await queryClient.fetchQuery({
    ...elevatorListQuery({ ...selection.params, page: 1, page_size: MAX_PAGE_SIZE }),
    staleTime: 0,
  });
  // Fewer rows than the server says match means the set did not fit in one page.
  // Acting on the part that came back would quietly do a fraction of what was
  // asked and report it as the whole thing.
  if (page.pagination.total > page.results.length) return null;

  return {
    ids: page.results.map((row) => row.id),
    named: new Map(page.results.map((row) => [row.id, row.registration_number])),
  };
}

/**
 * Runs one request per elevator and keeps every answer.
 *
 * Sequential rather than parallel. There is no bulk endpoint, so this is N round
 * trips either way; firing them at once would put N writes against one contract
 * row in flight together and turn a queue into a race, and the progress count —
 * the only thing that makes a slow bulk action bearable — would tell the user
 * nothing about where it is.
 *
 * Nothing is thrown. A refusal partway through is an outcome to report, not a
 * reason to abandon the elevators after it: the caller asked for forty and is
 * owed an answer about forty.
 *
 * `stillWanted` is checked between elevators, and it is the only thing that can
 * stop the loop early. Clearing the selection takes the whole strip off the
 * screen — the report has nowhere left to be rendered — so carrying on would
 * mean writing to thirty more lifts with no way to tell anyone how it went.
 */
async function runPerElevator(
  ids: string[],
  nameOf: (id: string) => string,
  attempt: (id: string) => Promise<unknown>,
  onProgress: (done: number) => void,
  stillWanted: () => boolean,
  t: TFunction,
): Promise<BulkOutcome> {
  let succeeded = 0;
  const refused: Refusal[] = [];

  for (const [index, id] of ids.entries()) {
    if (!stillWanted()) break;
    try {
      await attempt(id);
      succeeded += 1;
    } catch (error) {
      refused.push({ id, name: nameOf(id), reason: refusalReason(error, t) });
    }
    onProgress(index + 1);
  }

  return { succeeded, refused };
}

/** The outcome, with every refusal named. "Some failed" is not an answer. */
function OutcomeReport({ report, current }: { report: Report; current: string }) {
  const { t } = useTranslation();
  const failed = report.refused.length;
  const stale = report.members !== current;

  const note = stale && (
    <p className="mt-1 text-help">{t("bulk.staleResult", { count: report.size })}</p>
  );

  if (failed === 0) {
    return (
      <Alert tone="success" block>
        {t("bulk.allSucceeded", { count: report.succeeded })}
        {note}
      </Alert>
    );
  }

  return (
    <Alert
      tone={report.succeeded > 0 ? "warning" : "error"}
      block
      title={
        report.succeeded > 0
          ? t("bulk.partial", { count: report.succeeded, failed })
          : t("bulk.noneSucceeded", { count: failed })
      }
    >
      <ul className="mt-1 flex flex-col gap-1">
        {report.refused.map((refusal) => (
          <li key={refusal.id} className="text-help">
            {/* The identifier first, because it is what the user matches against
                the row they ticked — and it is the whole point of listing them
                rather than counting them. */}
            <span className="font-mono tnum">{refusal.name}</span>
            <span className="text-muted-foreground"> — {refusal.reason}</span>
          </li>
        ))}
      </ul>
      {note}
    </Alert>
  );
}

type Panel = "labels" | "status" | "contract";

interface BulkActionsProps {
  /** Either the rows someone ticked, or the query behind "everything in the filter". */
  selection: ListSelection;
  /** Everything the current filter matches, for saying what a row selection is not. */
  filterTotal: number;
  /** Registration number for an id, including ids ticked on an earlier page. */
  nameOf: (id: string) => string;
}

/**
 * The three bulk actions, as a component rather than markup returned from
 * `bulkActions`.
 *
 * `ListPage` calls that prop as a plain function inside its own render, and only
 * when something is selected. Hooks written there would be hooks of `ListPage`,
 * appearing and disappearing with the selection — the classic way to corrupt
 * hook order. A component gets its own scope, mounts with the strip and unmounts
 * with it, which is also what revokes the object URL when the selection is
 * cleared.
 */
function ElevatorBulkActions({ selection, filterTotal, nameOf }: BulkActionsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const panelId = useId();

  const [panel, setPanel] = useState<Panel | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [running, setRunning] = useState(0);
  const [unresolved, setUnresolved] = useState(false);
  const [sheetDropped, setSheetDropped] = useState(false);
  /** A run that never got as far as writing anything. Already translated. */
  const [failure, setFailure] = useState("");
  /**
   * What a screen reader is told, kept apart from the progress line.
   *
   * The counter changes once per elevator; announcing each tick would be forty
   * interruptions for a run of forty. This holds two sentences instead — it
   * started, and how it went — in a region that is in the accessibility tree
   * from the first render, so the first message is announced rather than being
   * the insertion that creates the region.
   */
  const [announcement, setAnnouncement] = useState("");

  /** The three toggles, so closing a panel can hand focus back to the one that opened it. */
  const toggles = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});

  const [status, setStatus] = useState("");
  const [contractId, setContractId] = useState("");
  const [contractLabel, setContractLabel] = useState("");
  const [contractSearch, setContractSearch] = useState("");

  // Held in a ref as well as in state: the cleanup that revokes it runs on
  // unmount, when the state it closed over is whatever it was at the last
  // render, and revoking the wrong one leaks the right one.
  const [pdfUrl, setPdfUrl] = useState("");
  const pdfUrlRef = useRef("");

  const replacePdf = useCallback((blob: Blob | null) => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    const next = blob ? URL.createObjectURL(blob) : "";
    pdfUrlRef.current = next;
    setPdfUrl(next);
  }, []);

  useEffect(() => () => replacePdf(null), [replacePdf]);

  /**
   * One key per elevator, kept for as long as the strip is open.
   *
   * A key minted per attempt would make a second press of "add" look like a
   * second intention, which is exactly what the header exists to prevent: the
   * user who presses again because the first answer never arrived wants the
   * request they already made, not another line.
   */
  const keys = useRef(new Map<string, string>());
  const keyFor = useCallback((id: string) => {
    const existing = keys.current.get(id);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(id, minted);
    return minted;
  }, []);

  const count = selection.count;

  /**
   * Two signatures, because two things go stale for different reasons.
   *
   * `sheet` is order-sensitive: `fetchLabelPdf` prints the ids in the order it
   * is given them, so reordering really does describe a different document.
   * `members` is not: unticking a row and ticking it again puts it at the end of
   * the array, and a report that called itself out of date for that would be
   * lying about a set that never changed.
   */
  const members =
    selection.mode === "rows"
      ? `rows:${[...selection.ids].sort().join(",")}`
      : // The params alone identify a filter selection. The match count must
        // stay out: a successful run changes it — suspend forty active lifts
        // and "status=active" matches three — and a signature built on it would
        // stamp "the selection has changed" on the report describing the very
        // change that moved the number. ListPage already drops the selection
        // when the params themselves change.
        `filter:${JSON.stringify(selection.params)}`;
  const sheet =
    selection.mode === "rows" ? `rows:${selection.ids.join(",")}` : members;

  /**
   * The selection a sheet is being built for.
   *
   * The request takes as long as the server takes, and the user can tick a row
   * in the meantime. Without this, the blob arrives, `onSuccess` publishes it,
   * and a document built from the previous selection sits under a "ready"
   * heading — the one failure here that ends with the wrong sticker on a wall.
   */
  const pdfFor = useRef("");

  /** False from the moment the strip goes away, which is what stops a run mid-loop. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Refetching the list is what deletes the report, so it waits.
   *
   * In filter mode the strip's count *is* the number of matching rows, and
   * `ListPage` renders the strip only while that is above zero. Suspend every
   * active lift under a `status=active` filter and refreshing the list takes the
   * count to nought, which unmounts the strip — panel, report and all — the
   * instant before the person reads it. They are left with an empty table and no
   * word that anything happened, on the one action this feature exists for.
   *
   * So a filter run holds its refresh until the strip goes away on its own, and
   * says on screen that it is holding it. A row selection has no such problem —
   * its count does not move when the rows do — and refreshes immediately, which
   * is what someone watching those rows expects.
   */
  const deferred = useRef<QueryKey[]>([]);
  // The ref is what the unmount cleanup flushes; the flag is what the panel
  // renders. Reading the ref during render would work today and quietly stop
  // working the day something else moves.
  const [refreshHeld, setRefreshHeld] = useState(false);

  const flush = useCallback(() => {
    const keys = deferred.current;
    deferred.current = [];
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient]);
  useEffect(() => () => flush(), [flush]);

  const refresh = useCallback(
    async (keys: QueryKey[]) => {
      if (selection.mode === "filter") {
        deferred.current = keys;
        setRefreshHeld(true);
        return;
      }
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
    [selection.mode, queryClient],
  );

  const debouncedContractSearch = useDebounced(contractSearch);
  const contracts = useQuery({
    ...contractListQuery({
      search: debouncedContractSearch || undefined,
      page_size: PICKER_PAGE_SIZE,
    }),
    enabled: panel === "contract",
  });

  const contractOptions = (contracts.data?.results ?? []).map((contract) => ({
    value: contract.id,
    label: contract.contract_number,
    // The customer is what someone remembers about a contract whose number they
    // never learned, and it is also the check that stops an elevator being
    // attached to another firm's agreement — the server does not refuse that.
    hint: `${contract.customer_name} · ${enumLabel("contract.status", contract.status)}`,
  }));

  const pdf = useMutation({
    mutationFn: async () => {
      pdfFor.current = sheet;
      const resolved = await resolveSelection(selection, queryClient);
      // Surfaced through the same channel as a server refusal: from the user's
      // side "the sheet was not produced" is one outcome, not two.
      if (!resolved) throw new Error(NOT_ENUMERABLE);
      return fetchLabelPdf(resolved.ids);
    },
    onSuccess: (blob) => {
      // The selection moved while the server was drawing. Said out loud rather
      // than dropped in silence: the user waited for a sheet and is otherwise
      // just looking at the button they already pressed.
      if (pdfFor.current !== sheet) {
        setSheetDropped(true);
        return;
      }
      replacePdf(blob);
    },
  });

  // A finished sheet describes the selection it was made from, so changing the
  // selection has to drop it — along with any error about a request for a set
  // that is no longer on screen. A report is marked rather than discarded, since
  // nothing prints one by mistake (see `Report`).
  const { reset: resetPdf } = pdf;
  useEffect(() => {
    replacePdf(null);
    resetPdf();
    setSheetDropped(false);
    setUnresolved(false);
    setFailure("");
  }, [sheet, replacePdf, resetPdf]);

  /**
   * One run: resolve the selection, write each elevator, report the lot.
   *
   * The two actions differ only in the request they make per elevator, so they
   * share this. `running` is a counter rather than a boolean because the
   * resolution happens inside it too — the strip has to be disabled from the
   * click, not from the first write.
   *
   * `progress` holds the size of *this* run rather than the live selection
   * count. They part company the moment somebody unticks a row mid-run, and a
   * strip counting five processed out of three is worse than no progress line.
   */
  const run = useCallback(
    async (from: Panel, attempt: (id: string) => Promise<unknown>) => {
      const ranAgainst = members;
      setRunning((n) => n + 1);
      setUnresolved(false);
      setFailure("");
      setProgress({ done: 0, total: 0 });
      try {
        const resolved = await resolveSelection(selection, queryClient);
        if (!resolved) {
          // Not a report: nothing was written, so "0 records updated" under a
          // green heading would be an answer to a question nobody asked.
          setUnresolved(true);
          return false;
        }
        const size = resolved.ids.length;
        setProgress({ done: 0, total: size });
        setAnnouncement(t("bulk.started", { count: size }));

        const label = (id: string) => resolved.named.get(id) ?? nameOf(id);
        const outcome = await runPerElevator(
          resolved.ids,
          label,
          attempt,
          (done) => setProgress({ done, total: size }),
          () => mounted.current,
          t,
        );

        setReport({ ...outcome, panel: from, members: ranAgainst, size });
        setAnnouncement(
          outcome.refused.length === 0
            ? t("bulk.allSucceeded", { count: outcome.succeeded })
            : t("bulk.partial", { count: outcome.succeeded, failed: outcome.refused.length }),
        );
        return outcome.succeeded > 0;
      } catch (error) {
        // The only thing that reaches here is a failed id resolution —
        // `runPerElevator` keeps every per-elevator refusal. Nothing was
        // written, and without this the panel would return to looking exactly
        // as it did before the click. `fetchQuery` does not retry, so one
        // dropped connection is enough to land here.
        setFailure(errorMessage(error, t));
        return false;
      } finally {
        setRunning((n) => n - 1);
      }
    },
    [members, selection, queryClient, nameOf, t],
  );

  const changeStatus = useMutation({
    mutationFn: (next: (typeof BULK_STATUSES)[number]) =>
      run("status", (id) => updateElevator(id, { status: next })),
    onSuccess: async (wrote) => {
      if (wrote) await refresh([elevatorKeys.all]);
    },
  });

  const addToContract = useMutation({
    mutationFn: (target: string) =>
      /*
       * One elevator per request, deliberately.
       *
       * The endpoint takes a list, but `apps/contracts/services.add_elevators`
       * is `@transaction.atomic` and raises on the first elevator it refuses:
       * a list of forty containing one lift that is already covered adds none
       * of the forty and answers with a single ELEVATOR_ALREADY_CONTRACTED
       * naming none of them. One at a time is the only shape that can say
       * *which* was refused, and it lets the other thirty-nine through.
       *
       * The key is on the contract as well as the elevator, because it stands
       * for an intention rather than a record: "put this lift under contract A"
       * and "put it under B" are two of them, and one key for both would let
       * the second replay the first's answer and report a line never opened.
       *
       * No `unit_price`. Operations runs this screen and the server drops money
       * from that role's responses, so a price box here would be a field half
       * the users must not see.
       */
      run("contract", (id) =>
        addContractElevators(target, { elevator_ids: [id] }, keyFor(`${target}:${id}`)),
      ),
    onSuccess: async (wrote) => {
      // Adding a line moves an uncontracted lift to active and changes the
      // contract's monthly total, so both sides are stale.
      if (wrote) await refresh([elevatorKeys.all, contractKeys.all]);
    },
  });

  /**
   * True for the whole mutation, not just the loop.
   *
   * `running` drops in the `finally` around the writes, but v5 dispatches
   * `success` only after `onSuccess` — and `onSuccess` here awaits
   * `invalidateQueries`. Between those two moments the spinner is still painted
   * and the button would be live again: a second click during it re-sends every
   * add, and forty ELEVATOR_ALREADY_CONTRACTED replace the report that had just
   * said they worked.
   */
  const busy = running > 0 || changeStatus.isPending || addToContract.isPending;

  /**
   * A filter selection larger than one page cannot be acted on from here.
   *
   * Not a threshold picked for comfort: the server will not enumerate more than
   * this in one request, and with no bulk endpoint behind any of these actions
   * the alternative is the browser making four thousand writes it cannot make
   * atomic, cannot resume, and abandons half-done if the tab is closed. Saying
   * so is better than doing it.
   */
  const tooManyToEnumerate = selection.mode === "filter" && count > MAX_PAGE_SIZE;

  // Narrowed by lookup rather than cast: the picker hands back a plain string,
  // and an assertion here would be the one place a value the server refuses
  // could get through while still type-checking.
  const chosenStatus = BULK_STATUSES.find((value) => value === status);

  function open(next: Panel) {
    setPanel((current) => (current === next ? null : next));
  }

  /**
   * Closing from the X inside the panel removes the element holding focus, which
   * drops it to `<body>` and sends the next Tab back to the top of the page.
   * Handing it to the toggle puts the keyboard back where the panel came from.
   */
  function close(which: Panel) {
    setPanel(null);
    toggles.current[which]?.focus();
  }

  // A4 is a 3x4 grid. The blanks are the number the user has to see before the
  // paper comes out: the sheet is not padded by repeating a label, because a QR
  // code belongs to exactly one elevator.
  const sheets = Math.ceil(count / LABELS_PER_PAGE);
  const blanks = sheets * LABELS_PER_PAGE - count;
  const overLimit = count > MAX_LABELS;

  const cannotEnumerate = t("bulk.tooManyToEnumerate", { count, max: MAX_PAGE_SIZE });
  // A different sentence from the one above, because it is a different fact.
  // Here the count the client knows is necessarily under the ceiling — what
  // happened is that the set grew while the server was being asked for it, and
  // quoting the stale number back would read as a contradiction.
  const grewWhileReading = t("bulk.grewWhileReading", { max: MAX_PAGE_SIZE });

  function pdfError(error: unknown): string {
    if (error instanceof Error && error.message === NOT_ENUMERABLE) return grewWhileReading;
    if (error instanceof ApiError && error.status === 503) return t("qrLabels.pdfUnavailable");
    if (error instanceof ApiError && error.status === 404) return t("qrLabels.pdfEmpty");
    return errorMessage(error, t);
  }

  // Only the ceiling warning is panel-independent — it is a property of the
  // selection, true under every heading. Whatever a *run* produced belongs to
  // the panel that ran it, and is rendered down there with the report.
  const blocked = tooManyToEnumerate && (
    <Alert tone="warning" block>
      {cannotEnumerate}
    </Alert>
  );

  const runOutcome = (
    <>
      {unresolved && (
        <Alert tone="warning" block>
          {grewWhileReading}
        </Alert>
      )}
      {failure && (
        <Alert tone="error" block>
          {failure}
        </Alert>
      )}
      {!busy && report?.panel === panel && (
        <>
          <OutcomeReport report={report} current={members} />
          {refreshHeld && (
            <p className="text-help text-muted-foreground">{t("bulk.listRefreshesAfter")}</p>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      {/* Mounted from the first render so the first message is announced rather
          than being the insertion that creates the region. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Button
        ref={(node) => {
          toggles.current.labels = node;
        }}
        size="xs"
        variant={panel === "labels" ? "primary" : "secondary"}
        aria-expanded={panel === "labels"}
        aria-controls={panel === "labels" ? panelId : undefined}
        onClick={() => open("labels")}
      >
        <Printer />
        {t("qr.printSelected")}
      </Button>
      <Button
        ref={(node) => {
          toggles.current.status = node;
        }}
        size="xs"
        variant={panel === "status" ? "primary" : "secondary"}
        aria-expanded={panel === "status"}
        aria-controls={panel === "status" ? panelId : undefined}
        onClick={() => open("status")}
      >
        {t("list.changeStatus")}
      </Button>
      <Button
        ref={(node) => {
          toggles.current.contract = node;
        }}
        size="xs"
        variant={panel === "contract" ? "primary" : "secondary"}
        aria-expanded={panel === "contract"}
        aria-controls={panel === "contract" ? panelId : undefined}
        onClick={() => open("contract")}
      >
        {t("list.addToContract")}
      </Button>

      {/* Not a dialog: it would cover the rows the user is still checking, and
          the whole question here is "did I tick the right ones". `basis-full`
          takes the next line of the strip's wrapping flex row, and `order-last`
          keeps it below the strip's own controls rather than splitting them —
          this is rendered from the middle of that row and cannot be moved
          without editing ListPage, which owns it. */}
      {panel && (
        <div
          id={panelId}
          className="order-last basis-full rounded-md border border-border bg-card p-3"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-label">
                  {panel === "labels" && t("bulk.labels.title")}
                  {panel === "status" && t("bulk.status.title")}
                  {panel === "contract" && t("bulk.contract.title")}
                </h2>
                {/* The distinction ListPage draws in its type, restated where the
                    action is taken. The two are not the same question, and "how
                    many will this touch" has a different answer for each. */}
                <p className="text-help text-muted-foreground">
                  {selection.mode === "rows"
                    ? t("bulk.appliesToRows", { count, total: filterTotal })
                    : t("bulk.appliesToFilter", { count })}
                </p>
              </div>
              <Button
                size="iconXs"
                variant="ghost"
                onClick={() => close(panel)}
                aria-label={t("common.close")}
              >
                <X />
              </Button>
            </div>

            {blocked}

            {panel === "labels" && !tooManyToEnumerate && (
              <>
                <p className="text-help text-muted-foreground">
                  {t("bulk.labels.plan", { count, sheets, blanks })}
                </p>
                {blanks > 0 && (
                  <Alert tone="info" block>
                    {t("qrLabels.emptyCellsStayEmpty")}
                  </Alert>
                )}
                {overLimit && (
                  <Alert tone="warning" block>
                    {t("qrLabels.limitReached", { count: MAX_LABELS })}
                  </Alert>
                )}
                {pdf.isError && (
                  <Alert tone="error" block>
                    {pdfError(pdf.error)}
                  </Alert>
                )}

                {pdfUrl ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-label text-success">{t("qrLabels.ready")}</span>
                    {/* Both ways out, because neither can be assumed: a download
                        started from script is blocked in a sandboxed frame, and a
                        tab opened after an await has lost the user's gesture and
                        reads as a popup. A link carries the gesture. */}
                    <a
                      href={pdfUrl}
                      download="qr-etiketleri.pdf"
                      className={cn(buttonVariants({ variant: "secondary", size: "xs" }))}
                    >
                      <FileDown />
                      {t("qrLabels.downloadPdf")}
                    </a>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
                    >
                      <ExternalLink />
                      {t("qrLabels.openPdf")}
                    </a>
                  </div>
                ) : (
                  <div>
                    <Button
                      size="xs"
                      disabled={overLimit || pdf.isPending}
                      onClick={() => pdf.mutate()}
                    >
                      {pdf.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
                      {pdf.isPending ? t("qrLabels.generating") : t("qrLabels.generate")}
                    </Button>
                  </div>
                )}
                <p className="text-help text-subtle">{t("qrLabels.serverRenders")}</p>
                {runOutcome}
              </>
            )}

            {panel === "status" && !tooManyToEnumerate && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-56">
                    <span className="text-help text-muted-foreground">
                      {t("bulk.status.newStatus")}
                    </span>
                    <SearchableSelect
                      options={BULK_STATUSES.map((value) => ({
                        value,
                        label: enumLabel("elevator.status", value),
                      }))}
                      value={status}
                      onChange={setStatus}
                      placeholder={t("bulk.status.newStatus")}
                      disabled={busy}
                    />
                  </label>
                  <Button
                    size="xs"
                    disabled={!chosenStatus || busy}
                    onClick={() => chosenStatus && changeStatus.mutate(chosenStatus)}
                  >
                    {changeStatus.isPending && <Loader2 className="animate-spin" />}
                    {t("bulk.apply")}
                  </Button>
                </div>
                <p className="text-help text-muted-foreground">{t("bulk.status.sealedExcluded")}</p>
                <p className="text-help text-muted-foreground">
                  {t("bulk.status.uncontractedExcluded")}
                </p>
                <p className="text-help text-subtle">{t("bulk.oneRequestEach", { count })}</p>
              </>
            )}

            {panel === "contract" && !tooManyToEnumerate && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-72">
                    <span className="text-help text-muted-foreground">{t("contract.singular")}</span>
                    <SearchableSelect
                      options={contractOptions}
                      value={contractId}
                      selectedLabel={contractLabel}
                      onChange={(value) => {
                        setContractId(value);
                        // The option list moves on as soon as the next search
                        // runs, and the chosen row is usually not in it, so the
                        // label it was chosen by has to be kept here.
                        setContractLabel(
                          contractOptions.find((option) => option.value === value)?.label ?? "",
                        );
                      }}
                      onSearchChange={setContractSearch}
                      loading={contracts.isFetching}
                      placeholder={t("bulk.contract.searchHint")}
                      disabled={busy}
                    />
                  </label>
                  <Button
                    size="xs"
                    disabled={!contractId || busy}
                    onClick={() => addToContract.mutate(contractId)}
                  >
                    {addToContract.isPending && <Loader2 className="animate-spin" />}
                    {t("bulk.apply")}
                  </Button>
                </div>
                <p className="text-help text-muted-foreground">
                  {t("bulk.contract.oneContractOnly")}
                </p>
                {/* Operations runs this screen and the server hides money from
                    that role, so a price box here would be a field half the users
                    must not see. Lines go in unpriced and are priced on the
                    contract, which already shows an unpriced line as zero rather
                    than hiding it. */}
                <p className="text-help text-muted-foreground">{t("bulk.contract.noPrice")}</p>
                <p className="text-help text-subtle">{t("bulk.oneRequestEach", { count })}</p>
              </>
            )}

            {/* The counter itself carries no live role — it changes once per
                elevator, and a screen reader would read all forty. The region
                below says the two things worth interrupting for. */}
            {busy && progress.total > 0 && (
              <p className="tnum text-help text-muted-foreground">
                {t("bulk.running", { done: progress.done, total: progress.total })}
              </p>
            )}
            {sheetDropped && (
              <Alert tone="info" block>
                {t("bulk.sheetDropped")}
              </Alert>
            )}
            {/* Only under the panel that produced it: a contract result read as
                a claim about the label sheet is a different statement. */}
            {panel !== "labels" && runOutcome}
          </div>
        </div>
      )}
    </>
  );
}

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
 * horizontal scroll. Which of them are on screen is now the reader's to
 * choose — the seven are the starting point, not the whole offer.
 */
export function ElevatorListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const readOnly = role === "technician";
  const list = useListSearch(filters);

  // The technician sees the elevators of the customers assigned to them; that
  // narrowing is the server's, decided by their token.
  const query = useQuery(elevatorListQuery(list.params));

  // Whether the parent record exists only matters when this list is empty, so
  // that is the only time the question is asked -- and one row answers it.
  const listIsEmpty =
    !query.isPending && !query.isError && (query.data?.results.length ?? 0) === 0;
  const parents = useQuery({ ...buildingListQuery({ page_size: 1 }), enabled: listIsEmpty });
  const missingParent = prerequisiteMissing(parents, listIsEmpty);
  const rows = query.data?.results ?? [];
  const total = query.data?.pagination.total ?? 0;

  /**
   * Registration numbers for rows that have been on screen.
   *
   * A row selection does not survive paging — `useSelection` drops it whenever
   * the params change and `page` is one of them — so in practice the rows being
   * reported on are the ones on screen. This is the fallback for the cases where
   * that does not hold: a row refused after the list refetched underneath it, and
   * anything a future change to the selection rules lets through. A failure list
   * that shows a UUID tells the user nothing they can act on. Kept in a ref
   * because it is a lookup, not state: filling it must not schedule a render.
   */
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    // Keyed on the page rather than on `rows`, which is a fresh `[]` on every
    // render while the first page is still in flight.
    for (const row of query.data?.results ?? []) {
      seen.current.set(row.id, row.registration_number);
    }
  }, [query.data]);
  const nameOf = useCallback((id: string) => seen.current.get(id) ?? id, []);

  const columns: ListColumn<ElevatorRow>[] = [
    {
      key: "elevator.fields.registrationNumber",
      sticky: true,
      cell: (row) => (
        <Link to="/elevators/$id" params={{ id: row.id }} className="hover:underline">
          {/* The building rides along here below md, where its own column drops. */}
          <span className="flex flex-col leading-tight">
            {/* Nothing identifying about a lift is required, so this can be
                empty — and an anchor with no text is a row that cannot be
                opened. Saying the number is missing is both true and clickable. */}
            {registrationNumber(row) ? (
              <span className="font-mono tnum text-cell">{registrationNumber(row)}</span>
            ) : (
              <span className="text-cell text-muted-foreground italic">
                {t("elevator.hints.registrationMissing")}
              </span>
            )}
            <span className="truncate text-help text-muted-foreground md:hidden">
              {row.building_name}
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
      cell: (row) => <Stacked primary={row.building_name} secondary={row.customer_name} />,
    },
    {
      key: "elevator.fields.status",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <ElevatorStatusChip value={row.status} />
          {/* A serious non-conformity at inspection, so it is surfaced in the
              row rather than buried among 31 record fields. */}
          {!row.has_car_door && (
            <span className="inline-flex items-center gap-1 px-2 text-help text-warning">
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
      cell: (row) => <Stacked primary={row.brand || "—"} secondary={row.model} />,
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="elevator.title"
      primaryActionKey={readOnly ? undefined : "elevator.add"}
      primaryActionTo={readOnly ? undefined : "/elevators/new"}
      state={list}
      searchable
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      total={total}
      loading={query.isPending}
      error={
        query.isError
          ? {
              message: errorMessage(query.error, t),
              reference: supportReference(query.error),
              onRetry: () => void query.refetch(),
            }
          : undefined
      }
      selectable={!readOnly}
      bulkActions={(selection) => (
        <ElevatorBulkActions selection={selection} filterTotal={total} nameOf={nameOf} />
      )}
      emptyTitleKey="empty.noElevators"
      prerequisite={{ labelKey: "building.add", to: "/buildings", missing: missingParent }}
    />
  );
}
