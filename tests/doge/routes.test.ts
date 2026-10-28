import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import type { DogeComparison } from '../../src/doge/domain';
import { createDogeModule, type HttpConfig } from '../../src/doge/index';
import { FakeClock, FakeLogger } from '../fakes';
import capture from '../fixtures/coingecko-simple-price.json';
import { startTestServer, type TestServer } from '../helpers';
import { sampleHype } from '../hype/fakes';
import { sampleJet } from '../jet/fakes';
import { failingDoge, sampleDoge } from './fakes';

let ok: TestServer;
let down: TestServer;

beforeAll(async () => {
  ok = await startTestServer(
    createApp({ jet: sampleJet(), hype: sampleHype(), doge: sampleDoge() })
  );
  down = await startTestServer(
    createApp({ jet: sampleJet(), hype: sampleHype(), doge: failingDoge() })
  );
});

afterAll(async () => {
  await ok.close();
  await down.close();
});

describe('GET /api/doge', () => {
  it('returns the documented comparison as JSON', async () => {
    const res = await fetch(`${ok.url}/api/doge`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      coin: 'Dogecoin',
      snl: {
        at: '2021-05-09T03:30:00.000Z',
        usd: 0.67343,
        source: {
          label: 'Binance DOGE/USDT, 1-minute open at showtime',
          url: 'https://data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT&interval=1m&startTime=1620531000000&limit=1'
        }
      },
      now: { at: '2026-10-28T04:30:56.000Z', usd: 0.079484 },
      changePercent: -88.2,
      thousandDollarsNow: 118.03,
      attribution: {
        label: 'Data provided by CoinGecko',
        url: 'https://www.coingecko.com/en/coins/dogecoin'
      }
    });
  });

  it('has exactly the documented fields, with no CoinGecko ones', async () => {
    const text = await (await fetch(`${ok.url}/api/doge`)).text();
    const body = JSON.parse(text) as DogeComparison;
    expect(Object.keys(body)).toEqual([
      'coin',
      'snl',
      'now',
      'changePercent',
      'thousandDollarsNow',
      'attribution'
    ]);
    expect(Object.keys(body.snl)).toEqual(['at', 'usd', 'source']);
    expect(Object.keys(body.now)).toEqual(['at', 'usd']);
    expect(text).not.toMatch(/last_updated_at|"dogecoin"|vs_currencies/);
  });

  it('lets browsers and proxies cache it for 5 minutes', async () => {
    const res = await fetch(`${ok.url}/api/doge`);
    await res.arrayBuffer();
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('answers 200 with an error body, uncached, when no price has ever loaded', async () => {
    const res = await fetch(`${down.url}/api/doge`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { error: string };
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error).toBe(
      'Dogecoin prices are unavailable right now. Please try again later.'
    );
  });

  it('serves the last good price when CoinGecko fails after a good load', async () => {
    let failing = false;
    const get = async (_url: string, _config: HttpConfig) => {
      if (failing) throw new Error('Request failed with status code 429');
      return { data: capture };
    };
    const clock = new FakeClock('2026-10-28T04:50:00.000Z');
    const logger = new FakeLogger();
    const server = await startTestServer(
      createApp({
        jet: sampleJet(),
        hype: sampleHype(),
        doge: createDogeModule({ get, clock, logger })
      })
    );
    try {
      const fresh = await (await fetch(`${server.url}/api/doge`)).json();
      clock.advance(5 * 60_000);
      failing = true;
      const res = await fetch(`${server.url}/api/doge`);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300');
      expect(await res.json()).toEqual(fresh);
      expect((fresh as DogeComparison).now.usd).toBe(0.079636);
      expect(logger.warnings.map((w) => w.msg)).toEqual([
        'doge: refresh failed, serving a stale price'
      ]);
    } finally {
      await server.close();
    }
  });
});

describe('a failing doge module', () => {
  it('leaves /healthz healthy', async () => {
    const res = await fetch(`${down.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
