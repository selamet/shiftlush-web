import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleDollarSign, Plus, Trash2 } from "lucide-react";
import {
  addInvoiceLine,
  cancelInvoiceDraft,
  deleteInvoiceLine,
  fetchInvoicePdf,
  invoiceDraftQuery,
  invoiceKeys,
  issueInvoiceDraft,
  markInvoicePaid,
  updateInvoiceDraft,
  updateInvoiceLine,
  type InvoiceDraft,
  type InvoiceLine,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { toDisplay, todayIso } from "@/lib/date";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { parseMoneyInput, parseQuantityInput } from "@/lib/money";
import { useSession } from "@/lib/session";
import { canUseBilling, draftActions, issueBlocker } from "@/lib/billing";
import { FileOffer } from "@/components/billing/FileOffer";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { InvoiceStatusChip, StatusChip } from "@/components/ui/status-chip";

/** Every write here moves the draft's totals, so each one refetches the draft and the lists. */
function useBillingMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

/**
 * One invoice draft: what it bills, for which period, and what is left to do.
 *
 * While it is a draft, it is the accountant's to complete: the lines the
 * generator could not price take a price in place, manual lines are added for
 * what it could not know about, and the notes say what the customer should
 * read. Then the invoice is issued in the e-invoice system and its number is
 * recorded here — which the button refuses, with the count, while any line
 * still has no price. From then on the draft is the record of what was
 * invoiced and is read-only: paid, or cancelled with a reason.
 */
export function BillingDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();
  const draftId = id ?? "";
  const allowed = canUseBilling(role);
  const query = useQuery({ ...invoiceDraftQuery(draftId), enabled: allowed && Boolean(draftId) });
  const [dialog, setDialog] = useState<"issue" | "paid" | "cancel" | null>(null);

  if (!allowed) return <PlanRestricted titleKey="billing.restricted" />;
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

  const draft = query.data;
  const actions = draftActions(draft.status, role);
  const editable = actions.includes("editLines");
  const blocker = issueBlocker(draft.lines);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/billing" className="hover:underline">
            {t("billing.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{draft.customer_name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-title">{draft.customer_name}</h1>
          <InvoiceStatusChip value={draft.status} />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-body text-muted-foreground">
          <Link to="/contracts/$id" params={{ id: draft.contract }} className="font-mono text-primary hover:underline">
            {draft.contract_number}
          </Link>
          <span>·</span>
          <span className="tnum">
            {toDisplay(draft.period_start)} – {toDisplay(draft.period_end)}
          </span>
        </p>
      </div>

      {draft.status !== "draft" && (
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-3">
          <Fact label={t("billing.fields.invoiceNumber")}>
            <span className="font-mono">{draft.invoice_number || "—"}</span>
          </Fact>
          <Fact label={t("billing.fields.invoiceDate")}>{toDisplay(draft.invoice_date) || "—"}</Fact>
          {draft.status === "paid" && <Fact label={t("billing.fields.paidOn")}>{toDisplay(draft.paid_on)}</Fact>}
          {draft.status === "cancelled" && (
            <Fact label={t("billing.fields.cancelledAt")}>{formatDate(draft.cancelled_at) || "—"}</Fact>
          )}
        </section>
      )}
      {draft.status === "cancelled" && draft.cancel_reason && (
        <p className="text-help text-muted-foreground">
          {t("billing.cancelReason")}: {draft.cancel_reason}
        </p>
      )}

      {editable && blocker && (
        <Alert tone="warning" title={t("billing.needsPriceBlocker", { count: blocker.unpriced })} />
      )}

      <LinesTable draft={draft} editable={editable} />

      <Totals draft={draft} />

      <NotesEditor draft={draft} editable={editable} />

      <div className="flex flex-wrap items-center gap-2">
        {actions.includes("issue") && (
          <Button size="lg" onClick={() => setDialog("issue")}>
            {t("billing.actions.issue")}
          </Button>
        )}
        {actions.includes("markPaid") && (
          <Button size="lg" onClick={() => setDialog("paid")}>
            {t("billing.actions.markPaid")}
          </Button>
        )}
        {actions.includes("cancel") && (
          <Button size="lg" variant="ghost" onClick={() => setDialog("cancel")}>
            {t("billing.actions.cancel")}
          </Button>
        )}
        {actions.includes("pdf") && (
          <FileOffer
            label={t("billing.pdf")}
            filename={`fatura-taslagi-${draft.contract_number}-${draft.period_start}.pdf`}
            fetchFile={() => fetchInvoicePdf(draft.id)}
            canOpen
          />
        )}
      </div>

      {dialog === "issue" && <IssueDialog draft={draft} onClose={() => setDialog(null)} />}
      {dialog === "paid" && <PaidDialog draft={draft} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelDialog draft={draft} onClose={() => setDialog(null)} />}
    </div>
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

function LinesTable({ draft, editable }: { draft: InvoiceDraft; editable: boolean }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-cardtitle">{t("billing.lines")}</h2>
      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-card">
        <table className="w-full text-cell">
          <thead className="border-b border-border bg-background text-colhead uppercase text-subtle">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("billing.fields.description")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("billing.fields.quantity")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("billing.fields.unitPrice")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("billing.fields.amount")}</th>
              {editable && <th className="px-3 py-2" aria-label={t("common.actions")} />}
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((line) => (
              <LineRow key={line.id} line={line} currency={draft.currency} editable={editable} />
            ))}
          </tbody>
        </table>
      </div>
      {editable &&
        (adding ? (
          <ManualLineForm draftId={draft.id} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="secondary" className="self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t("billing.addLine")}
          </Button>
        ))}
    </section>
  );
}

