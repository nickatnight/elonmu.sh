import type { Flight, Place } from '../../src/jet/domain';
import type { Clock, HttpGet, Logger } from '../../src/jet/ports';

export { InMemoryFlightSource } from '../../src/jet/sources/memory/in-memory-flight-source';

// A clock that only moves when a test moves it.
export class FakeClock implements Clock {
  private at: number;

  constructor(iso: string) {
    this.at = Date.parse(iso);
  }

  now(): Date {
    return new Date(this.at);
  }

  set(iso: string): void {
    this.at = Date.parse(iso);
  }

  advance(ms: number): void {
    this.at += ms;
  }
}

// Collects warnings instead of printing them.
export class FakeLogger implements Logger {
  readonly warnings: { msg: string; meta?: object }[] = [];

  warn(msg: string, meta?: object): void {
    this.warnings.push({ msg, meta });
  }
}

// An HttpGet answering from a URL → body table, recording each call. Unknown
// URLs reject, like an upstream 404.
export const fakeHttpGet = (
  responses: Record<string, unknown>
): { get: HttpGet; calls: string[] } => {
  const calls: string[] = [];
  const get = async <T>(url: string): Promise<T> => {
    calls.push(url);
    if (!(url in responses))
      throw new Error(`fakeHttpGet: no response for ${url}`);
    return responses[url] as T;
  };
  return { get, calls };
};

export const places = {
  austin: { name: 'Austin, Texas, United States', lat: 30.27, lon: -97.74 },
  sanJose: {
    name: 'San Jose, California, United States',
    lat: 37.34,
    lon: -121.89
  },
  hawthorne: {
    name: 'Hawthorne, California, United States',
    lat: 33.92,
    lon: -118.35
  },
  tokyo: { name: 'Tokyo, Japan', lat: 35.68, lon: 139.69 }
} satisfies Record<string, Place>;

// A landed flight with fuel; override any field per test.
export const flight = (overrides: Partial<Flight> = {}): Flight => ({
  id: 'f1',
  tail: 'N628TS',
  from: places.austin,
  to: places.sanJose,
  departedAt: '2026-03-01T14:00:00.000Z',
  landedAt: '2026-03-01T17:30:00.000Z',
  durationMin: 210,
  fuel: { gallons: 1000, usd: 6000, co2Tons: 10 },
  status: 'landed',
  sourceUrl: 'https://example.com/f1',
  ...overrides
});

// A mixed set spanning two years: the 2026 flights plus one from late 2025.
export const sampleFlights: Flight[] = [
  flight({
    id: 'last-year',
    departedAt: '2025-12-31T23:00:00.000Z',
    landedAt: '2026-01-01T02:00:00.000Z',
    durationMin: 180
  }),
  flight({ id: 'austin-sanjose' }),
  flight({
    id: 'arrival-only',
    tail: 'N7628',
    from: null,
    to: places.hawthorne,
    departedAt: null,
    landedAt: '2026-04-02T09:00:00.000Z',
    durationMin: 60,
    fuel: null,
    sourceUrl: null
  }),
  flight({
    id: 'tokyo-hop',
    tail: 'N8628',
    from: places.tokyo,
    to: places.tokyo,
    departedAt: '2026-05-10T03:00:00.000Z',
    landedAt: '2026-05-10T03:40:00.000Z',
    durationMin: 40,
    fuel: { gallons: 200, usd: 1200, co2Tons: 2 }
  }),
  flight({
    id: 'airborne',
    to: null,
    departedAt: '2026-06-01T12:00:00.000Z',
    landedAt: null,
    durationMin: null,
    fuel: null,
    status: 'airborne'
  })
];
