import type { Attribution, Flight, JetSnapshot, Place, Totals } from './domain';
import { flightTime } from './domain';

// Plain-number formatting for the jet surfaces. Pure, so the views only
// print strings and every wording is unit-tested.

const sig3 = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const tonnes = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const usdCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 3
});
const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});
const day = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
});
const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC'
});

export type TotalPart = { value: string; unit: string };

export const formatTotals = (t: Totals): TotalPart[] => [
  {
    value: whole.format(t.flights),
    unit: t.flights === 1 ? 'flight' : 'flights'
  },
  { value: whole.format(t.hours), unit: 'h' },
  { value: sig3.format(t.gallons), unit: 'gal' },
  { value: usdCompact.format(t.usd), unit: 'fuel' },
  { value: sig3.format(t.co2Tons), unit: 't CO₂' }
];

// "313 flights · 515 h · 153,000 gal · $1.08M fuel · 1,610 t CO₂"
export const totalsLine = (t: Totals): string =>
  formatTotals(t)
    .map((p) => `${p.value} ${p.unit}`)
    .join(' · ');

// "2 h 5 min", "45 min", "3 h": the bot's own wording.
export const formatDuration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

const city = (place: Place | null): string | null =>
  place ? (place.name.split(',')[0] ?? place.name) : null;

// "Austin → San Jose", or words when an end is missing.
const route = (f: Flight): string => {
  const from = city(f.from);
  const to = city(f.to);
  if (f.status === 'airborne')
    return from ? `In the air from ${from}` : 'In the air';
  if (from && to) return `${from} → ${to}`;
  if (to) return `Arrived in ${to}`;
  if (from) return `Left ${from}`;
  return 'Unknown route';
};

const airborneNote = (f: Flight): string | null =>
  f.status === 'airborne' && f.departedAt
    ? `In the air since ${clock.format(new Date(f.departedAt))} UTC${f.from ? ` from ${city(f.from)}` : ''}`
    : null;

// The one-line summary of the newest flight, shared by /jet and the teaser.
export const latestSentence = (flights: readonly Flight[]): string | null => {
  const latest = flights[0];
  if (!latest) return null;
  const note = airborneNote(latest);
  if (note) return note;
  const at = flightTime(latest);
  const parts = [route(latest), at ? day.format(new Date(at)) : null].filter(
    Boolean
  );
  const duration =
    latest.durationMin === null ? null : formatDuration(latest.durationMin);
  return `Latest: ${parts.join(', ')}${duration ? ` · ${duration}` : ''}`;
};

export type FlightRow = {
  id: string;
  tail: string;
  datetime: string;
  date: string;
  route: string;
  // Full place names, for the row's accessible description.
  places: string;
  duration: string | null;
  fuel: string | null;
  status: Flight['status'];
  note: string | null;
  sourceUrl: string | null;
  latest: boolean;
};

export type JetPage = {
  year: number;
  totals: TotalPart[];
  totalsLine: string;
  tails: { tail: string; count: number }[];
  flights: FlightRow[];
  latest: string | null;
  attribution: Attribution;
};

const row = (f: Flight, i: number): FlightRow => {
  const at = flightTime(f) ?? '';
  return {
    id: f.id,
    tail: f.tail,
    datetime: at,
    date: at ? day.format(new Date(at)) : '',
    route: route(f),
    places: [f.from?.name ?? '?', f.to?.name ?? '?'].join(' → '),
    duration: f.durationMin === null ? null : formatDuration(f.durationMin),
    fuel: f.fuel
      ? `${usdWhole.format(f.fuel.usd)} · ${whole.format(f.fuel.gallons)} gal · ${tonnes.format(f.fuel.co2Tons)} t CO₂`
      : null,
    status: f.status,
    note: airborneNote(f),
    // Post-derived links are only ever https.
    sourceUrl: f.sourceUrl?.startsWith('https://') ? f.sourceUrl : null,
    latest: i === 0
  };
};

// Everything the /jet page prints, from one snapshot.
export const jetPage = (snapshot: JetSnapshot): JetPage => {
  const counts = new Map<string, number>();
  for (const f of snapshot.flights)
    counts.set(f.tail, (counts.get(f.tail) ?? 0) + 1);
  const tails = [...counts]
    .map(([tail, count]) => ({ tail, count }))
    .sort((a, b) =>
      a.tail === 'Unknown'
        ? 1
        : b.tail === 'Unknown'
          ? -1
          : a.tail.localeCompare(b.tail)
    );
  return {
    year: snapshot.year,
    totals: formatTotals(snapshot.totals),
    totalsLine: totalsLine(snapshot.totals),
    tails,
    flights: snapshot.flights.map(row),
    latest: latestSentence(snapshot.flights),
    attribution: snapshot.attribution
  };
};
