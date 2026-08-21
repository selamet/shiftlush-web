import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Search, TriangleAlert, Map as MapIcon, ChevronLeft, Check } from "lucide-react";
import address from "@fixtures/demo-address.json";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

const NOTE_MAX = 500;

/** Which of the two hard states the picker is demonstrating. */
type Mode = "suggestion" | "notFound";

function Select({
  id,
  value,
  options,
  hint,
}: {
  id: string;
  value: string;
  options: string[];
  hint: string;
}) {
  return (
    <>
      <select
        id={id}
        defaultValue={value}
        className="h-control-md w-full rounded-md border border-input bg-card px-3 text-body focus-ring pointer-coarse:h-control-lg"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <p className="text-help text-muted-foreground">{hint}</p>
    </>
  );
}

/**
 * The mobile flow.
 *
 * The map and the form do not fit on a phone together, and squeezing them
 * would make both bad. So the map stops being a field and becomes a step: the
 * form stays one column, location is a single row, and touching it opens the
 * map full screen with the suggestion in a sheet. Saving returns to the form.
 */
function AddressPickerMobile() {
  const { t } = useTranslation();
  const [onMap, setOnMap] = useState(false);
  const [saved, setSaved] = useState(false);

  if (onMap) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-2">
          <Button size="icon" variant="ghost" onClick={() => setOnMap(false)} aria-label={t("common.back")}>
            <ChevronLeft />
          </Button>
          <span className="min-w-0 flex-1 truncate text-body">
            {address.street} {address.buildingNumber}, {address.districts[0]}
          </span>
        </header>

        <div className="relative flex flex-1 items-center justify-center bg-muted">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <MapIcon className="size-8" aria-hidden="true" />
            <span className="text-help">{t("addressPicker.mapUnavailable")}</span>
          </div>
          <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-card px-2.5 py-1.5 text-help text-muted-foreground shadow-sm">
            {t("addressPicker.dragPin")}
          </span>
        </div>

        {/* The sheet carries the suggestion and the coordinates; the two exits
            stay equal weight here too. */}
        <div className="flex flex-col gap-3 border-t border-border bg-card p-4">
          <div className="flex flex-col gap-1.5 rounded-md border-l-[3px] border-warning bg-warning-bg px-3 py-2.5">
            <span className="text-label text-warning">{t("addressPicker.suggestionShort")}</span>
            <span className="text-help text-warning">
              {t("addressPicker.writtenNotLocked", { name: address.suggestion.first })}
            </span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-cell">{address.neighborhoodResults[0].name}</span>
            <span className="text-help text-muted-foreground">
              {address.neighborhoodResults[0].context}
            </span>
          </div>
          <span className="font-mono tnum text-help text-muted-foreground">
            {address.suggestion.latitude} · {address.suggestion.longitude}
          </span>
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" className="flex-1">
              {t("addressPicker.fix")}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                setSaved(true);
                setOnMap(false);
              }}
            >
              {t("addressPicker.saveLocation")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="text-section">{t("addressPicker.title")}</h2>
        <span className="tnum text-help text-muted-foreground">3 / 4</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <Field label={t("address.fields.province")} htmlFor="apm-province">
          <Input defaultValue={address.provinces[0]} readOnly />
        </Field>
        <Field label={t("address.fields.district")} htmlFor="apm-district">
          <Input defaultValue={address.districts[0]} readOnly />
        </Field>
        <Field label={t("address.fields.neighborhood")} htmlFor="apm-neighborhood">
          <Input defaultValue={address.neighborhoodResults[0].name} readOnly />
        </Field>
        <Field label={t("address.fields.street")} htmlFor="apm-street">
          <Input defaultValue={address.street} />
        </Field>
        <Field label={t("addressPicker.doorNumber")} htmlFor="apm-door">
          <Input defaultValue={address.buildingNumber} className="tnum" />
        </Field>
        <Field label={t("building.fields.addressNote")} htmlFor="apm-note" required>
          <Textarea rows={3} defaultValue={address.addressNote} />
        </Field>

        {/* Location is a row, not a field. Touching it opens the step. */}
        <button
          type="button"
          onClick={() => setOnMap(true)}
          className="flex h-14 items-center gap-3 rounded-md border border-dashed border-border-strong px-3 text-left focus-ring"
        >
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-cell">{t("addressPicker.markOnMap")}</span>
            <span className="text-help text-subtle">
              {saved
                ? `${address.suggestion.latitude} · ${address.suggestion.longitude}`
                : t("addressPicker.notEnteredOptional")}
            </span>
          </span>
          {saved && <Check className="ml-auto size-4 shrink-0 text-success" aria-hidden="true" />}
        </button>
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-3">
        <Button size="lg" variant="secondary" className="flex-1">
          {t("common.back")}
        </Button>
        <Button size="lg" className="flex-1">
          {t("common.continue")}
        </Button>
      </div>
    </div>
  );
}

