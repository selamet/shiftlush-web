import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Coordinates } from "@/lib/map-provider";

/**
 * Leaflet, and only for the people who ask for it.
 *
 * Two things fall out of this one line. The library is a separate async chunk
 * rather than weight on the entry bundle every role and every screen pays for,
 * and Node never evaluates a module that reads `window` at import time — see
 * the note at the top of `LeafletMap.tsx`.
 */
const LeafletMap = lazy(() => import("@/components/forms/LeafletMap"));

/**
 * The pin, and the two hidden inputs that carry it to the server.
 *
 * Rendered only by the screens whose write contract actually has
 * `latitude`/`longitude` — buildings and complexes. Customers and the company
 * record do not, and a map on those would ask someone to place a pin that the
 * save then silently drops.
 *
 * Coordinates are never required. Spec 9.4 is explicit that the field team
 * opens records before anyone has been to the address, so a missing location is
 * a hint, not a blocked form.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: Coordinates | null;
  onChange: (coords: Coordinates | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  /**
   * Effects do not run under `renderToString`, so this stays false for the
   * whole of the render check and the map subtree is never reached there. The
   * toggle above would be enough on its own; this is the belt to its braces,
   * because the cost of being wrong is a failed deploy rather than a warning.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    // A group rather than a labelled field: what is being named here is two
    // hidden inputs and a map, and there is no single control for a `<label
    // for>` to point at — least of all one that exists in both states, since
    // the button it would name is replaced by the map when the map opens.
    <div role="group" aria-labelledby="addr-location-label" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id="addr-location-label" className="text-label text-foreground">
          {t("address.fields.location")}
        </span>
        {value ? (
          <span className="font-mono text-help text-muted-foreground">
            {value.latitude}, {value.longitude}
          </span>
        ) : (
          <span className="text-help text-muted-foreground">
            {t("addressPicker.notEnteredOptional")}
          </span>
        )}
      </div>

      {/*
       * Present only when there is something to send. `formValues` drops an
       * empty string, so an absent pin means an absent key rather than a pair
       * of blanks the server has to reject — and clearing one on an existing
       * record is handled by the form, which knows there was something there
       * before.
       */}
      {value && (
        <>
          <input type="hidden" name="latitude" value={value.latitude} />
          <input type="hidden" name="longitude" value={value.longitude} />
        </>
      )}

      {!open ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setOpen(true)}
            className="w-fit"
          >
            <MapPin aria-hidden="true" />
            {value ? t("common.change") : t("addressPicker.markOnMap")}
          </Button>
          <p className="text-help text-muted-foreground">{t("addressPicker.locationHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {mounted ? (
            <Suspense
              fallback={
                <div className="grid h-[300px] place-items-center rounded-md border border-border bg-muted text-help text-muted-foreground sm:h-[380px]">
                  {t("common.loading")}
                </div>
              }
            >
              <LeafletMap
                value={value}
                onChange={onChange}
                label={t("addressPicker.title")}
                markerLabel={t("addressPicker.dragPin")}
                dropLabel={t("address.hints.dropPinHere")}
                className="h-[300px] w-full sm:h-[380px]"
              />
            </Suspense>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-help text-muted-foreground">
              {value ? t("addressPicker.dragPin") : t("addressPicker.mapPrompt")}
            </p>
            {value && (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                <X aria-hidden="true" />
                {t("address.hints.clearLocation")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/*
       * Spec 9.4: coordinates stay optional, and the interface warns when they
       * are missing rather than refusing the save. A technician sent to an
       * address with no pin navigates by the address note alone.
       */}
      {!value && (
        <p className="flex items-center gap-1.5 text-help text-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {t("address.hints.locationMissing")}
        </p>
      )}
    </div>
  );
}
