import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import type { StarlinkSnapshot } from '../../src/starlink/domain';
import {
  createStarlinkModule,
  type HttpConfig
} from '../../src/starlink/index';
import { GP_URL } from '../../src/starlink/sources/celestrak/celestrak-orbit-source';
import { FakeClock, FakeLogger } from '../fakes';
import gpCapture from '../fixtures/celestrak-starlink-gp.json';
import satcatCapture from '../fixtures/celestrak-starlink-satcat.json';
import { startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import {
  failingStarlink,
  orbitsDownStarlink,
  reentriesDownStarlink,
  sampleStarlink
} from './fakes';

type Name = 'ok' | 'down' | 'orbitsDown' | 'reentriesDown';
const servers = {} as Record<Name, TestServer>;

beforeAll(async () => {
  const starlinks = {
    ok: sampleStarlink(),
    down: failingStarlink(),
    orbitsDown: orbitsDownStarlink(),
    reentriesDown: reentriesDownStarlink()
  };
  for (const name of Object.keys(starlinks) as Name[])
    servers[name] = await startTestServer(
      createApp({ jet: sampleJet(), starlink: starlinks[name] })
    );
});

afterAll(async () => {
  for (const server of Object.values(servers)) await server.close();
});

const get = (name: Name) => fetch(`${servers[name].url}/api/starlink`);

describe('GET /api/starlink', () => {
  it('returns the snapshot as JSON with exactly the documented fields', async () => {
    const res = await get('ok');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as StarlinkSnapshot;
    expect(Object.keys(body)).toEqual([
      'updatedAt',
      'inOrbit',
      'satellites',
      'reentries',
      'attribution'
    ]);
    expect(Object.keys(body.satellites?.[0] ?? {})).toEqual([
      'id',
      'name',
      'epoch',
      'meanMotion',
      'meanMotionDot',
      'eccentricity',
      'inclination',
      'raan',
      'argOfPerigee',
      'meanAnomaly'
    ]);
    expect(Object.keys(body.reentries ?? {})).toEqual([
      'year',
      'count',
      'recent'
    ]);
    expect(Object.keys(body.reentries?.recent[0] ?? {})).toEqual([
      'id',
      'name',
      'launched',
      'reentered'
    ]);
    expect(body.attribution).toEqual([
      { name: 'CelesTrak', url: 'https://celestrak.org' }
    ]);
  });

  it('carries no CelesTrak field names', async () => {
    const text = await (await get('ok')).text();
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });

  it('lets browsers and proxies cache it for an hour', async () => {
    const res = await get('ok');
    await res.arrayBuffer();
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('answers 200 with an error body, uncached, when CelesTrak has never answered', async () => {
    const res = await get('down');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: 'Starlink data is unavailable right now. Please try again later.'
    });
  });

  it('serves the re-entries with null orbits, uncached, when only the orbits failed', async () => {
    const res = await get('orbitsDown');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as StarlinkSnapshot;
    expect(body.inOrbit).toBeNull();
    expect(body.satellites).toBeNull();
    expect(body.reentries?.count).toBe(83);
  });

  it('serves the orbits with null re-entries, uncached, when only the catalogue failed', async () => {
    const res = await get('reentriesDown');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as StarlinkSnapshot;
    expect(body.inOrbit).toBe(200);
    expect(body.reentries).toBeNull();
  });

  it('serves the last good orbits when CelesTrak fails after a good load', async () => {
    let failing = false;
    const get = async (url: string, _config: HttpConfig) => {
      if (failing) throw new Error('Request failed with status code 403');
      return { data: url === GP_URL ? gpCapture : satcatCapture };
    };
    const clock = new FakeClock('2026-10-30T04:30:00.000Z');
    const logger = new FakeLogger();
    const server = await startTestServer(
      createApp({
        jet: sampleJet(),
        starlink: createStarlinkModule({ get, clock, logger })
      })
    );
    try {
      const fresh = await (await fetch(`${server.url}/api/starlink`)).json();
      clock.advance(12 * 3_600_000);
      failing = true;
      const res = await fetch(`${server.url}/api/starlink`);
      expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
      expect(await res.json()).toEqual(fresh);
      expect(logger.warnings.map((w) => w.msg).sort()).toEqual([
        'starlink: orbit refresh failed, serving stale orbits',
        'starlink: re-entry refresh failed, serving stale re-entries'
      ]);
    } finally {
      await server.close();
    }
  });
});

describe('a failing starlink module', () => {
  it('leaves /healthz healthy', async () => {
    const res = await fetch(`${servers.down.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
