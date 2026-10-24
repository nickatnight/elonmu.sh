import type { Place } from '../domain';
import type { PlaceResolver } from '../ports';

export type Gazetteer = Record<string, readonly number[]>;

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