/**
 * One line. A line waiting for a price is marked in words and takes the price
 * in place; a manual line can be removed. Typed prices are read the way people
 * here write them — "1.250,50" — and refused when they could mean two things.
 */
function LineRow({ line, currency, editable }: { line: InvoiceLine; currency: string; editable: boolean }) {
  const { t } = useTranslation();
  const [price, setPrice] = useState("");
  const [invalid, setInvalid] = useState(false);
  const save = useBillingMutation((unitPrice: string) => updateInvoiceLine(line.id, { unit_price: unitPrice }));
  const remove = useBillingMutation(() => deleteInvoiceLine(line.id));
  const failure = save.error ?? remove.error;

  return (
    <tr className="border-b border-border-subtle align-top last:border-0">
      <td className="px-3 py-2">
        <span className="flex flex-col gap-1">
          <span className="break-words">{line.description}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
            {enumLabel("billing.lineKind", line.kind)}
            {line.needs_price && (
              <StatusChip weight="ink" icon={CircleDollarSign}>
                {t("billing.needsPrice")}
              </StatusChip>
            )}
          </span>
          {failure && <span className="text-help text-destructive">{errorMessage(failure, t)}</span>}
        </span>
      </td>
      <td className="tnum px-3 py-2 text-right">{line.quantity}</td>
      <td className="px-3 py-2 text-right">
        {editable && line.needs_price ? (
          <form
            className="flex items-center justify-end gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = parseMoneyInput(price);
              setInvalid(parsed === null);
              if (parsed !== null) save.mutate(parsed);
            }}
          >
            <label htmlFor={`price-${line.id}`} className="sr-only">
              {t("billing.fields.unitPrice")}
            </label>
            <Input
              id={`price-${line.id}`}
              value={price}
              inputMode="decimal"
              placeholder="0,00"
              invalid={invalid}
              onChange={(event) => setPrice(event.target.value)}
              className="h-control-sm w-28 text-right"
            />
            <Button type="submit" size="xs" disabled={save.isPending || !price.trim()}>
              {t("common.save")}
            </Button>
          </form>
        ) : (
          <span className="tnum">{line.unit_price ? formatMoney(line.unit_price, currency) : "—"}</span>
        )}
        {invalid && <p className="mt-1 text-help text-destructive">{t("billing.priceInvalid")}</p>}
      </td>
      <td className="tnum px-3 py-2 text-right">{formatMoney(line.amount, currency)}</td>
      {editable && (
        <td className="px-3 py-2 text-right">
          {line.kind === "manual" && (
            <Button
              size="iconXs"
              variant="ghost"
              aria-label={t("billing.removeLine")}
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}

function ManualLineForm({ draftId, onDone }: { draftId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const add = useBillingMutation((body: Parameters<typeof addInvoiceLine>[1]) => addInvoiceLine(draftId, body));
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const quantity = parseQuantityInput(String(form.get("quantity") ?? ""));
        const unitPrice = parseMoneyInput(String(form.get("unit_price") ?? ""));
        if (!quantity || unitPrice === null) {
          setError(t("billing.lineInvalid"));
          return;
        }
        setError("");
        add.mutate(
          { description: String(form.get("description") ?? "").trim(), quantity, unit_price: unitPrice },
          { onSuccess: onDone },
        );
      }}
    >
      {(error || add.isError) && <Alert tone="error" block title={error || errorMessage(add.error, t)} />}
      <Field label={t("billing.fields.description")} htmlFor="line-description" required>
        <Input name="description" required maxLength={500} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("billing.fields.quantity")} htmlFor="line-quantity" required>
          <Input name="quantity" required inputMode="decimal" defaultValue="1" />
        </Field>
        <Field label={t("billing.fields.unitPrice")} htmlFor="line-price" required hint={t("billing.priceHint")}>
          <Input name="unit_price" required inputMode="decimal" placeholder="0,00" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? t("common.saving") : t("billing.addLine")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function Totals({ draft }: { draft: InvoiceDraft }) {
  const { t } = useTranslation();
  return (
    <section className="ml-auto flex w-full max-w-sm flex-col rounded-lg border border-border-subtle bg-card px-4 py-2">
      <Row label={t("billing.fields.subtotal")} value={formatMoney(draft.subtotal, draft.currency)} />
      <Row
        label={t("billing.fields.vat", { rate: formatPercent(draft.vat_rate) })}
        value={formatMoney(draft.vat_amount, draft.currency)}
      />
      <Row label={t("billing.fields.total")} value={formatMoney(draft.total, draft.currency)} strong />
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className={strong ? "text-cell font-medium" : "text-help text-muted-foreground"}>{label}</span>
      <span className={`tnum ${strong ? "text-cardtitle" : "text-cell"}`}>{value}</span>
    </div>
  );
}

function NotesEditor({ draft, editable }: { draft: InvoiceDraft; editable: boolean }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const save = useBillingMutation((notes: string) => updateInvoiceDraft(draft.id, { notes }));
  if (!editable) {
    return draft.notes ? (
      <section className="flex flex-col gap-1">
        <h2 className="text-cardtitle">{t("billing.fields.notes")}</h2>
        <p className="whitespace-pre-wrap text-body">{draft.notes}</p>
      </section>
    ) : null;
  }
  return (
    <form
      className="flex flex-col gap-2"
      onChange={() => setSaved(false)}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(String(new FormData(event.currentTarget).get("notes") ?? ""), { onSuccess: () => setSaved(true) });
      }}
    >
      <Field label={t("billing.fields.notes")} htmlFor="draft-notes" hint={t("billing.notesHint")}>
        <Textarea name="notes" rows={3} defaultValue={draft.notes} />
      </Field>
      {save.isError && <p className="text-help text-destructive">{errorMessage(save.error, t)}</p>}
      <span className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("billing.saveNotes")}
        </Button>
        {saved && (
          <span role="status" className="text-help text-success">
            {t("billing.notesSaved")}
          </span>
        )}
      </span>
    </form>
  );
}

