import type { Flight, Place } from '../../domain';

const austin: Place = {
  name: 'Austin, Texas, United States',
  lat: 30.27,
  lon: -97.74
};
const sanJose: Place = {
  name: 'San Jose, California, United States',
  lat: 37.34,
  lon: -121.89
};
const hawthorne: Place = {
  name: 'Hawthorne, California, United States',
  lat: 33.92,
  lon: -118.35
};
const brownsville: Place = {
  name: 'Brownsville, Texas, United States',
  lat: 25.9,
  lon: -97.5
};

const landed = (
  id: string,
  tail: string,
  from: Place,
  to: Place,
  departedAt: string,
  durationMin: number,
  gallons: number
): Flight => ({
  id,
  tail,
  from,
  to,
  departedAt,
  landedAt: new Date(
    Date.parse(departedAt) + durationMin * 60_000
  ).toISOString(),
  durationMin,
  fuel: {
    gallons,
    usd: Math.round(gallons * 7.78),
    co2Tons: Math.round(gallons * 0.0105 * 10) / 10
  },
  status: 'landed',
  sourceUrl: null
});

export const sampleFlights: Flight[] = [
  landed('s1', 'N628TS', austin, sanJose, '2026-02-03T15:10:00.000Z', 185, 760),
  landed('s2', 'N628TS', sanJose, austin, '2026-02-05T22:40:00.000Z', 170, 700),
  landed(
    's3',
    'N7628',
    austin,
    brownsville,
    '2026-04-11T13:05:00.000Z',
    65,
    270
  ),
  landed(
    's4',
    'N8628',
    austin,
    hawthorne,
    '2026-06-19T16:30:00.000Z',
    160,
    655
  ),
  landed(
    's5',
    'N8628',
    hawthorne,
    austin,
    '2026-06-21T01:15:00.000Z',
    150,
    620
  ),
  landed('s6', 'N628TS', austin, sanJose, '2026-09-30T14:20:00.000Z', 190, 780)
];
