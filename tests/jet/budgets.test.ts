import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app';
import type { Flight, Place } from '../../src/jet/domain';
import { JetService } from '../../src/jet/jet.service';
import placesJson from '../../src/jet/places/places.json';
import { startTestServer, type TestServer } from '../helpers';
import { FakeClock, flight, InMemoryFlightSource } from './fakes';

// Spec success criterion 11 (budgets) and 2 (swappability), as guards.

const root = path.join(import.meta.dir, '../..');
const publicDir = path.join(root, 'src/public');
const KB = 1024;
const sizeOf = (file: string) => statSync(path.join(publicDir, file)).size;

describe('asset budgets', () => {
  it('keeps the vendored globe.gl at or under 1.9 MB raw', () => {
    expect(sizeOf('static/vendor/globe.gl.min.js')).toBeLessThanOrEqual(
      1.9 * KB * KB
    );
  });

  it('keeps the night texture at or under 400 KB', () => {
    expect(sizeOf('static/img/globe/earth-night.jpg')).toBeLessThanOrEqual(
      400 * KB
    );
  });

  it('keeps the phone night texture at or under 120 KB', () => {
    expect(sizeOf('static/img/globe/earth-night-2048.jpg')).toBeLessThanOrEqual(
      120 * KB
    );
  });

  it('keeps the teaser Earth at or under 120 KB', () => {
    expect(sizeOf('static/img/globe/teaser-earth.webp')).toBeLessThanOrEqual(
      120 * KB
    );
  });
});

// A year-end-sized snapshot: ~390 flights at this year's pace, spread over
// the real gazetteer's places (the busiest routes repeat, as in life).
const gazetteer: Place[] = Object.entries(placesJson).map(
  ([name, [lat, lon]]) => ({
    name,
    lat,
    lon
  })
);
// Seeded pseudo-random numbers: the data must compress like the real
// feed's (random record keys, irregular times), or a gzip budget test
// passes long after real data would fail it.
let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const rkey = () =>
  `3m${Array.from({ length: 11 }, () => B32[Math.floor(rand() * 32)]).join('')}`;

// Places weighted by how often 2026's posts name them (the Task 4 survey):
// a few hubs dominate and routes repeat. Uniform picks would make every
// flight a new long arc, a worst case rather than a forecast.
const POSTS_PER_PLACE: Record<string, number> = {
  Austin: 179,
  'San Jose': 118,
  Burbank: 65,
  Hawthorne: 42,
  Memphis: 33,
  Temple: 30,
  Brownsville: 26,
  Dulles: 13,
  Jackson: 12,
  Lancaster: 12,
  'Los Angeles': 10,
  Mesa: 10
};
const weighted = gazetteer.flatMap((p) =>
  Array(POSTS_PER_PLACE[p.name.split(',')[0]] ?? 3).fill(p)
);
const pick = () => weighted[Math.floor(rand() * weighted.length)];

const yearEnd: Flight[] = Array.from({ length: 390 }, (_, i) => {
  const from = pick();
  const to = pick();
  const durationMin = 20 + Math.floor(rand() * 400);
  const departed =
    Date.UTC(2026, 0, 1) + i * 22 * 3600_000 + Math.floor(rand() * 3600_000);
  const id = rkey();
  return flight({
    id,
    tail: ['N628TS', 'N7628', 'N8628'][Math.floor(rand() * 3)],
    from,
    to,
    departedAt: new Date(departed).toISOString(),
    landedAt: new Date(
      departed + durationMin * 60_000 + rand() * 59_000
    ).toISOString(),
    durationMin,
    fuel: {
      gallons: Math.floor(rand() * 3000),
      usd: Math.floor(rand() * 24000),
      co2Tons: Math.floor(rand() * 32)
    },
    sourceUrl: `https://bsky.app/profile/elonjet.net/post/${id}`
  });
});

let server: TestServer;
beforeAll(async () => {
  // Clock at Dec 31 so all 390 flights count as this year.
  const jet = new JetService(
    new InMemoryFlightSource(yearEnd),
    new FakeClock('2026-12-31T23:00:00.000Z')
  );
  server = await startTestServer(createApp({ jet }));
});
afterAll(() => server.close());

const gzippedSize = async (url: string): Promise<number> => {
  const res = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip' },
    decompress: false
  });
  expect(res.headers.get('content-encoding')).toBe('gzip');
  const bytes = (await res.arrayBuffer()).byteLength;
  // PRINT_BUDGETS=1 bun test tests/jet/budgets.test.ts shows the headroom.
  if (process.env.PRINT_BUDGETS) {
    console.log(
      `${new URL(url).pathname}: ${(bytes / KB).toFixed(1)} KB gzipped`
    );
  }
  return bytes;
};

describe('response budgets at a year-end volume', () => {
  it('serves the flights JSON in 30 KB or less gzipped', async () => {
    const body = await (await fetch(`${server.url}/api/jet/flights`)).json();
    expect((body as { flights: unknown[] }).flights).toHaveLength(390);
    expect(
      await gzippedSize(`${server.url}/api/jet/flights`)
    ).toBeLessThanOrEqual(30 * KB);
  });

  it('serves the home page, teaser SVG included, in 30 KB or less gzipped', async () => {
    const html = await (await fetch(`${server.url}/`)).text();
    expect(
      (html.match(/<path class="teaser__arc/g) ?? []).length
    ).toBeGreaterThan(100);
    expect(await gzippedSize(`${server.url}/`)).toBeLessThanOrEqual(30 * KB);
  });
});

describe('swappable data source', () => {
  // Only the adapter folder and the composition root may name Bluesky.
  const tsFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return tsFiles(p);
      return e.name.endsWith('.ts') ? [p] : [];
    });

  it('mentions Bluesky only in sources/bluesky/ and src/jet/index.ts', () => {
    const offenders = tsFiles(path.join(root, 'src'))
      .filter((f) => /bluesky/i.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f))
      .filter(
        (f) =>
          !f.startsWith('src/jet/sources/bluesky/') && f !== 'src/jet/index.ts'
      );
    expect(offenders).toEqual([]);
  });

  it('serves flights with exactly the domain fields, nothing source-specific', async () => {
    const body = (await (
      await fetch(`${server.url}/api/jet/flights`)
    ).json()) as {
      flights: Record<string, unknown>[];
    };
    expect(Object.keys(body.flights[0]).sort()).toEqual([
      'departedAt',
      'durationMin',
      'from',
      'fuel',
      'id',
      'landedAt',
      'sourceUrl',
      'status',
      'tail',
      'to'
    ]);
    expect(Object.keys(body).sort()).toEqual([
      'attribution',
      'flights',
      'totals',
      'updatedAt',
      'year'
    ]);
  });
});
