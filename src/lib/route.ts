/**
 * The day's route as the screens say it: a rough distance and a way there.
 *
 * Straight-line kilometres, so the number is a hint and is printed as one —
 * one decimal at most, "as the crow flies" beside it on screen. The way there is the
 * phone's own maps app, opened on directions to the stop; the product draws no
 * roads of its own.
 */
import { formatDecimal } from "@/lib/format";

/** "6", "12,4", or "" when there is nothing to say. */
export function routeKm(km: number): string {
  if (!km) return "";
  return formatDecimal(km.toFixed(1));
}

/** Directions to a stop in the device's maps app, or "" when the stop has no whole position. */
export function directionsUrl(latitude: string | null, longitude: string | null): string {
  if (!latitude || !longitude) return "";
  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
