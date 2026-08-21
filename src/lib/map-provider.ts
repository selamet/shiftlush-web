export interface Coordinates {
  latitude: string;
  longitude: string;
}

export interface ReverseGeocodeResult {
  province: string | null;
  district: string | null;
  neighborhood: string | null;
  street: string | null;
  /**
   * Trigram similarity of the provider's neighbourhood name against our own
   * address table. Below the threshold the result is offered as a suggestion
   * the user must confirm — filling in the wrong neighbourhood silently is
   * worse than leaving it blank.
   */
  confidence: number;
}

export const CONFIDENCE_THRESHOLD = 0.4;

/**
 * Map and geocoding sit behind this interface so swapping OpenStreetMap for a
 * commercial provider is a one-file change.
 *
 * Reverse geocoding is deliberately *not* called from the browser: it goes
 * through our own backend so results can be cached, the provider quota stays
 * under our control, and changing providers never touches this app.
 */
export interface MapProvider {
  readonly name: string;
  reverseGeocode(coords: Coordinates): Promise<ReverseGeocodeResult>;
}

/**
 * Stand-in until the tile layer and the backend geocoding endpoint are wired
 * up. It renders the surface and drives every interaction state the design
 * calls for; only the actual map imagery is missing.
 */
export const placeholderMapProvider: MapProvider = {
  name: "placeholder",
  async reverseGeocode() {
    return {
      province: null,
      district: null,
      neighborhood: null,
      street: null,
      confidence: 0,
    };
  },
};
