import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import type { JetSnapshot } from '../../src/jet/domain';
import { startTestServer, type TestServer } from '../helpers';
import { failingJet, flight, sampleJet } from './fakes';

// Enough flights that the JSON clears compression's 1 KB threshold.
const manyFlights = Array.from({ length: 20 }, (_, i) =>
  flight({
    id: `f${i}`,
    departedAt: `2026-03-${String(i + 1).padStart(2, '0')}T14:00:00.000Z`
  })
);

let ok: TestServer;
let down: TestServer;

beforeAll(async () => {
  ok = await startTestServer(createApp({ jet: sampleJet(manyFlights) }));
  down = await startTestServer(createApp({ jet: failingJet() }));
});

afterAll(async () => {
  await ok.close();
  await down.close();
});

// Left unread, a body holds the connection open and can stall server.close()
// in afterAll past the hook timeout.
const fetchGzip = async (url: string): Promise<Headers> => {
  const res = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip' },
    decompress: false
  });
  await res.body?.cancel();
  return res.headers;
};

describe('GET /api/jet/flights', () => {
  it('returns the JetQuery snapshot as JSON', async () => {
    const res = await fetch(`${ok.url}/api/jet/flights`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as JetSnapshot;
    expect(body).toEqual(await sampleJet(manyFlights).snapshot());
  });

  it('lets browsers and proxies cache it for a minute', async () => {
    const res = await fetch(`${ok.url}/api/jet/flights`);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('answers 200 with an error body, uncached, when no data has ever loaded', async () => {
    const res = await fetch(`${down.url}/api/jet/flights`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeString();
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe('a failing jet module', () => {
  it('leaves /healthz healthy', async () => {
    const res = await fetch(`${down.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('compression', () => {
  it('gzips the jet JSON', async () => {
    const headers = await fetchGzip(`${ok.url}/api/jet/flights`);
    expect(headers.get('content-encoding')).toBe('gzip');
  });

  it('gzips the home page HTML', async () => {
    const headers = await fetchGzip(`${ok.url}/`);
    expect(headers.get('content-encoding')).toBe('gzip');
  });

  it('gzips static CSS and JS', async () => {
    for (const file of ['/static/css/main.css', '/static/js/main.js']) {
      const headers = await fetchGzip(`${ok.url}${file}`);
      expect(headers.get('content-encoding')).toBe('gzip');
    }
  });

  it('leaves video files uncompressed so range requests still work', async () => {
    const headers = await fetchGzip(`${ok.url}/static/video/clown-cruise.mp4`);
    expect(headers.get('content-encoding')).toBeNull();
    expect(headers.get('accept-ranges')).toBe('bytes');
  });
});
