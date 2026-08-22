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
 * Stand-in until `POST /geocode/reverse` exists on the API.
 *
 * It answers every call with nulls and a confidence of zero, which is not a
 * placeholder's convenience but the behaviour section 9.4 asks for: below the
 * threshold nothing is written into the address fields and the user picks the
 * neighbourhood themselves. A stub that guessed would cause the exact failure
 * this interface exists to prevent.
 *
 * Nothing imports it yet, and deliberately so. There is no map surface in the
 * application, because a surface with no endpoint behind it is a control that
 * looks live and does nothing. The seam is here so that landing the endpoint is
 * a one-file change; `AddressSelect` is where the accept-or-correct affordance
 * belongs when it does.
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
