import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import type { HypeSeries } from '../../src/hype/domain';
import { startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import { failingHype, sampleHype } from './fakes';

let ok: TestServer;
let down: TestServer;

beforeAll(async () => {
  ok = await startTestServer(
    createApp({ jet: sampleJet(), hype: sampleHype() })
  );
  down = await startTestServer(
    createApp({ jet: sampleJet(), hype: failingHype() })
  );
});

afterAll(async () => {
  await ok.close();
  await down.close();
});

describe('GET /api/hype', () => {
  it('returns the HypeQuery series as JSON', async () => {
    const res = await fetch(`${ok.url}/api/hype`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()) as HypeSeries).toEqual(
      await sampleHype().series()
    );
  });

  it('has exactly the documented fields, with no Wikimedia ones', async () => {
    const body = (await (
      await fetch(`${ok.url}/api/hype`)
    ).json()) as HypeSeries;
    expect(Object.keys(body)).toEqual([
      'article',
      'from',
      'to',
      'updatedAt',
      'attribution',
      'days',
      'stats',
      'spikes'
    ]);
    expect(Object.keys(body.days[0])).toEqual(['date', 'views']);
    expect(Object.keys(body.stats)).toEqual(['total', 'median', 'peak']);
    expect(Object.keys(body.spikes[0])).toEqual([
      'date',
      'views',
      'timesMedian'
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /"(project|access|agent|timestamp|granularity)"/
    );
  });

  it('returns 365 days, oldest first, from yesterday back', async () => {
    const body = (await (
      await fetch(`${ok.url}/api/hype`)
    ).json()) as HypeSeries;
    expect(body.days).toHaveLength(365);
    expect(body.from).toBe('2025-10-27');
    expect(body.to).toBe('2026-10-26');
    expect(body.days[0].date).toBe(body.from);
    expect(body.days.at(-1)?.date).toBe(body.to);
  });

  it('lets browsers and proxies cache it for an hour', async () => {
    const res = await fetch(`${ok.url}/api/hype`);
    await res.arrayBuffer();
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('answers 200 with an error body, uncached, when no data has ever loaded', async () => {
    const res = await fetch(`${down.url}/api/hype`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { error: string };
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error).toBeString();
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe('a failing hype module', () => {
  it('leaves /healthz healthy', async () => {
    const res = await fetch(`${down.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