/**
 * Recording the invoice issued in the e-invoice system. The blocker is said
 * at the top of the dialog, with the count, and the button stays off: an
 * invoice with an unpriced line is not one anybody issued.
 */
function IssueDialog({ draft, onClose }: { draft: InvoiceDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => todayIso());
  const blocker = issueBlocker(draft.lines);
  const issue = useBillingMutation((body: { invoice_number: string; invoice_date: string }) =>
    issueInvoiceDraft(draft.id, body),
  );
  return (
    <Modal open onClose={onClose} label={t("billing.issueTitle")} className="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const number = String(new FormData(event.currentTarget).get("invoice_number") ?? "").trim();
          issue.mutate({ invoice_number: number, invoice_date: date }, { onSuccess: onClose });
        }}
      >
        <h2 className="text-cardtitle">{t("billing.issueTitle")}</h2>
        <p className="text-body text-muted-foreground">{t("billing.issueBody")}</p>
        {blocker && <Alert tone="warning" block title={t("billing.needsPriceBlocker", { count: blocker.unpriced })} />}
        {issue.isError && <Alert tone="error" block title={errorMessage(issue.error, t)} />}
        <Field label={t("billing.fields.invoiceNumber")} htmlFor="issue-number" required>
          <Input name="invoice_number" required maxLength={40} autoComplete="off" />
        </Field>
        <Field label={t("billing.fields.invoiceDate")} htmlFor="issue-date" required bindChild={false}>
          <DatePicker id="issue-date" value={date} onChange={setDate} required />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={Boolean(blocker) || !date || issue.isPending}>
            {issue.isPending ? t("common.saving") : t("billing.actions.issue")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PaidDialog({ draft, onClose }: { draft: InvoiceDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => todayIso());
  const paid = useBillingMutation((paidOn: string) => markInvoicePaid(draft.id, paidOn));
  return (
    <Modal open onClose={onClose} label={t("billing.paidTitle")} className="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (date) paid.mutate(date, { onSuccess: onClose });
        }}
      >
        <h2 className="text-cardtitle">{t("billing.paidTitle")}</h2>
        {paid.isError && <Alert tone="error" block title={errorMessage(paid.error, t)} />}
        <Field label={t("billing.fields.paidOn")} htmlFor="paid-on" required bindChild={false}>
          <DatePicker id="paid-on" value={date} onChange={setDate} max={todayIso()} required />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!date || paid.isPending}>
            {paid.isPending ? t("common.saving") : t("billing.actions.markPaid")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Cancelling: a reason first, then the heavy confirmation that names what it
 * means — a cancelled draft is kept, but nothing more is done with it.
 */
function CancelDialog({ draft, onClose }: { draft: InvoiceDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const cancel = useBillingMutation((text: string) => cancelInvoiceDraft(draft.id, text));

  if (confirming) {
    return (
      <ConfirmDialog
        open
        weight="heavy"
        title={t("billing.cancelTitle")}
        body={t("billing.cancelBody")}
        consequences={[
          draft.status === "issued" ? t("billing.cancelConsequenceIssued") : t("billing.cancelConsequenceDraft"),
          t("billing.cancelConsequenceKept"),
        ]}
        confirmLabel={t("billing.actions.cancel")}
        onConfirm={() => cancel.mutate(reason, { onSuccess: onClose, onError: () => setConfirming(false) })}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <Modal open onClose={onClose} role="alertdialog" label={t("billing.cancelTitle")} className="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) setConfirming(true);
        }}
      >
        <h2 className="text-cardtitle">{t("billing.cancelTitle")}</h2>
        {cancel.isError && <Alert tone="error" block title={errorMessage(cancel.error, t)} />}
        <Field label={t("billing.cancelReason")} htmlFor="cancel-reason" required>
          <Textarea
            name="reason"
            rows={3}
            required
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button type="submit" variant="destructive" disabled={!reason.trim()}>
            {t("common.continue")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
