import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Plus,
  QrCode,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { errorMessage } from "@/api/errors";
import {
  LABELS_PER_PAGE,
  MAX_LABELS,
  buildingListQuery,
  customerListQuery,
  elevatorKeys,
  elevatorListQuery,
  fetchLabelPdf,
  regenerateQr,
  type ElevatorRow,
  type ListParams,
} from "@/api/queries";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

/**
 * Choosing what to print, and getting the sheet from the server.
 *
 * The output is a PDF the server renders, not a browser print of DOM labels.
 * Specification line 1813 is the whole reason this screen exists: the label is
 * read in a machine room, in dim light, off a surface that has been dusty for
 * years, so the symbol has a minimum size and the type has a minimum weight.
 * `window.print()` cannot promise either — margins, scale and colour handling
 * differ between browsers and are finally the user's printer settings, and a
 * sheet that came back six percent small because "fit to page" was left on is a
 * sheet that fails where it is needed. The server's PDF is the same document
 * every time.
 *
 * That is also why nothing here draws a label. The artwork lives in
 * `templates/labels/elevator_labels.html` and having a second copy of it in the
 * DOM would mean two renderers of one sticker, drifting, only one of which ever
 * gets stuck to a lift. What this screen shows instead is a placement plan:
 * which cell each label lands in, and how many cells stay empty.
 */

/** What the print list has to remember about a lift that has scrolled away. */
type PrintItem = Pick<
  ElevatorRow,
  "id" | "registration_number" | "name" | "building_name" | "customer_name"
>;

function toPrintItem(row: ElevatorRow): PrintItem {
  return {
    id: row.id,
    registration_number: row.registration_number,
    name: row.name,
    building_name: row.building_name,
    customer_name: row.customer_name,
  };
}

/**
 * One page of the plan.
 *
 * Twelve cells whether or not twelve are used, because the empty ones are the
 * point: a person who has selected five needs to see the seven they are about
 * to leave blank before the sheet comes out of the printer, not after.
 */
