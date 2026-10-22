/**
 * A day's stops on a map: numbered, in order, joined by straight lines.
 *
 * Reached only through `React.lazy` from DayRoute, for the same reason as
 * forms/LeafletMap: Leaflet reads `window` while it loads, the render check
 * runs under Node, and nobody should download a map library to look at a
 * list. The lines are straight on purpose — the distances are straight-line
 * ones, and drawing roads would claim a precision the order does not have.
 */
import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/components/forms/leaflet-map.css";
import { mapProvider } from "@/lib/map-provider";

export interface MappedStop {
  number: number;
  latitude: number;
  longitude: number;
  label: string;
}

export default function RouteMap({
  stops,
  start,
  label,
}: {
  stops: MappedStop[];
  /** The firm's starting point, when it has one. */
  start: [number, number] | null;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || stops.length === 0) return;
    const map = L.map(host, { scrollWheelZoom: false, keyboard: true });
    L.tileLayer(mapProvider.tileUrl, {
      attribution: mapProvider.tileAttribution,
      maxZoom: mapProvider.maxZoom,
    }).addTo(map);

    const points: L.LatLngExpression[] = [];
    if (start) points.push(start);
    for (const stop of stops) {
      const at: L.LatLngExpression = [stop.latitude, stop.longitude];
      points.push(at);
      L.marker(at, {
        keyboard: true,
        title: stop.label,
        alt: stop.label,
        // The stop number, drawn in HTML so it takes the design tokens.
        icon: L.divIcon({
          className: "sl-route-stop",
          html: `<span>${stop.number}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);
    }
    // Coloured by class: Leaflet writes `stroke` as an SVG attribute, where a
    // CSS variable is not resolved.
    L.polyline(points, { className: "sl-route-line", weight: 3 }).addTo(map);
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    // Opened inside a dialog that animates in: measure once it has a size.
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
    };
  }, [stops, start]);

  return (
    <div
      ref={hostRef}
      role="application"
      aria-label={label}
      className="sl-map h-72 w-full overflow-hidden rounded-md border border-border"
    />
  );
}
