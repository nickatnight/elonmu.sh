export type IsoTimestamp = string;

export type Place = { name: string; lat: number; lon: number };

export type Fuel = { gallons: number; usd: number; co2Tons: number };

export type Flight = {
  id: string;
  tail: string;
  from: Place | null;
  to: Place | null;
  departedAt: IsoTimestamp | null;
  landedAt: IsoTimestamp | null;
  durationMin: number | null;
  fuel: Fuel | null;
  status: 'landed' | 'airborne';
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
  updatedAt: IsoTimestamp;
  attribution: Attribution;
  flights: Flight[];
  totals: Totals;
};

export const UNKNOWN_TAIL = 'Unknown';

export const flightTime = (flight: Flight): IsoTimestamp | null =>
  flight.departedAt ?? flight.landedAt;
