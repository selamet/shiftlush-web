import { Suspense, lazy, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { routeQuery } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { routeKm } from "@/lib/route";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { MappedStop } from "@/components/plan/RouteMap";

const RouteMap = lazy(() => import("@/components/plan/RouteMap"));

/**
 * One technician's day as the office sees it from the calendar: the stops in
 * the suggested order, numbered, and the same numbers on a map. Read-only —
 * the order is computed, not edited; moving a visit to another day is what
 * changes it.
 */
export function DayRoute({
  technician,
  day,
  onClose,
}: {
  technician: { id: string; name: string };
  day: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const route = useQuery(routeQuery({ technician: technician.id, date: day }));
  const stops = useMemo(() => route.data?.stops ?? [], [route.data]);
  const unplaced = new Set(route.data?.unplaced ?? []);
  const mapped = useMemo<MappedStop[]>(
    () =>
      stops.flatMap((stop, index) =>
        stop.latitude && stop.longitude
          ? [
              {
                number: index + 1,
                latitude: Number(stop.latitude),
                longitude: Number(stop.longitude),
                label: `${index + 1}. ${stop.elevator_name} — ${stop.building_name}`,
              },
            ]
          : [],
      ),
    [stops],
  );
  const title = t("plan.route.title", { name: technician.name, date: toDisplay(day) });
  const km = route.data ? routeKm(route.data.total_km) : "";

  return (
    <Modal open onClose={onClose} label={title} className="max-w-xl">
      <div className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-5">
        <h2 className="text-cardtitle">{title}</h2>
        {route.isError && <Alert tone="error" block title={errorMessage(route.error, t)} />}
        {route.isPending && <p className="text-help text-muted-foreground">{t("common.loading")}</p>}
        {route.data && stops.length === 0 && <p className="text-body text-muted-foreground">{t("plan.route.empty")}</p>}
        {km && <p className="text-help text-muted-foreground">{t("plan.route.suggested", { km })}</p>}
        {mapped.length > 0 && (
          <Suspense fallback={<div className="h-72 w-full rounded-md bg-muted" />}>
            <RouteMap stops={mapped} start={null} label={t("plan.route.map")} />
          </Suspense>
        )}
        <ol className="flex flex-col gap-1.5">
          {stops.map((stop, index) => (
            <li key={stop.id} className="flex flex-col gap-1">
              {unplaced.has(stop.id) && (index === 0 || !unplaced.has(stops[index - 1].id)) && (
                <h3 className="mt-1 text-label text-muted-foreground">{t("plan.route.unplaced")}</h3>
              )}
              <span className="flex items-center gap-2 text-cell">
                <span className="tnum grid size-6 shrink-0 place-items-center rounded-full bg-muted text-help font-semibold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{stop.elevator_name}</span>{" "}
                  <span className="text-muted-foreground">· {stop.building_name}</span>
                </span>
                {stop.leg_km !== null && stop.leg_km !== undefined && (
                  <span className="tnum shrink-0 text-help text-muted-foreground">
                    <MapPin className="mr-0.5 inline size-3" aria-hidden="true" />
                    {routeKm(stop.leg_km) || "0"} km
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
