import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Ban,
  RefreshCw,
  Lock,
  Pencil,
  Plus,
  Download,
  Unlink,
} from "lucide-react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addContractElevators,
  closeContractLine,
  contractKeys,
  contractQuery,
  elevatorListQuery,
  renewContract,
  terminateContract,
  type Contract as ContractRecord,
  type ContractLine,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import {
  buildingNames,
  closedLines,
  daysUntil,
  openLines,
  proposedRenewal,
  reminderDate,
  vatUnstated,
} from "@/lib/contract";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/date";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { elevatorLabel } from "@/lib/elevator";
import { useSession } from "@/lib/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { ContractStatusChip, StatusChip } from "@/components/ui/status-chip";
import { Alert } from "@/components/ui/alert";


function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="shrink-0 text-help text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-cell break-words">{value ?? "—"}</span>
    </div>
  );
}

/**
 * A VAT-derived amount, or the reason there is not one.
 *
 * `formatMoney(null)` is the empty string, which is a fair answer to "render
 * nothing" and the wrong thing to leave in a money column. A blank is what a
 * half-loaded screen looks like, so a reader slides past it on the way to a
 * number they trust and never learns that this contract has no VAT rate on it.
 * The reason takes the cell instead, and takes it in muted type so it reads as
 * an explanation rather than as a figure.
 *
 * Only `unset` gets this treatment. Zero-rated has an amount — zero — and it is
 * printed like any other, because it is a decision somebody made and not a gap.
 */
function VatFigure({
  contract,
  amount,
}: {
  contract: Pick<ContractRecord, "vat_status" | "currency">;
  amount: string | null;
}) {
  const { t } = useTranslation();
  if (vatUnstated(contract)) {
    return (
      <span className="text-muted-foreground">{t("contractDetail.vatUnstatedAmount")}</span>
    );
  }
  return <span className="tnum">{formatMoney(amount, contract.currency)}</span>;
}

