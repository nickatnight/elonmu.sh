import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { statSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app';
import type { Satellite } from '../../src/starlink/domain';
import { InMemoryOrbitSource } from '../../src/starlink/sources/memory/in-memory-orbit-source';
import { InMemoryReentrySource } from '../../src/starlink/sources/memory/in-memory-reentry-source';
import { StarlinkService } from '../../src/starlink/starlink.service';
import { FakeClock } from '../fakes';
import { startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import {
  capturedOrbits,
  capturedReentries,
  ORBITS_READ_AT,
  STARLINK_NOW
} from './fakes';

const KB = 1024;
const IN_ORBIT_2026_10_30 = 11_130;
const SHARE_ON_SPACEX_EPOCHS = 0.46;
const SPACEX_EPOCHS = Array.from({ length: 16 }, (_, k) =>
  new Date(
    Date.UTC(
      2026,
      9,
      27 + Math.floor(k / 6),
      [6, 8, 10, 12, 20, 22][k % 6],
      0,
      2
    )
  ).toISOString()
);
const EPOCH_SPAN_MS = 9 * 24 * 3_600_000;
const EARLIEST_EPOCH = Date.parse('2026-10-21T00:00:00.000Z');
const MEAN_MOTION_STEPS_PER_SHELL = 12;
const SHARE_DIRECT_TO_CELL = 0.06;

let seed = 33;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

const fullVolume = (): Satellite[] => {
  const launches = capturedOrbits().satellites.sort((a, b) => a.id - b.id);
  return Array.from({ length: IN_ORBIT_2026_10_30 }, (_, i) => {
    const launch =
      launches[Math.floor((i * launches.length) / IN_ORBIT_2026_10_30)];
    const dtc = rand() < SHARE_DIRECT_TO_CELL ? ' [DTC]' : '';
    return {
      id: 44_235 + i * 2 + (rand() < 0.15 ? 1 : 0),
      name: `STARLINK-${1000 + i * 3 + Math.floor(rand() * 3)}${dtc}`,
      epoch:
        rand() < SHARE_ON_SPACEX_EPOCHS
          ? SPACEX_EPOCHS[Math.floor(rand() * SPACEX_EPOCHS.length)]
          : new Date(
              EARLIEST_EPOCH + Math.floor(rand() * EPOCH_SPAN_MS)
            ).toISOString(),
      meanMotion:
        launch.meanMotion +
        Math.floor(rand() * MEAN_MOTION_STEPS_PER_SHELL) * 0.00001,
      meanMotionDot: launch.meanMotionDot * (0.5 + rand()),
      eccentricity: launch.eccentricity * (0.5 + rand()),
      inclination: launch.inclination + (rand() - 0.5) * 0.02,
      raan: (launch.raan + rand() - 0.5 + 360) % 360,
      argOfPerigee: rand() * 360,
      meanAnomaly: rand() * 360
    };
  });
};

let server: TestServer;
beforeAll(async () => {
  const starlink = new StarlinkService({
    orbits: new InMemoryOrbitSource({
      readAt: ORBITS_READ_AT,
      satellites: fullVolume()
    }),
    reentries: new InMemoryReentrySource(capturedReentries()),
    clock: new FakeClock(STARLINK_NOW)
  });
  server = await startTestServer(createApp({ jet: sampleJet(), starlink }));
});
afterAll(() => server.close());

const gzippedSize = async (url: string): Promise<number> => {
  const res = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip' },
    decompress: false
  });
  expect(res.headers.get('content-encoding')).toBe('gzip');
  const bytes = (await res.arrayBuffer()).byteLength;
  if (process.env.PRINT_BUDGETS)
    console.log(
      `${new URL(url).pathname}: ${(bytes / KB).toFixed(1)} KB gzipped`
    );
  return bytes;
};

describe('response budgets at the 2026-10-30 Starlink volume', () => {
  it('serves all 11,130 satellites in 340 KB or less gzipped', async () => {
    const body = (await (await fetch(`${server.url}/api/starlink`)).json()) as {
      satellites: unknown[];
    };
    expect(body.satellites).toHaveLength(IN_ORBIT_2026_10_30);
    expect(await gzippedSize(`${server.url}/api/starlink`)).toBeLessThanOrEqual(
      340 * KB
    );
  });
});

const scriptSize = (file: string): number =>
  statSync(path.join(import.meta.dir, '../../src/public/static/js', file)).size;

describe('script budgets', () => {
  it('keeps starlink.js at or under 8 KB', () => {
    expect(scriptSize('starlink.js')).toBeLessThanOrEqual(8 * KB);
  });

  it('keeps orbits.js at or under 4 KB', () => {
    expect(scriptSize('orbits.js')).toBeLessThanOrEqual(4 * KB);
  });
});