function PagePlan({ page, items }: { page: number; items: PrintItem[] }) {
  const { t } = useTranslation();
  const blanks = LABELS_PER_PAGE - items.length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-label">{t("qrLabels.page", { n: page })}</span>
        <span className="tnum text-help text-muted-foreground">
          {t("qrLabels.filledOf", { filled: items.length, total: LABELS_PER_PAGE })}
        </span>
        {blanks > 0 && (
          <span className="tnum text-help text-warning">
            {t("qrLabels.emptyCellsOnPage", { count: blanks })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex min-w-0 flex-col justify-between gap-1 rounded-md border border-border bg-card p-2"
          >
            <span className="tnum text-help text-subtle">{index + 1}</span>
            <span className="truncate font-mono tnum text-cell">{item.registration_number}</span>
            <span className="truncate text-help text-muted-foreground">{item.building_name}</span>
          </div>
        ))}
        {Array.from({ length: blanks }).map((_, index) => (
          <div
            key={`blank-${index}`}
            className="flex min-h-20 items-end rounded-md border border-dashed border-border-strong p-2"
          >
            <span className="tnum text-help text-subtle">{items.length + index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QrLabelScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<PrintItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<PrintItem | null>(null);

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const chosen = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const signature = items.map((item) => item.id).join(",");

  // A sheet already produced describes the list as it was. Changing the list
  // makes it a document that no longer matches the screen it came from, and a
  // stale PDF sitting under a "ready" heading is worse than no PDF.
  useEffect(() => {
    replacePdf(null);
  }, [signature, replacePdf]);

  const elevators = useQuery(
    elevatorListQuery({ search: debouncedSearch || undefined, page_size: 25 }),
  );
  const buildings = useQuery(buildingListQuery({ page_size: 200 }));
  const customers = useQuery(customerListQuery({ page_size: 200 }));

  const room = MAX_LABELS - items.length;

  const addMany = useCallback(
    (rows: ElevatorRow[]) => {
      // Worked out from the current state rather than inside the updater: React
      // does not promise to run an updater synchronously, so a count incremented
      // in there is still zero when the caller reads it and every bulk add
      // reports "nothing added".
      const seen = new Set(items.map((item) => item.id));
      const fresh: PrintItem[] = [];
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        if (items.length + fresh.length >= MAX_LABELS) break;
        fresh.push(toPrintItem(row));
        seen.add(row.id);
      }
      if (fresh.length > 0) setItems((current) => [...current, ...fresh]);
      return fresh.length;
    },
    [items],
  );

  /**
   * "Every lift in this building", and the same for a customer.
   *
   * Fetched on demand rather than watched with an enabled query: the user
   * presses a button, and a query that fires the moment a dropdown changes adds
   * rows before they have finished choosing.
   */
  const addGroup = useMutation({
    mutationFn: (params: ListParams) =>
      queryClient.fetchQuery(elevatorListQuery({ ...params, page_size: MAX_LABELS })),
    onSuccess: (page) => {
      const added = addMany(page.results);
      setNotice(added > 0 ? t("qrLabels.addedCount", { count: added }) : t("qrLabels.nothingAdded"));
    },
  });

  const pdf = useMutation({
    mutationFn: () => fetchLabelPdf(items.map((item) => item.id)),
    onSuccess: (blob) => replacePdf(blob),
  });

  const regenerate = useMutation({
    mutationFn: (item: PrintItem) => regenerateQr(item.id),
    onSuccess: async (_elevator, item) => {
      setNotice(t("qrLabels.regenerateDone", { name: item.registration_number }));
      // Any sheet already generated carries this lift's previous token, so it
      // would print a sticker that resolves to nothing.
      replacePdf(null);
      await queryClient.invalidateQueries({ queryKey: elevatorKeys.all });
    },
  });

  function pdfError(error: unknown): string {
    if (error instanceof ApiError && error.status === 503) return t("qrLabels.pdfUnavailable");
    if (error instanceof ApiError && error.status === 404) return t("qrLabels.pdfEmpty");
    return errorMessage(error, t);
  }

  const pages: PrintItem[][] = [];
  for (let index = 0; index < items.length; index += LABELS_PER_PAGE) {
    pages.push(items.slice(index, index + LABELS_PER_PAGE));
  }
  const blanks = pages.length * LABELS_PER_PAGE - items.length;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("qrLabels.title")}</h1>
        <p className="text-help text-muted-foreground">{t("qrLabels.sheetSpec")}</p>
        <p className="text-help text-muted-foreground">{t("qrLabels.serverRenders")}</p>
      </div>

      {notice && (
        <Alert tone="info">{notice}</Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* Source ---------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-colhead uppercase text-subtle">{t("qrLabels.source")}</span>

          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-card p-3">
            <div className="flex items-end gap-2">
              <SearchableSelect
                className="min-w-0 flex-1"
                options={(buildings.data?.results ?? []).map((building) => ({
                  value: building.id,
                  label: building.name,
                  hint: building.customer_name,
                }))}
                value={buildingId}
                onChange={setBuildingId}
                placeholder={t("qrLabels.pickBuilding")}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!buildingId || addGroup.isPending || room <= 0}
                onClick={() => addGroup.mutate({ building: buildingId })}
              >
                <Building2 />
                {t("qrLabels.addBuilding")}
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <SearchableSelect
                className="min-w-0 flex-1"
                options={(customers.data?.results ?? []).map((customer) => ({
                  value: customer.id,
                  label: customer.legal_name,
                }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder={t("qrLabels.pickCustomer")}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!customerId || addGroup.isPending || room <= 0}
                onClick={() => addGroup.mutate({ customer: customerId })}
              >
                <Users />
                {t("qrLabels.addCustomer")}
              </Button>
            </div>
          </div>

          <label className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("qrLabels.searchElevator")}
              className="h-control-sm w-full rounded-md border border-input bg-card pl-9 pr-3 text-body placeholder:text-subtle focus-ring"
            />
          </label>

          <div className="overflow-hidden rounded-lg border border-border-subtle bg-card">
            {elevators.isPending ? (
              <p className="px-3 py-6 text-center text-body text-muted-foreground">
                {t("common.loading")}
              </p>
            ) : elevators.isError ? (
              <div className="p-3">
                <Alert tone="error" block>
                  {errorMessage(elevators.error, t)}
                </Alert>
              </div>
            ) : elevators.data.results.length === 0 ? (
              <p className="px-3 py-6 text-center text-body text-muted-foreground">
                {debouncedSearch ? t("empty.noFilterResults") : t("empty.noElevators")}
              </p>
            ) : (
              elevators.data.results.map((row) => {
                const already = chosen.has(row.id);
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="font-mono tnum text-cell">{row.registration_number}</span>
                      <span className="truncate text-help text-muted-foreground">
                        {row.name} · {row.building_name}
                      </span>
                    </span>
                    {already ? (
                      <span className="shrink-0 text-help text-subtle">
                        {t("qrLabels.inList")}
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="xs"
                        className="shrink-0"
                        disabled={room <= 0}
                        onClick={() => addMany([row])}
                      >
                        <Plus />
                        {t("qrLabels.addToPrintList")}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {elevators.data && elevators.data.pagination.total > elevators.data.results.length && (
            <p className="text-help text-muted-foreground">
              {t("qrLabels.moreElevators", {
                count: elevators.data.pagination.total - elevators.data.results.length,
              })}
            </p>
          )}

          <p className="text-help text-muted-foreground">{t("qrLabels.noPrinterHint")}</p>
        </div>

        {/* Print list and output ------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-colhead uppercase text-subtle">{t("qrLabels.printList")}</span>
              <span className="tnum text-help text-muted-foreground">
                {t("qrLabels.labelCount", { count: items.length })} ·{" "}
                {t("qrLabels.pageCount", { count: pages.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                  <Trash2 />
                  {t("qrLabels.clearList")}
                </Button>
              )}
              <Button
                size="sm"
                disabled={items.length === 0 || pdf.isPending}
                onClick={() => pdf.mutate()}
              >
                {pdf.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
                {pdf.isPending ? t("qrLabels.generating") : t("qrLabels.generate")}
              </Button>
            </div>
          </div>

          <p className="text-help text-muted-foreground">{t("qrLabels.regenerateWarning")}</p>

          {pdf.isError && (
            <Alert tone="error" block>
              {pdfError(pdf.error)}
            </Alert>
          )}
          {regenerate.isError && (
            <Alert tone="error" block>
              {errorMessage(regenerate.error, t)}
            </Alert>
          )}

          {pdfUrl && (
            <div className="flex flex-col gap-2 rounded-lg border border-success bg-success-bg/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label text-success">{t("qrLabels.ready")}</span>
                {/* Both ways out, because neither can be assumed: a sandboxed
                    frame may refuse to render the viewer, and a popup blocker
                    may swallow a tab opened after an await. */}
                <a
                  href={pdfUrl}
                  download="qr-etiketleri.pdf"
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >
                  <FileDown />
                  {t("qrLabels.downloadPdf")}
                </a>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  <ExternalLink />
                  {t("qrLabels.openPdf")}
                </a>
              </div>
              <iframe
                src={pdfUrl}
                title={t("qrLabels.preview")}
                className="h-[60vh] w-full rounded-md border border-border bg-card"
              />
            </div>
          )}

          {room <= 0 && (
            <Alert tone="warning" block>
              {t("qrLabels.limitReached", { count: MAX_LABELS })}
            </Alert>
          )}
          {room > 0 && room <= LABELS_PER_PAGE && (
            <Alert tone="info" block>
              {t("qrLabels.roomLeft", { count: room })}
            </Alert>
          )}

          {items.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-body text-muted-foreground">{t("qrLabels.printListEmpty")}</p>
              <p className="text-help text-muted-foreground">{t("qrLabels.emptyCellsStayEmpty")}</p>
            </div>
          ) : (
            <>
              {/* The decision about the blank cells, stated before the sheet is
                  made rather than discovered on the paper. */}
              {blanks > 0 && (
                <Alert tone="warning" block>
                  {items.length === 1
                    ? t("qrLabels.singleLabelNote")
                    : `${t("qrLabels.emptyCells", { count: blanks })} — ${t("qrLabels.emptyCellsStayEmpty")}`}
                </Alert>
              )}

              <div className="flex flex-col gap-1.5 overflow-hidden rounded-lg border border-border-subtle bg-card">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0"
                  >
                    <span className="w-12 shrink-0 tnum text-help text-muted-foreground">
                      {Math.floor(index / LABELS_PER_PAGE) + 1} / {(index % LABELS_PER_PAGE) + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="font-mono tnum text-cell">{item.registration_number}</span>
                      <span className="truncate text-help text-muted-foreground">
                        {item.customer_name && item.customer_name !== item.building_name
                          ? `${item.building_name} · ${item.customer_name}`
                          : item.building_name}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={regenerate.isPending}
                      onClick={() => setConfirming(item)}
                    >
                      <QrCode />
                      {t("qr.regenerate")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconXs"
                      aria-label={t("qrLabels.remove")}
                      onClick={() => setItems((current) => current.filter((x) => x.id !== item.id))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-colhead uppercase text-subtle">
                  {t("qrLabels.placementPlan")}
                </span>
                <span className="text-help text-muted-foreground">
                  {t("qrLabels.placementPlanNote")}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {pages.map((pageItems, index) => (
                  <PagePlan key={index} page={index + 1} items={pageItems} />
                ))}
              </div>
            </>
          )}

        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        weight="heavy"
        title={t("qrLabels.regenerateFor", { name: confirming?.registration_number ?? "" })}
        body={t("qrLabels.regenerateBody")}
        consequences={[
          t("qrLabels.regenerateConsequenceLabels"),
          t("qrLabels.regenerateConsequenceWall"),
          t("qrLabels.regenerateConsequenceReprint"),
        ]}
        confirmLabel={regenerate.isPending ? t("qrLabels.regenerating") : t("qr.regenerate")}
        onConfirm={() => {
          if (confirming) regenerate.mutate(confirming);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