function Card({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-cardtitle">{title}</h2>
        {meta}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * How a section the role cannot see is rendered.
 *
 * Three options were weighed. Leaving the fields blank reads as missing data —
 * in this product most fields are optional, so an empty one already means "not
 * entered", and operations staff would try to complete a contract that is
 * actually complete. A lock icon on every row is noise on a screen someone
 * looks at all day, and the financial block has five rows, the technical one
 * five more. Showing nothing at all fails to tell the user the section exists.
 *
 * So the section is removed and replaced by one neutral line. The user learns
 * the section exists and why it is not theirs, but not how many fields it has
 * or what they are called — the field names are themselves a small leak. Read
 * once, then the eye skips it.
 */
function HiddenSection({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <h2 className="mb-2 text-cardtitle text-muted-foreground">{title}</h2>
      <p className="flex items-start gap-2 text-help text-subtle">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {note}
      </p>
    </section>
  );
}

/**
 * The billing lines as a spreadsheet, assembled in the browser.
 *
 * There is no export endpoint and this does not need one: every value in the
 * file is already on the page, and turning rows the user is looking at into a
 * file is formatting, not a server capability.
 *
 * Two details here are not cosmetic. The separator is a semicolon, because a
 * Turkish-locale Excel reads a comma as a decimal mark and opens a
 * comma-separated file as a single column of text. And the byte-order mark is
 * what tells Excel the file is UTF-8 — without it every heading on this screen
 * arrives as mojibake, which for a Turkish product is most of them.
 */
const BYTE_ORDER_MARK = "\uFEFF";

function toCsv(rows: string[][]): string {
  const escape = (cell: string) =>
    /[";\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const body = rows.map((row) => row.map(escape).join(";")).join("\r\n");
  return `${BYTE_ORDER_MARK}${body}\r\n`;
}

/**
 * Money for a Turkish spreadsheet cell: "1250.00" becomes "1250,00".
 *
 * A character is replaced in the string. The amount is never parsed into a
 * Number and never re-formatted from one, so the digits in the cell are the
 * digits the server sent — which is the whole reason the API sends money as a
 * string in the first place.
 */
function decimalComma(amount: string | null | undefined): string {
  return (amount ?? "").replace(".", ",");
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ContractDetailScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"terminate" | "renew" | null>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");

  /* Closed lines are collapsed by default and their count is stated whether or
     not they are showing, so the record never looks shorter than it is. */
  const [showClosed, setShowClosed] = useState(false);

  /* The line the user has asked to close, held until the confirmation is
     answered. Naming it `closing` rather than `deleting` is deliberate: what
     this does is fill in `removed_at`. */
  const [closing, setClosing] = useState<ContractLine | null>(null);
  const [closeError, setCloseError] = useState("");
  const [closePending, setClosePending] = useState(false);

  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);
  const [elevatorSearch, setElevatorSearch] = useState("");
  const [unitPrice, setUnitPrice] = useState("");

  /**
   * One key per intention, not one per mount and not one per attempt.
   *
   * `useIdempotencyKey` mints a key when a form mounts, which is right for a
   * screen that submits once. This panel stays open and adds several lifts in a
   * row, and a single key would make the second add a replay of the first — the
   * server would answer with the earlier result and the second elevator would
   * never be added. So the key is re-minted when the panel opens and after each
   * success, and deliberately kept across a failure: a retry of the same tap is
   * the same intention, which is the case the header exists for.
   */
  const [addKey, setAddKey] = useState(() => crypto.randomUUID());

  const query = useQuery({ ...contractQuery(id ?? ""), enabled: Boolean(id) });

  /* A contract belongs to a customer, so the elevators that may join it are
     that customer's. Searched on the server rather than filtered here: a firm
     with a thousand lifts must not download them to pick one. Asked for only
     while the panel is open — every other visit to this screen has no use for
     the list. */
  const customerId = query.data?.customer_id ?? "";
  const candidates = useQuery({
    ...elevatorListQuery({ customer: customerId, search: elevatorSearch, page_size: 20 }),
    enabled: adding && Boolean(customerId),
  });

  /* Already covered by *this* contract, on a line that is still open. A closed
     line does not count: that elevator is free again, and the spec's partial
     unique index is keyed on `removed_at IS NULL` for exactly that reason. */
  const coveredElevatorIds = useMemo(
    () => new Set(openLines({ lines: query.data?.lines ?? [] }).map((line) => line.elevator_id)),
    [query.data],
  );

  const elevatorOptions = useMemo<SearchableOption[]>(
    () =>
      (candidates.data?.results ?? [])
        .filter((row) => !coveredElevatorIds.has(row.id))
        .map((row) => ({
          value: row.id,
          label: row.name || row.registration_number,
          hint: [row.registration_number, row.building_name].filter(Boolean).join(" · "),
        })),
    [candidates.data, coveredElevatorIds],
  );

  const add = useSubmit<
    { elevator_ids: string[]; unit_price?: string },
    ContractRecord
  >({
    mutationFn: (body) => addContractElevators(id as string, body, addKey),
    invalidate: [contractKeys.all],
    onSuccess: () => {
      // The panel stays open: putting a building's lifts on a contract is four
      // or five of these in a row, and the row appearing in the table below is
      // the confirmation. The price stays too — a per-elevator contract prices
      // every lift the same, and the value is visible in its own input rather
      // than hidden state.
      setPicked(null);
      setElevatorSearch("");
      setAddKey(crypto.randomUUID());
    },
  });

  const terminate = useSubmit<{ reason: string }, ContractRecord>({
    mutationFn: ({ reason }) =>
      terminateContract(id as string, new Date().toISOString().slice(0, 10), reason),
    invalidate: [contractKeys.all],
    onSuccess: () => setDialog(null),
  });

  const renew = useSubmit<{ start_date: string; end_date: string }, ContractRecord>({
    mutationFn: (body) => renewContract(id as string, body),
    invalidate: [contractKeys.all],
    onSuccess: (successor) => {
      setDialog(null);
      void navigate({ to: "/contracts/$id", params: { id: successor.id } });
    },
  });

  /**
   * Takes an elevator off the contract — which fills in `removed_at`, and is
   * not a delete however the HTTP verb reads.
   *
   * Shaped like the other confirmed actions here: the dialog closes first and a
   * failure lands as a sentence on the card, not inside a dialog that is no
   * longer on screen. The likeliest failure is a conflict — somebody else
   * closed the same line while this page was open — which is a fact about the
   * record rather than about a field, so it needs no field to sit next to.
   */
  async function closeLine(line: ContractLine) {
    setClosing(null);
    setCloseError("");
    setClosePending(true);
    try {
      await closeContractLine(id as string, line.elevator_id);
      await queryClient.invalidateQueries({ queryKey: contractKeys.all });
      // The row does not leave the screen: it moves to the closed half, and the
      // closed half is opened so the user sees it land there. A removal that
      // makes a row vanish is indistinguishable from a deletion, which is
      // exactly the wrong thing to teach about this record.
      setShowClosed(true);
    } catch (error) {
      setCloseError(errorMessage(error, t));
    } finally {
      setClosePending(false);
    }
  }

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

  const contract = query.data;
  const lines = openLines(contract);
  /* Not leftovers and not tombstones: each of these is a period the contract
     really covered and really billed for. Spec 5.12 says the relation is never
     deleted when it ends — `removed_at` is filled in and the history is kept. */
  const closed = closedLines(contract);
  const buildings = buildingNames(contract);
  const daysToEnd = daysUntil(contract.end_date);
  const reminder = reminderDate(contract);
  const proposal = proposedRenewal(contract);

  // The server omits the money for roles that may not see it, so its absence
  // is the permission. The role checks below decide layout, not access.
  const canSeeFinancials = "monthly_total" in contract;
  const canSeeTechnical = role !== "accountant";
  const canWrite = role === "owner" || role === "admin" || role === "operations";
  const isAccountant = role === "accountant";
  /* Nobody has stated a rate, so the server refused to invent a total. Read
     once because three places on this screen turn on it, and never confused
     with a rate of zero — see `vatUnstated`. Meaningless without the money, so
     it is only ever consulted inside `canSeeFinancials`. */
  const noVatRate = canSeeFinancials && vatUnstated(contract);

  /* Open lines first, then the closed ones underneath when they are asked for.
     They are one table rather than two, because they are one register: a lift
     that came off in June and one still running are the same kind of fact
     about this contract, distinguished by a date and not by a filing cabinet. */
  const shownLines = showClosed ? [...lines, ...closed] : lines;

  /**
   * The contract's lines as a file.
   *
   * Every line goes in, closed ones included — a spreadsheet quietly missing
   * the rows that were collapsed on screen is the kind of export that gets
   * reconciled against and believed.
   *
   * The money column exists only when the payload has money in it. That is the
   * same test the table uses and the same test the server's own omission
   * implies; there is no second role rule here.
   */
  function exportLines() {
    const header = [
      t("elevator.fields.registrationNumber"),
      t("contract.fields.addedAt"),
      t("contract.fields.removedAt"),
      t("contractDetail.lineStatus"),
      ...(canSeeFinancials ? [t("contract.fields.unitPrice")] : []),
    ];
    const rows = (contract.lines ?? []).map((line) => [
      line.registration_number,
      formatDate(line.added_at),
      formatDate(line.removed_at),
      line.removed_at ? t("contractDetail.closed") : t("contractDetail.ongoing"),
      ...(canSeeFinancials ? [decimalComma(line.unit_price)] : []),
    ]);
    downloadText(
      `${contract.contract_number}-${t("contractDetail.exportFileSuffix")}.csv`,
      toCsv([header, ...rows]),
    );
  }

  /* ---------------------------------------------------------------- blocks */

  const infoRows = isAccountant
    ? // Accounting's job on this screen is the amount, not the scope or the
      // renewal notice — so the contract block shrinks to four fields.
      (["customer", "scope", "startDate", "endDate"] as const)
    : (["customer", "scope", "startDate", "endDate", "autoRenew", "renewalNoticeDays"] as const);

  const infoBlock = (
    <Card title={t("contractDetail.info")}>
      <div className="flex flex-col">
        {infoRows.map((key) => {
          const value =
            key === "customer" ? (
              <Link to="/customers/$id" params={{ id: contract.customer_id }} className="text-primary hover:underline">
                {contract.customer_name}
              </Link>
            ) : key === "scope" ? (
              enumLabel("contract.scope", contract.scope)
            ) : key === "startDate" ? (
              formatDate(contract.start_date)
            ) : key === "endDate" ? (
              formatDate(contract.end_date)
            ) : key === "autoRenew" ? (
              contract.auto_renew ? (
                t("common.yes")
              ) : (
                t("common.no")
              )
            ) : (
              contract.renewal_notice_days
            );
          return <Row key={key} label={t(`contract.fields.${key}`)} value={value} />;
        })}
        {!isAccountant && (
          <>
            <Row label={t("contract.fields.previousContract")} value={contract.previous_contract_number} />
          </>
        )}
      </div>
    </Card>
  );

  const financialsBlock = canSeeFinancials ? (
    <Card title={t("contractDetail.financials")}>
      <div className="flex flex-col">
        <Row
          label={t("contract.fields.pricingType")}
          value={enumLabel("contract.pricingType", contract.pricing_type)}
        />
        <Row
          label={t("contract.fields.monthlyFee")}
          value={formatMoney(contract.monthly_fee, contract.currency)}
        />
        <Row
          label={t("contract.fields.vatRate")}
          value={
            noVatRate ? (
              <span className="text-muted-foreground">{t("contractDetail.vatUnstatedValue")}</span>
            ) : contract.vat_status === "zero_rated" ? (
              // Stated, and stated as nothing. The chip is what stops "%0" from
              // reading as a box somebody forgot to fill in — the two look
              // identical without it, and only one of them is finished.
              <span className="inline-flex items-center gap-2">
                <span className="tnum">{formatPercent(contract.vat_rate)}</span>
                <StatusChip weight="recessed">{t("contractDetail.vatZeroRated")}</StatusChip>
              </span>
            ) : (
              formatPercent(contract.vat_rate)
            )
          }
        />
        {/* Both of these are null whenever the rate is, which is the whole
            reason they are rendered through VatFigure rather than formatMoney. */}
        <Row
          label={t("contract.fields.vatAmount")}
          value={<VatFigure contract={contract} amount={contract.vat_amount} />}
        />
        <Row
          label={t("contract.fields.monthlyTotal")}
          value={<VatFigure contract={contract} amount={contract.monthly_total} />}
        />
        <Row
          label={t("contract.fields.billingPeriod")}
          value={enumLabel("contract.billingPeriod", contract.billing_period)}
        />
      </div>
      {noVatRate && (
        <Alert
          tone="warning"
          block
          className="mt-3"
          title={t("contractDetail.vatUnstatedTitle")}
        >
          <p className="text-help">
            {canWrite
              ? t("contractDetail.vatUnstatedBody")
              : t("contractDetail.vatUnstatedBodyReadOnly")}
          </p>
        </Alert>
      )}
    </Card>
  ) : null;

  /* The same component with a different column set per role, never a column
     left blank: operations has no unit-price column at all, and accounting has
     no elevator name or building. */
  const elevatorBlock = canSeeTechnical ? (
    <Card
      title={t("contractDetail.coveredElevators")}
      meta={
        <>
          <span className="text-help text-muted-foreground">
            {t("contractDetail.recordCount", { count: lines.length })}
          </span>
          {/* Stated whether or not the closed rows are showing. A count that
              only appeared once you expanded the section would mean the record
              looked complete while half of it was out of sight. */}
          {closed.length > 0 && (
            <StatusChip weight="recessed">
              {t("contractDetail.closedCount", { count: closed.length })}
            </StatusChip>
          )}
        </>
      }
      action={
        canWrite && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              setAdding(true);
              setAddKey(crypto.randomUUID());
            }}
          >
            <Plus />
            {t("contractDetail.addElevator")}
          </Button>
        )
      }
    >
      {adding && canWrite && (
        <div className="mb-3 flex flex-col gap-3 rounded-md border border-border-subtle bg-muted p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-label">{t("contractDetail.addPanelTitle")}</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setPicked(null);
                setElevatorSearch("");
                setUnitPrice("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-start">
            <Field
              label={t("contractDetail.pickElevator")}
              htmlFor="add-elevator"
              error={add.state.fields.elevator_ids}
              bindChild={false}
            >
              <SearchableSelect
                id="add-elevator"
                options={elevatorOptions}
                value={picked?.id ?? ""}
                selectedLabel={picked?.label}
                onChange={(value) => {
                  const option = elevatorOptions.find((candidate) => candidate.value === value);
                  setPicked(option ? { id: value, label: option.label } : null);
                }}
                onSearchChange={setElevatorSearch}
                loading={candidates.isPending}
                invalid={Boolean(add.state.fields.elevator_ids)}
                placeholder={t("contractDetail.pickElevator")}
                emptyLabel={t("contractDetail.noSelectableElevators")}
              />
            </Field>

            {/* The price is money, so the input exists only where money does.
                Sent as the string that was typed: the server owns the format,
                and turning it into a Number here to "check" it is how the last
                two decimal places of a contract go missing. */}
            {canSeeFinancials && (
              <Field
                label={t("contract.fields.unitPrice")}
                htmlFor="add-unit-price"
                hint={t("contractDetail.unitPriceHint")}
                error={add.state.fields.unit_price}
              >
                <Input
                  id="add-unit-price"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                  invalid={Boolean(add.state.fields.unit_price)}
                  className="tnum"
                />
              </Field>
            )}

            <Button
              size="md"
              className="sm:mt-6"
              disabled={!picked || add.state.pending}
              onClick={() =>
                picked &&
                add.submit({
                  elevator_ids: [picked.id],
                  // Omitted rather than sent empty: a blank field means the
                  // user did not set a price, not that the price is nothing.
                  ...(unitPrice.trim() ? { unit_price: unitPrice.trim() } : {}),
                })
              }
            >
              {add.state.pending ? t("common.saving") : t("common.add")}
            </Button>
          </div>

          <p className="text-help text-muted-foreground">
            {t("contractDetail.addScopeNote", { customer: contract.customer_name })}
          </p>
          {/* Stated, not enforced here. Whether a lift is already on somebody
              else's contract is decided by a partial unique index in the
              database (spec 5.12), and the `uncontracted` status that would let
              the browser guess is denormalised and known to drift. So the rule
              is explained and the refusal is left to the server. */}
          <p className="text-help text-muted-foreground">
            {t("contractDetail.addOneContractNote")}
          </p>
          {add.state.message && (
            <p className="text-help text-destructive">{add.state.message}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-cell">
          <thead>
            <tr className="border-b border-border">
              {[
                t("elevator.fields.registrationNumber"),
                t("elevator.singular"),
                t("building.singular"),
                t("contract.fields.addedAt"),
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="h-8 px-2 text-left text-colhead uppercase text-muted-foreground whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
              {canSeeFinancials && (
                <th
                  scope="col"
                  className="h-8 px-2 text-right text-colhead uppercase text-muted-foreground whitespace-nowrap"
                >
                  {t("contract.fields.unitPrice")}
                </th>
              )}
              {canWrite && (
                <th
                  scope="col"
                  className="h-8 px-2 text-right text-colhead uppercase text-muted-foreground whitespace-nowrap"
                >
                  {t("common.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shownLines.map((elevator) => (
              <tr
                // The line's own id, not the elevator's registration number: an
                // elevator that came off in March and went back on in June has
                // two lines and one number, and keying on the number would make
                // React treat the second as a re-render of the first.
                key={elevator.id}
                className={cn(
                  "h-control-md border-b border-border-subtle last:border-0",
                  elevator.removed_at && "text-muted-foreground",
                )}
              >
                <td className="px-2 font-mono tnum whitespace-nowrap">
                  <Link
                    to="/elevators/$id"
                    params={{ id: elevator.elevator_id }}
                    className="text-primary hover:underline"
                  >
                    {/* A lift with neither number nor name would otherwise be a
                        line nobody can open. */}
                    {elevatorLabel(elevator) ?? t("elevator.hints.registrationMissing")}
                  </Link>
                </td>
                <td className="px-2">
                  <div className="flex flex-col leading-tight">
                    {/* The line carries the elevator's name and nothing about
                        its operational state. That belongs on the elevator, and
                        fetching every lift to draw a chip here would be a query
                        per contract for a fact this screen is not about. */}
                    <span>{elevator.elevator_name || elevator.registration_number}</span>
                  </div>
                </td>
                <td className="px-2">{elevator.building_name}</td>
                <td className="px-2 tnum whitespace-nowrap">
                  {elevator.removed_at ? (
                    /* Both dates, not just the closing one. The row is a period
                       the contract covered, and a period needs two ends. */
                    <span className="flex flex-col leading-tight">
                      <StatusChip weight="recessed">{t("contractDetail.removed")}</StatusChip>
                      <span className="text-help">
                        {formatDate(elevator.added_at)} – {formatDate(elevator.removed_at)}
                      </span>
                    </span>
                  ) : (
                    formatDate(elevator.added_at)
                  )}
                </td>
                {canSeeFinancials && (
                  <td className="px-2 tnum text-right whitespace-nowrap">
                    {formatMoney(elevator.unit_price)}
                  </td>
                )}
                {canWrite && (
                  <td className="px-2 text-right whitespace-nowrap">
                    {/* Offered per row, because "remove an elevator" is a
                        question about one elevator and a header button cannot
                        say which. A closed line has nothing left to close.

                        Ghost, not destructive, and an unlink rather than a bin:
                        the icon is the first thing read and a bin would say the
                        record is about to be thrown away. */}
                    {!elevator.removed_at && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={closePending}
                        onClick={() => setClosing(elevator)}
                      >
                        <Unlink />
                        {t("contractDetail.removeElevator")}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {closeError && <p className="mt-3 text-help text-destructive">{closeError}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-help text-muted-foreground">{t("contractDetail.removedNote")}</p>
          {closed.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowClosed((on) => !on)}>
              {showClosed ? <ChevronUp /> : <ChevronDown />}
              {showClosed ? t("contractDetail.hideClosed") : t("contractDetail.showClosed")}
            </Button>
          )}
        </div>
        <span className="tnum text-help text-muted-foreground">
          {canSeeFinancials
            ? `${t("contractDetail.subtotal")} ${formatMoney(contract.monthly_subtotal)}`
            : t("contractDetail.amountHiddenForRole")}
        </span>
      </div>
    </Card>
  ) : (
    /* Accounting gets billing lines, not a technical register. */
    <Card
      title={t("contractDetail.lineItems")}
      meta={
        <>
          <span className="text-help text-muted-foreground">
            {t("contractDetail.itemCount", { count: lines.length })}
          </span>
          {closed.length > 0 && (
            <StatusChip weight="recessed">
              {t("contractDetail.closedCount", { count: closed.length })}
            </StatusChip>
          )}
          <StatusChip weight="dashed">{t("contractDetail.readOnly")}</StatusChip>
        </>
      }
      action={
        <Button size="xs" variant="secondary" onClick={exportLines}>
          <Download />
          {t("list.export")}
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-cell">
          <thead>
            <tr className="border-b border-border">
              {[
                t("elevator.fields.registrationNumber"),
                t("contractDetail.period"),
                t("contract.fields.unitPrice"),
                t("contractDetail.vatIncluded"),
              ].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "h-8 px-2 text-colhead uppercase text-muted-foreground whitespace-nowrap",
                    index >= 2 ? "text-right" : "text-left",
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownLines.map((elevator) => (
              <tr
                key={elevator.id}
                className={cn(
                  "h-control-md border-b border-border-subtle last:border-0",
                  elevator.removed_at && "text-muted-foreground",
                )}
              >
                <td className="px-2 font-mono tnum whitespace-nowrap">
                  {elevator.registration_number}
                </td>
                <td className="px-2 tnum whitespace-nowrap">
                  {formatDate(elevator.added_at)} —{" "}
                  {elevator.removed_at ? (
                    <>
                      {formatDate(elevator.removed_at)}{" "}
                      <span className="text-muted-foreground">
                        ({t("contractDetail.closed")})
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("contractDetail.ongoing")}</span>
                  )}
                </td>
                {/* VAT is stated once, on the contract total. Per line it would
                    be the same rate applied over and over, and rounding it per
                    line then adding them up does not reach the same number. */}
                <td className="px-2 tnum text-right">{formatMoney(elevator.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* The subtotal underneath is the current monthly figure, which is the
              open lines only. So closed periods stay collapsed by default and
              the totals keep meaning what they say — but they are one click
              away, and the export carries them whether or not they are open. */}
          {closed.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowClosed((on) => !on)}>
              {showClosed ? <ChevronUp /> : <ChevronDown />}
              {showClosed ? t("contractDetail.hideClosed") : t("contractDetail.showClosed")}
            </Button>
          )}
          <p className="text-help text-muted-foreground">{t("contractDetail.exportNote")}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-4 tnum text-help">
          <span className="text-muted-foreground">
            {t("contractDetail.subtotal")} {formatMoney(contract.monthly_subtotal)}
          </span>
          {/* The VAT-inclusive figure, which is `monthly_total` — it used to be
              the subtotal printed under a label saying VAT was in it, which is
              the same number short by the tax. When no rate was stated the
              server sends null rather than repeating the subtotal, and the
              reason takes the place of the amount so the gap is visible on the
              one screen whose whole job is the money. */}
          <span className="font-medium">
            {noVatRate
              ? t("contractDetail.vatUnstatedTotal")
              : t("contractDetail.vatIncludedMonthly", {
                  amount: formatMoney(contract.monthly_total, contract.currency),
                })}
          </span>
        </div>
      </div>
    </Card>
  );

  /* ------------------------------------------------------------------ view */

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/contracts" className="hover:underline">
              {t("contract.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="font-mono text-foreground">{contract.contract_number}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title font-mono tnum">{contract.contract_number}</h1>
            <ContractStatusChip value={contract.status} />
          </div>
          <p className="text-help text-muted-foreground">{contract.customer_name}</p>
        </div>

        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog("renew")}>
              <RefreshCw />
              {t("contract.actions.renew")}
            </Button>
            {/* The form screen and its route already exist; this was the only
                thing missing. A link rather than a button so the address is
                real: middle-click, bookmark and back all work. */}
            <Link
              to="/contracts/$id/edit"
              params={{ id: contract.id }}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Pencil />
              {t("common.edit")}
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {/* Role changes the order, not just the visibility: accounting leads
              with the money because that is its business on this screen. */}
          {isAccountant ? (
            <>
              {financialsBlock}
              {infoBlock}
            </>
          ) : (
            <>
              {infoBlock}
              {canSeeFinancials ? (
                financialsBlock
              ) : (
                <HiddenSection
                  title={t("contractDetail.financials")}
                  note={t("contractDetail.hiddenFinancials")}
                />
              )}
            </>
          )}
          {elevatorBlock}
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border-subtle bg-card p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-cardtitle tnum">
                {t("contractDetail.elevatorCount", { count: lines.length })}
              </span>
              {canSeeFinancials && (
                <span className="tnum text-body text-muted-foreground">
                  {t("contractDetail.monthlyAmount", {
                    amount: formatMoney(contract.monthly_subtotal),
                  })}
                </span>
              )}
              <span className="text-help text-muted-foreground">
                {t("contractDetail.daysToEnd", { count: daysToEnd ?? 0 })}
              </span>
              {contract.auto_renew && (
                <span className="text-help text-muted-foreground">
                  {t("contractDetail.autoRenewOn")} ·{" "}
                  {t("contractDetail.reminderOn", { date: formatDate(reminder ?? "") })}
                </span>
              )}
            </div>
            {canWrite ? (
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setDialog("renew")}>
                {t("contractDetail.renewNow")}
              </Button>
            ) : (
              <p className="mt-3 flex items-start gap-2 text-help text-subtle">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t("contractDetail.hiddenActions")}
              </p>
            )}
          </section>

          {canWrite && (
            <section className="rounded-lg border-l-[3px] border-destructive bg-destructive-bg p-4">
              <p className="text-label text-destructive">
                {t("contractDetail.terminateIrreversible")}
              </p>
              <p className="mt-1 text-help text-destructive">
                {t("contractDetail.terminateSummary", { count: lines.length })}
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setDialog("terminate")}
              >
                <Ban />
                {t("contract.actions.terminate")}
              </Button>
            </section>
          )}
        </div>
      </div>

      {/* Taking an elevator off the contract.

          Heavy, because the effects are real — billing stops, the lift falls to
          "uncontracted", and there is no undo that restores this line. But
          every one of the named consequences says what actually happens, and
          the first two say it plainly: the row is closed and kept, and the
          months it was covered for stay covered. Nothing here is called a
          delete, and the confirm button says "take out of scope". */}
      <ConfirmDialog
        open={closing !== null}
        weight="heavy"
        title={t("contractDetail.closeLineTitle")}
        body={t("contractDetail.closeLineBody", {
          name: closing?.elevator_name || closing?.registration_number || "",
          registration: closing?.registration_number ?? "",
        })}
        consequences={[
          t("contractDetail.closeLineEffectHistory"),
          t("contractDetail.closeLineEffectInvoiced"),
          t("contractDetail.closeLineEffectUncontracted"),
          // Named only when the payload carries money, and only when this line
          // has a price of its own. The amount is the server's string handed
          // straight to the formatter — nothing is subtracted from anything.
          ...(canSeeFinancials && closing?.unit_price
            ? [
                t("contractDetail.closeLineEffectBilling", {
                  amount: formatMoney(closing.unit_price, contract.currency),
                }),
              ]
            : []),
          t("contractDetail.closeLineEffectReadd"),
        ]}
        confirmLabel={t("contractDetail.closeLineConfirm")}
        onConfirm={() => closing && void closeLine(closing)}
        onCancel={() => setClosing(null)}
      />

      {/* Termination: the weight comes from three separate channels — the
          consequences are counted in real numbers, the reason is mandatory and
          goes to the audit log, and the button stays disabled until the user
          types the contract number, which forces them to look at the record.
          The phrase "are you sure" appears nowhere. */}
      {dialog === "terminate" && (
        <Modal
          open
          onClose={() => setDialog(null)}
          role="alertdialog"
          label={t("contractDetail.terminateTitle")}
          className="max-w-lg"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-cardtitle">{t("contractDetail.terminateTitle")}</h2>
            <span className="text-help text-destructive">
              {t("contractDetail.terminateIrreversible")}
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-md border-l-[3px] border-destructive bg-destructive-bg px-3 py-3">
            <span className="text-label text-destructive">
              {t("contractDetail.terminateHeading")}
            </span>
            <ul className="flex flex-col gap-1.5 text-help text-destructive">
              <li>{t("contractDetail.terminateEffectElevators", { count: lines.length })}</li>
              <li>
                {t("contractDetail.terminateEffectBuildings", { count: buildings.length })}{" "}
                ({buildings.join(", ")})
              </li>
              <li>
                {t("contractDetail.terminateEffectRevenue", {
                  amount: formatMoney(contract.monthly_subtotal),
                })}
              </li>
              <li>{t("contractDetail.terminateEffectReminder")}</li>
              <li>{t("contractDetail.terminateEffectHistory")}</li>
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("contractDetail.terminationDate")} htmlFor="tr-date">
              {/* Today, read from the reader's own clock. The date it used to
                  open on was the day this dialogue was written. */}
              <DatePicker defaultValue={todayIso()} />
            </Field>
            <Field
              label={t("contractDetail.terminationReason")}
              htmlFor="tr-reason"
              required
              hint={t("contractDetail.terminationReasonRequired")}
              bindChild={false}
            >
              {/* Free text rather than a list. This is what the audit trail
                  is read for a year later, and five canned options cannot say
                  why this particular contract ended. */}
              <Input
                id="tr-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("contractDetail.terminationReasonPlaceholder")}
              />
            </Field>
          </div>

          <Field label={t("contractDetail.typeNumberToConfirm")} htmlFor="tr-confirm">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={contract.contract_number}
              className="font-mono tnum"
            />
          </Field>

          {terminate.state.message && (
            <p className="text-help text-destructive">{terminate.state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={
                typed.trim() !== contract.contract_number ||
                !reason.trim() ||
                terminate.state.pending
              }
              onClick={() => terminate.submit({ reason: reason.trim() })}
            >
              {terminate.state.pending ? t("common.saving") : t("contract.actions.terminate")}
            </Button>
          </div>
        </Modal>
      )}

      {/* Renewal uses none of that: no red, no counted consequences, no
          type-to-confirm. Its result is a draft, so it is reversible. */}
      {dialog === "renew" && (
        <Modal
          open
          onClose={() => setDialog(null)}
          label={t("contractDetail.renewTitle")}
          className="max-w-md"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-cardtitle">{t("contractDetail.renewTitle")}</h2>
            <p className="text-help text-muted-foreground">
              {t("contractDetail.renewBody", { number: contract.contract_number })}
            </p>
          </div>

          <div className="flex flex-col">
            <Row
              label={t("contractDetail.renewNewNumber")}
              value={
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono tnum">{t("contractDetail.numberOnRenewal")}</span>
                  <ContractStatusChip value="draft" />
                </span>
              }
            />
            <Row
              label={t("contractDetail.renewNewStart")}
              value={formatDate(proposal?.start ?? "")}
            />
            <Row label={t("contractDetail.renewNewEnd")} value={formatDate(proposal?.end ?? "")} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" defaultChecked className="size-4 rounded-xs accent-primary" />
              {t("contractDetail.renewCarryElevators", { count: lines.length })}
            </label>
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" defaultChecked className="size-4 rounded-xs accent-primary" />
              {t("contractDetail.renewCopyTerms")}
            </label>
          </div>

          <p className="text-help text-muted-foreground">{t("contractDetail.renewReversible")}</p>

          {renew.state.message && (
            <p className="text-help text-destructive">{renew.state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!proposal || renew.state.pending}
              onClick={() =>
                proposal && renew.submit({ start_date: proposal.start, end_date: proposal.end })
              }
            >
              {renew.state.pending ? t("common.saving") : t("contractDetail.renewCreateDraft")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
