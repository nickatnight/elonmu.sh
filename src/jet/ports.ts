import type { Attribution, Flight, JetSnapshot, Place } from './domain';

// Any provider of flights: a social feed, an ADS-B API, a fixture, a cache
// around another source.
export interface FlightSource {
  readonly attribution: Attribution;
  /**
   * Contract (tests/jet/flight-source.contract.ts):
   * 1. only flights whose `departedAt ?? landedAt` is on or after `since`
   * 2. ids are unique
   * 3. lat in [-90, 90], lon in [-180, 180]
   * 4. timestamps parse as ISO dates
   * 5. `status: 'airborne'` implies `to === null && landedAt === null`
   * 6. `sourceUrl` is `https:` or null
   * 7. throws on upstream failure; never returns partial data silently
   */
  fetchFlights(since: Date): Promise<Flight[]>;
}

// Place name → coordinates, for sources that only have names.
export interface PlaceResolver {
  resolve(name: string): Place | null;
}

// What routes and views see: one call for everything they render.
export interface JetQuery {
  snapshot(): Promise<JetSnapshot>;
}

export interface Clock {
  now(): Date;
}

export type HttpGet = <T>(url: string) => Promise<T>;

export interface Logger {
  warn(msg: string, meta?: object): void;
}
