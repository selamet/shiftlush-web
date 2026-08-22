/**
 * The only module in this application that knows Leaflet exists.
 *
 * It is reached exclusively through `React.lazy` from `LocationPicker`, which
 * makes it its own async chunk — around 150kB of library that the customer
 * form, the settings screen and every list in the product would otherwise pay
 * for on first paint, for a map they cannot save a pin from.
 *
 * That indirection is also what keeps the render check alive. Leaflet reads
 * `window` and `document` while it is being evaluated, and `scripts/
 * smoke-render.mjs` renders every route through `renderToString` under Node
 * with a three-property `document` stub. A static import here would be
 * evaluated the moment the building form was pulled into the module graph and
 * the smoke step would fail on a screen nobody had opened. Because the import
 * is inside `lazy()` and the picker only renders this once the user has asked
 * for a map, Node never evaluates it at all.
 *
 * ## Do not "improve" this with a manualChunks entry
 *
 * The dynamic import is the whole mechanism, and Rollup's default handling of
 * it is already right: `npm run build` emits a `LeafletMap-*.js` of about
 * 152kB with the library inside it, the entry chunk gains no static import of
 * any other chunk, and `index.html` gets no modulepreload for it — nothing is
 * fetched until somebody presses the button.
 *
 * Naming the chunk in `vite.config.ts` looks like a free improvement and is
 * not. Both spellings were tried here. `manualChunks: { leaflet: ["leaflet"] }`
 * pulls the CommonJS interop helper into the leaflet chunk — Leaflet 1.9 ships
 * CJS — and the entry needs that helper too, so the entry ends up importing
 * the leaflet chunk *statically*: same bytes, now downloaded by every role on
 * every screen, and `index.html` preloads them. The split had stopped being a
 * split while still looking like one in the build log. Routing the helper to a
 * chunk of its own fixes that but buys a second request on first paint to name
 * something the default already names well enough.
 */
import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet-map.css";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { mapProvider, toCoordinates, type Coordinates } from "@/lib/map-provider";

/**
 * A ring with a dot in it, drawn in HTML rather than by Leaflet's default
 * marker.
 *
 * The default is a pair of PNGs whose URLs Leaflet guesses from the location of
 * its own stylesheet — a guess that is wrong under every bundler and produces
 * two 404s and an invisible marker. A `divIcon` has no assets to resolve, is
 * styled by the same tokens as the rest of the product, and can grow under a
 * coarse pointer, which an image cannot.
 */
const pinIcon = L.divIcon({
  className: "sl-pin",
  html: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface LeafletMapProps {
  /** The pin, or nothing yet. */
  value: Coordinates | null;
  onChange: (coords: Coordinates) => void;
  /** Announced on the map region itself. */
  label: string;
  /** Announced on the marker, which is a focusable, draggable thing. */
  markerLabel: string;
  /** The centre-drop control, offered only while there is no pin. */
  dropLabel: string;
  className?: string;
}

export default function LeafletMap({
  value,
  onChange,
  label,
  markerLabel,
  dropLabel,
  className,
}: LeafletMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Handlers are read through a ref so the map is built once. Rebuilding it
  // when the parent re-renders would throw away the user's pan and zoom on
  // every keystroke elsewhere in the form.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(value);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const start = initialRef.current;
    const map = L.map(host, {
      center: start
        ? [Number(start.latitude), Number(start.longitude)]
        : [...mapProvider.defaultCenter],
      zoom: start ? mapProvider.pinZoom : mapProvider.defaultZoom,
      // The map sits in the middle of a scrolling form. Wheel zoom would trap
      // the page: someone scrolling past on a laptop would zoom out to the
      // Atlantic instead of reaching the save button. Pinch and the buttons
      // both still zoom, which is every gesture anyone actually reaches for.
      scrollWheelZoom: false,
      // Arrow keys pan and +/- zoom once the map has focus, so the control is
      // reachable without a pointer at all.
      keyboard: true,
    });

    L.tileLayer(mapProvider.tileUrl, {
      attribution: mapProvider.tileAttribution,
      maxZoom: mapProvider.maxZoom,
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      onChangeRef.current(toCoordinates(event.latlng.lat, event.latlng.lng));
    });

    // The host is revealed by a toggle in the parent, and Leaflet measures its
    // container once at construction. Without this the tiles are laid out
    // against a height of zero and the map renders as a grey band.
    const frame = requestAnimationFrame(() => map.invalidateSize());

    mapRef.current = map;
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // The marker follows the value rather than owning it, so a pin cleared or
  // moved from outside the map — the clear button, an accepted suggestion —
  // shows up here without a second source of truth.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const latlng = L.latLng(Number(value.latitude), Number(value.longitude));
    const existing = markerRef.current;
    if (existing) {
      existing.setLatLng(latlng);
      return;
    }

    const marker = L.marker(latlng, {
      draggable: true,
      keyboard: true,
      autoPan: true,
      icon: pinIcon,
      title: markerLabel,
      alt: markerLabel,
    });
    marker.on("dragend", () => {
      const moved = marker.getLatLng();
      onChangeRef.current(toCoordinates(moved.lat, moved.lng));
    });
    marker.addTo(map);
    markerRef.current = marker;
  }, [value, markerLabel]);

  // Only when the pin arrives from elsewhere while the map is looking at the
  // whole country: dropping it yourself already put it under the cursor, and
  // re-centring on every drag would fight the hand that is dragging.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    const latlng = L.latLng(Number(value.latitude), Number(value.longitude));
    if (map.getBounds().contains(latlng)) return;
    map.setView(latlng, Math.max(map.getZoom(), mapProvider.pinZoom));
  }, [value]);

  function dropAtCenter() {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    onChangeRef.current(toCoordinates(center.lat, center.lng));
  }

  return (
    <div className={cn("relative", className)}>
      <div
        ref={hostRef}
        role="application"
        aria-label={label}
        className="sl-map size-full overflow-hidden rounded-md border border-border"
      />

      {/*
       * Aim-and-drop, offered until there is a pin to drag.
       *
       * Tapping an exact rooftop through a fingertip is the part of this that
       * fails on a phone, and it fails silently: the pin lands two buildings
       * over and looks deliberate. Panning the map under a fixed crosshair is
       * the same gesture at any zoom, works with gloves, and — because the
       * control is a real button — works from the keyboard too.
       */}
      {!value && (
        <>
          <Crosshair
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-[900] size-8 -translate-x-1/2 -translate-y-1/2 text-primary drop-shadow-[0_0_2px_var(--color-card)]"
          />
          <button
            type="button"
            onClick={dropAtCenter}
            // Above Leaflet's own control layer (z-index 1000) so it is always
            // pressable, and clear of the attribution strip along the bottom,
            // which the tile licence requires to stay legible.
            className="absolute bottom-8 left-1/2 z-[1001] h-control-md -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-4 text-body font-medium text-foreground shadow-md transition-colors hover:bg-muted pointer-coarse:h-control-lg"
          >
            {dropLabel}
          </button>
        </>
      )}
    </div>
  );
}
