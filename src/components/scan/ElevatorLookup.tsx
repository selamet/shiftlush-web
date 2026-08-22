import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { elevatorListQuery } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { InspectionLabel } from "@/components/ui/inspection-label";

/** Enough of a registration number to be worth a round trip. */
const MIN_CHARS = 3;

/**
 * A page of results is the wrong shape for this. The technician is standing in
 * front of one lift and knows its number; ten rows is already a sign the number
 * was typed short, and the answer to that is to type more of it rather than to
 * page through a list with gloves on.
 */
const MAX_RESULTS = 10;

/**
 * Finding the lift by the number printed next to the QR.
 *
 * The label carries both (spec 11.3), which is the whole reason this is a peer
 * of the camera rather than a consolation prize: on a phone with no decoder, a
 * refused permission or a lens the machine room has fogged, the technician is
 * still standing in front of a sticker with the answer written on it.
 *
 * The search is the ordinary list endpoint. It matches on registration number,
 * name, internal code and building, and — this is the part that matters — it is
 * already scoped to what this user may see. A technician assigned to three
 * customers cannot find a fourth customer's lift here, and that restriction
 * costs this component no code at all, because it is the server's.
 */
export function ElevatorLookup({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  // What was typed and what was asked for are separate: firing a request per
  // keystroke on a machine-room connection spends the technician's signal on
  // answers they are still in the middle of replacing.
  const [asked, setAsked] = useState("");

  const results = useQuery({
    ...elevatorListQuery({ search: asked, page_size: MAX_RESULTS }),
    enabled: asked.length >= MIN_CHARS,
  });

  const rows = asked.length >= MIN_CHARS ? (results.data?.results ?? []) : [];
  const total = results.data?.pagination.total ?? 0;

  // Exactly one match is not a list, it is an answer. Rendering it as a single
  // row the technician then has to hit is a tap that exists only because the
  // component could not decide.
  const only = rows.length === 1 ? rows[0].id : null;
  useEffect(() => {
    if (only) void navigate({ to: "/elevators/$id", params: { id: only } });
  }, [only, navigate]);

  const short = term.trim().length > 0 && term.trim().length < MIN_CHARS;

  return (
    <section className={className}>
      <h2 className="text-cardtitle">{t("scan.lookup.title")}</h2>
      <p className="mt-1 text-help text-muted-foreground">{t("scan.lookup.hint")}</p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = term.trim();
          if (next.length >= MIN_CHARS) setAsked(next);
        }}
      >
        <Input
          // `search` rather than `text` so the phone offers a Search key on the
          // return position, and inputMode stays default: a registration number
          // is `34-2019-004512`, which a numeric keypad cannot type.
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("scan.lookup.placeholder")}
          aria-label={t("scan.lookup.title")}
          autoComplete="off"
          // The one field on the screen, and the technician is wearing gloves.
          className="tnum h-control-lg text-cardtitle"
        />
        <Button
          type="submit"
          size="lg"
          disabled={term.trim().length < MIN_CHARS || results.isFetching}
          aria-label={t("common.search")}
        >
          {results.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
      </form>

      {short && (
        <p className="mt-2 text-help text-muted-foreground">
          {t("common.searchMinChars", { count: MIN_CHARS })}
        </p>
      )}

      {results.isError && (
        <Alert tone="error" block className="mt-3">
          {errorMessage(results.error, t)}
        </Alert>
      )}

      {results.isSuccess && rows.length === 0 && (
        <Alert tone="info" block className="mt-3">
          {t("scan.lookup.noMatch", { term: asked })}
        </Alert>
      )}

      {rows.length > 1 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => void navigate({ to: "/elevators/$id", params: { id: row.id } })}
                className="flex w-full flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-border-strong focus-ring"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono tnum text-body">{row.registration_number}</span>
                  <InspectionLabel value={row.inspection_label} />
                </span>
                <span className="text-help text-muted-foreground">
                  {row.name} · {row.building_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > rows.length && (
        <p className="mt-2 text-help text-muted-foreground">
          {t("scan.lookup.tooMany", { count: total })}
        </p>
      )}
    </section>
  );
}
