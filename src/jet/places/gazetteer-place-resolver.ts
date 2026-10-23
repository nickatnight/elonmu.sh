import type { Place } from '../domain';
import type { PlaceResolver } from '../ports';

// Place name → [lat, lon], keyed exactly as a source posts the name. Typed
// as plain arrays because that is what a JSON import gives; the pair shape
// is checked at construction.
export type Gazetteer = Record<string, readonly number[]>;

// Looks places up in a bundled gazetteer (places.json). Lookups are exact:
// nothing is geocoded or fuzzy-matched at runtime. Bad coordinates fail
// loudly at startup rather than drawing an arc off the globe.
export class GazetteerPlaceResolver implements PlaceResolver {
  private readonly places = new Map<string, Place>();

  constructor(gazetteer: Gazetteer) {
    for (const [name, coords] of Object.entries(gazetteer)) {
      const [lat, lon] = coords;
      const valid =
        coords.length === 2 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
      if (!valid) {
        throw new RangeError(`places.json: ${name} has bad coordinates`);
      }
      this.places.set(name, { name, lat, lon });
    }
  }

  resolve(name: string): Place | null {
    return this.places.get(name) ?? null;
  }
}