export function AddressPicker({ mode = "suggestion" }: { mode?: Mode }) {
  const { t } = useTranslation();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState(address.addressNote);
  // When no neighbourhood can be matched, the free-text description becomes the
  // only address the field team will have — so it stops being optional.
  const [noteIsSoleSource, setNoteIsSoleSource] = useState(false);

  function fallBackToNote() {
    setNoteIsSoleSource(true);
    noteRef.current?.focus();
  }

  return (
    <>
      <div className="lg:hidden">
        <AddressPickerMobile />
      </div>

      <div className="hidden flex-col gap-4 lg:flex lg:flex-row">
      {/* Data entry is the real work; the map is a verification tool. Hence the
          fixed form column and the map taking whatever is left. */}
      <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[528px]">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-section">{t("addressPicker.title")}</h2>
          <span className="text-help text-muted-foreground">
            {t("addressPicker.step", { current: 3, total: 4 })}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("address.fields.province")} htmlFor="ap-province" required bindChild={false}>
            <Select
              id="ap-province"
              value={address.provinces[0]}
              options={address.provinces}
              hint={t("addressPicker.provinceHint")}
            />
          </Field>
          <Field label={t("address.fields.district")} htmlFor="ap-district" required bindChild={false}>
            <Select
              id="ap-district"
              value={address.districts[0]}
              options={address.districts}
              hint={t("addressPicker.districtHint", { count: 17 })}
            />
          </Field>
        </div>

        {/* Never the full list — around 50,000 rows nationwide. */}
        <Field
          label={t("address.fields.neighborhood")}
          htmlFor="ap-neighborhood"
          hint={t("addressPicker.neighborhoodHint")}
          bindChild={false}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden="true"
            />
            <Input
              id="ap-neighborhood"
              defaultValue={address.neighborhoodQuery}
              className="pl-9"
            />
          </div>
        </Field>

        {mode === "suggestion" ? (
          <div className="-mt-2 overflow-hidden rounded-md border border-border bg-card shadow-md">
            <div className="border-b border-border-subtle px-3 py-1.5 text-help text-muted-foreground">
              {t("addressPicker.resultCount", { count: address.neighborhoodResults.length })}
            </div>
            {address.neighborhoodResults.map((result) => (
              <button
                key={result.name}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="flex flex-col leading-tight">
                  <span className="text-cell">{result.name}</span>
                  <span className="text-help text-muted-foreground">{result.context}</span>
                </span>
                {result.type !== "neighborhood" && (
                  <span className="rounded-sm border border-border-strong px-1.5 text-help text-muted-foreground">
                    {enumLabel("address.type", result.type)}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          // Not being able to record an address is the most expensive outcome
          // in the field, so this state offers a way forward instead of an error.
          <div className="-mt-2 flex flex-col gap-2 rounded-md border-l-[3px] border-warning bg-warning-bg px-3 py-2.5">
            <span className="text-label text-warning">{t("addressPicker.notFoundTitle")}</span>
            <span className="text-help text-warning">{t("addressPicker.flowNotBlocked")}</span>
            <Button size="xs" variant="secondary" onClick={fallBackToNote} className="self-start">
              {t("addressPicker.goToAddressNote")}
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
          <Field label={t("address.fields.street")} htmlFor="ap-street">
            <Input defaultValue={address.street} />
          </Field>
          <Field label={t("address.fields.buildingNumber")} htmlFor="ap-building-no">
            <Input defaultValue={address.buildingNumber} className="tnum" />
          </Field>
          <Field label={t("address.fields.unitNumber")} htmlFor="ap-unit-no">
            <Input className="tnum" />
          </Field>
        </div>

        <Field
          label={t("building.fields.addressNote")}
          htmlFor="ap-note"
          required
          hint={
            noteIsSoleSource
              ? t("addressPicker.noteIsSoleSource")
              : t("addressPicker.addressNoteHint")
          }
          bindChild={false}
        >
          <div className="flex flex-col gap-1">
            <Textarea
              id="ap-note"
              ref={noteRef}
              rows={3}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              className={cn(noteIsSoleSource && "border-[1.5px] border-warning")}
            />
            <span className="self-end tnum text-help text-subtle">
              {t("addressPicker.charCount", { used: note.length, max: NOTE_MAX })}
            </span>
          </div>
        </Field>
      </div>

      {/* Map ---------------------------------------------------------------- */}
      <div className="flex min-h-80 flex-1 flex-col gap-3">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <MapIcon className="size-8" aria-hidden="true" />
            <span className="text-help">{t("addressPicker.mapUnavailable")}</span>
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-card px-2.5 py-1.5 text-help text-muted-foreground shadow-sm">
            <MapPin className="size-3.5" aria-hidden="true" />
            {t("addressPicker.dragPin")}
          </div>
        </div>

        {mode === "suggestion" ? (
          /* The suggestion is written into the fields but never locks them, and
             three separate signals say so: the warning tone, the "not certain"
             heading, and two buttons of equal weight. Filling in the wrong
             neighbourhood silently is worse than leaving it blank. */
          <div className="flex flex-col gap-2.5 rounded-md border-l-[3px] border-warning bg-warning-bg px-3 py-3">
            <span className="flex items-center gap-2 text-label text-warning">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {t("addressPicker.suggestionTitle")}
            </span>
            <p className="text-help text-warning">
              {t("addressPicker.suggestionBody", {
                first: address.suggestion.first,
                second: address.suggestion.second,
              })}
            </p>
            <p className="font-mono tnum text-help text-warning">
              {address.suggestion.latitude} · {address.suggestion.longitude}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="secondary">
                {t("addressPicker.fixNeighborhood")}
              </Button>
              <Button size="xs" variant="secondary">
                {t("addressPicker.confirmSuggestion")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border-strong px-3 py-2.5">
            <span className="flex flex-col leading-tight">
              <span className="text-cell text-muted-foreground">
                {t("addressPicker.locationMissing")}
              </span>
              <span className="text-help text-subtle">{t("addressPicker.locationHint")}</span>
            </span>
            <Button size="xs" variant="secondary">
              {t("addressPicker.markOnMap")}
            </Button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
