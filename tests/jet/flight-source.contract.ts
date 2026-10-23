import { describe, expect, it } from 'bun:test';
import { type Flight, flightTime } from '../../src/jet/domain';
import type { FlightSource } from '../../src/jet/ports';

// What a FlightSource implementation hands the contract suite.
export type ContractSubject = {
  // A working source holding flights both before and on/after `since`.
  make: () => FlightSource;
  // The same source with its upstream failing.
  makeFailing: () => FlightSource;
  since: Date;
};

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
    value
  ) && !Number.isNaN(Date.parse(value));

// Rules 2–6 on an already-fetched list. Exported so pure pieces of an adapter
// (e.g. pairing) can be held to the same rules as the whole source.
export const assertFlightShape = (flights: Flight[]): void => {
  expect(new Set(flights.map((f) => f.id)).size).toBe(flights.length);
  for (const f of flights) {
    for (const place of [f.from, f.to]) {
      if (!place) continue;
      expect(place.lat).toBeGreaterThanOrEqual(-90);
      expect(place.lat).toBeLessThanOrEqual(90);
      expect(place.lon).toBeGreaterThanOrEqual(-180);
      expect(place.lon).toBeLessThanOrEqual(180);
    }
    for (const at of [f.departedAt, f.landedAt]) {
      if (at !== null) expect(isIsoDate(at)).toBe(true);
    }
    if (f.status === 'airborne') {
      expect(f.to).toBeNull();
      expect(f.landedAt).toBeNull();
    }
    if (f.sourceUrl !== null) expect(f.sourceUrl).toStartWith('https://');
  }
};

// The written FlightSource contract (src/jet/ports.ts) as one suite every
// implementation runs.
export const describeFlightSource = (
  name: string,
  subject: ContractSubject
): void => {
  describe(`${name} meets the FlightSource contract`, () => {
    it('1. returns only flights on or after `since`', async () => {
      const { since } = subject;
      const all = await subject.make().fetchFlights(new Date(0));
      const recent = await subject.make().fetchFlights(since);
      // Guard against a vacuous pass: the subject must hold both kinds.
      expect(recent.length).toBeGreaterThan(0);
      expect(recent.length).toBeLessThan(all.length);
      for (const f of recent) {
        const at = flightTime(f);
        expect(at).not.toBeNull();
        expect(Date.parse(at as string)).toBeGreaterThanOrEqual(
          since.getTime()
        );
      }
    });

    it('2–6. returns unique ids, valid coordinates, ISO times, consistent airborne flights and https links', async () => {
      const flights = await subject.make().fetchFlights(new Date(0));
      expect(flights.length).toBeGreaterThan(0);
      assertFlightShape(flights);
    });

    it('7. throws when the upstream fails', async () => {
      await expect(
        subject.makeFailing().fetchFlights(subject.since)
      ).rejects.toThrow();
    });
  });
};
