// Source-agnostic jet domain. Nothing here may know where flights come from.

export type Place = { name: string; lat: number; lon: number };

export type Fuel = { gallons: number; usd: number; co2Tons: number };

export type Flight = {
  // Stable and unique within a source.
  id: string;
  tail: string;
  from: Place | null;
  // null while airborne or when the arrival is unknown.
  to: Place | null;
  // ISO 8601 timestamps.
  departedAt: string | null;
  landedAt: string | null;
  durationMin: number | null;
  fuel: Fuel | null;
  status: 'landed' | 'airborne';
  // https: link to the original record, if any.
  sourceUrl: string | null;
};

export type Attribution = { label: string; url: string };

export type Totals = {
  flights: number;
  hours: number;
  gallons: number;
  usd: number;
  co2Tons: number;
};

export type JetSnapshot = {
  year: number;
  // When this snapshot was assembled (ISO 8601). The flight data behind it
  // can be older: up to the cache TTL normally, and longer while the
  // upstream is failing (the server logs each failed refresh).
  updatedAt: string;
  attribution: Attribution;
  // Newest first.
  flights: Flight[];
  totals: Totals;
};

// The moment a flight is filed under: departure, or arrival when the
// departure wasn't seen. null when neither end has a time.
export const flightTime = (flight: Flight): string | null =>
  flight.departedAt ?? flight.landedAt;
