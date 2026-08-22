import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, QrCode, RefreshCw, SearchX } from "lucide-react";
import { ApiError } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { elevatorByQrQuery } from "@/api/queries";
import { Button, buttonVariants } from "@/components/ui/button";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { ElevatorLookup } from "@/components/scan/ElevatorLookup";

/**
 * Where a scanned sticker lands.
 *
 * `/q/{qr_token}` is the URL printed on the label (spec 11.2), so this route is
 * reached two ways that must behave identically: the in-app scanner navigating
 * here, and the phone's own camera app opening the link cold. The second is why
 * this is a route and not a modal — a sticker whose URL the application does not
 * serve is a sticker that answers 404 to everyone who scans it with the tool
 * they already have in their hand.
 *
 * The token is exchanged for the record and the technician is sent on to it.
 * The exchange is not invisible, though: the `by-qr` response is small enough to
 * arrive on a machine-room connection well before the thirty-one-field record
 * does, so what it carries is put on screen while the rest is still coming.
 * That turns an unavoidable wait into the confirmation the technician wanted
 * anyway — that this is the lift they are standing next to.
 */
export function QrResolveScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ strict: false }) as { token?: string };

  const resolved = useQuery({
    ...elevatorByQrQuery(token ?? ""),
    enabled: Boolean(token),
  });

  const id = resolved.data?.id;
  useEffect(() => {
    // `replace`, so Back from the record goes wherever the technician was
    // before they scanned. Left on the stack, this screen would resolve the
    // token again and push them straight forward — a Back button that appears
    // not to work.
    if (id) void navigate({ to: "/elevators/$id", params: { id }, replace: true });
  }, [id, navigate]);

  /**
   * The server answers 404 for a token that does not exist *and* for one that
   * belongs to another firm, and it does that on purpose — a 403 would confirm
   * the sticker is real and let someone map a competitor's estate by trying
   * tokens (spec 11.2). So this screen genuinely cannot tell the two apart, and
   * it says so rather than picking the flattering one. Guessing "not yours"
   * accuses the technician of standing in the wrong building; guessing "no such
   * label" hides that they may have walked onto someone else's site.
   */
  const missing = resolved.error instanceof ApiError && resolved.error.status === 404;

  if (resolved.isError && missing) {
    return (
      <Shell title={t("scan.resolve.notFound.title")}>
        <section className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-card p-4">
          <span className="flex items-center gap-2 text-cardtitle">
            <SearchX className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t("scan.resolve.notFound.title")}
          </span>
          <p className="text-body text-muted-foreground">{t("scan.resolve.notFound.body")}</p>
          <p className="text-help text-muted-foreground">
            {t("scan.resolve.notFound.stale")}
          </p>
          <Link to="/scan" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <QrCode />
            {t("scan.resolve.scanAgain")}
          </Link>
        </section>

        {/* The lookup is here, not one tap away on the scanner. Somebody whose
            sticker just failed to resolve is holding a label with the
            registration number printed beside the code that did not work. */}
        <ElevatorLookup />
      </Shell>
    );
  }

  if (resolved.isError) {
    // Not the same story at all. A machine room is where a connection drops,
    // and telling that technician their sticker is unknown would send them
    // looking for a problem that is not there.
    return (
      <Shell title={t("scan.resolve.failed.title")}>
        <section className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-card p-4">
          <p className="text-body">{errorMessage(resolved.error, t)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => void resolved.refetch()}>
              <RefreshCw />
              {t("common.retry")}
            </Button>
            <Link to="/scan" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              <QrCode />
              {t("scan.resolve.scanAgain")}
            </Link>
          </div>
        </section>
      </Shell>
    );
  }

  const found = resolved.data;

  return (
    <Shell title={t("scan.resolve.reading")}>
      <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-card p-4">
        {found ? (
          <>
            <span className="font-mono tnum text-body text-muted-foreground">
              {found.registration_number}
            </span>
            <h2 className="text-title">{found.name}</h2>
            <p className="text-body text-muted-foreground">
              {found.building_name} · {found.customer_name}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <InspectionLabel value={found.inspection_label} />
              <ElevatorStatusChip value={found.status} />
            </div>
          </>
        ) : (
          <p className="text-body text-muted-foreground">{t("scan.resolve.reading")}</p>
        )}
        <p className="flex items-center gap-2 text-help text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {found ? t("scan.resolve.opening") : t("scan.resolve.checking")}
        </p>
      </section>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Dark for the same reason the technician's detail screen is: this is
          read at arm's length in a room with one bulb. */}
      <header className="dark flex items-center gap-2 bg-background px-4 py-3 text-foreground">
        <QrCode className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-cardtitle">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4">{children}</div>
    </div>
  );
}
