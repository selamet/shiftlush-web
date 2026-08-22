/**
 * Map tiles and reverse geocoding, behind one seam.
 *
 * Spec 9.4 asks that swapping OpenStreetMap for a commercial provider be a
 * one-file change, so everything provider-shaped is here: the tile template,
 * the attribution the licence requires, and the call that turns a point into
 * address ids. The query key sits here too — a fetcher in one file and the key
 * that caches it in another would make the swap a two-file change and the
 * promise above a half-truth.
 *
 * Reverse geocoding is deliberately *not* called from the browser. It goes
 * through our own API so answers can be cached, the provider's quota stays
 * under one roof, and changing provider never touches this app (spec 8.6). The
 * server also rate-limits it, which is the half caching cannot do: nothing
 * bounds a client walking the coordinate space except a limit.
 *
 * There is no confidence threshold here any more. There was one, back when this
 * file guessed; the server now applies it and reports a level it could not
 * resolve as `unmatched` rather than as a low score. A second threshold in the
 * browser would be a rule that has to be kept in step with the one that
 * actually decides — see the note at the top of `lib/form.ts`.
 */
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/generated";

type Schemas = components["schemas"];

/**
 * A point, as the write endpoints spell it.
 *
 * Strings, not numbers, for the same reason money is a string here: the
 * contract declares `format: decimal` with a six-place pattern, and a float
 * round-trip is how a coordinate acquires a seventh place the server refuses.
 */
export interface Coordinates {
  latitude: string;
  longitude: string;
}

/** One resolved level: an id from our own tables, its name, and how sure. */
export type GeocodeMatch = Schemas["GeocodeMatch"];

/** What `GET /geocode/reverse` answers. */
export type ReverseGeocodeResult = Schemas["ReverseGeocode"];

/** The three levels of the cascade, spelled as the endpoint names them. */
export type AddressLevel = Schemas["UnmatchedEnum"];

/** Outermost first, which is also the order the cascade is filled in. */
export const ADDRESS_LEVELS = [
  "province",
  "district",
  "neighborhood",
] as const satisfies readonly AddressLevel[];

/**
 * Six decimal places, because that is the contract's pattern
 * (`^-?\d{0,3}(?:\.\d{0,6})?$`) and a seventh is a 400. It is also about 11cm
 * on the ground, which is finer than anyone can place a pin on a phone.
 */
const COORDINATE_PRECISION = 6;

export function formatCoordinate(value: number): string {
  return value.toFixed(COORDINATE_PRECISION);
}

export function toCoordinates(latitude: number, longitude: number): Coordinates {
  return { latitude: formatCoordinate(latitude), longitude: formatCoordinate(longitude) };
}

/**
 * A record's stored pair, if it has one that means anything.
 *
 * Both halves or neither: a latitude with no longitude is not half a location,
 * it is a point on the Greenwich meridian, and rendering it would drop a marker
 * in the Gulf of Guinea for every record saved with one field filled.
 */
export function parseCoordinates(
  latitude: string | null | undefined,
  longitude: string | null | undefined,
): Coordinates | null {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return toCoordinates(lat, lng);
}

/** Identity for a point, for telling one from another. */
export function coordinateKey(coords: Coordinates | null): string {
  return coords ? `${coords.latitude},${coords.longitude}` : "";
}

export interface MapProvider {
  readonly name: string;
  /** Leaflet tile template. */
  readonly tileUrl: string;
  /** Required by the tile licence, and rendered on the map itself. */
  readonly tileAttribution: string;
  readonly maxZoom: number;
  /** Where a map with no pin opens: the whole country, so nowhere is implied. */
  readonly defaultCenter: readonly [number, number];
  readonly defaultZoom: number;
  /** Close enough to tell one building from the next. */
  readonly pinZoom: number;
  reverseGeocode(coords: Coordinates, signal?: AbortSignal): Promise<ReverseGeocodeResult>;
}

export const openStreetMapProvider: MapProvider = {
  name: "openstreetmap",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  // Roughly the centre of the country. A map that opened on Istanbul would be
  // making a suggestion, and suggesting is the one thing this screen has to be
  // careful about.
  defaultCenter: [39.06, 35.24],
  defaultZoom: 5,
  pinZoom: 17,
  reverseGeocode: (coords, signal) =>
    api.get<ReverseGeocodeResult>("/geocode/reverse", {
      query: { lat: coords.latitude, lng: coords.longitude },
      signal,
    }),
};

/** The one in use. Swapping providers is this line plus the object above. */
export const mapProvider: MapProvider = openStreetMapProvider;

export const geocodeKeys = {
  all: ["geocode"] as const,
  reverse: (coords: Coordinates | null) => ["geocode", "reverse", coordinateKey(coords)] as const,
} as const;

export function reverseGeocodeQuery(coords: Coordinates | null) {
  return queryOptions({
    queryKey: geocodeKeys.reverse(coords),
    queryFn: ({ signal }) => mapProvider.reverseGeocode(coords as Coordinates, signal),
    enabled: coords !== null,
    // A point does not move, and the server caches the answer anyway.
    // Refetching spends somebody's Nominatim quota to be told the same thing.
    staleTime: Infinity,
    // One attempt. The interesting failure here is the throttle, and retrying
    // into a rate limit is how a client earns a longer one.
    retry: false,
  });
}

/**
 * Whether there is anything here a user could accept.
 *
 * Not the same question as "did the request succeed". The endpoint answers 200
 * with three nulls when it looked and found nothing, and an accept-or-correct
 * panel offering that would be asking someone to confirm a blank.
 */
export function hasAnyMatch(result: ReverseGeocodeResult): boolean {
  return ADDRESS_LEVELS.some((level) => result[level] !== null);
}
