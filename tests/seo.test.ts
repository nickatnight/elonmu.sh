import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { startTestServer, type TestServer } from './helpers';

let server: TestServer;
let html: string;

beforeAll(async () => {
  server = await startTestServer(createApp());
  html = await (await fetch(`${server.url}/`)).text();
});

afterAll(() => server.close());

const ONE_DAY = 'public, max-age=86400';

describe('GET /robots.txt', () => {
  it('serves plain text with a one-day cache', async () => {
    const res = await fetch(`${server.url}/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(
      /^text\/plain; charset=utf-8$/i
    );
    expect(res.headers.get('cache-control')).toBe(ONE_DAY);
  });

  it('keeps crawlers off /api and /healthz and points at the sitemap', async () => {
    const body = await (await fetch(`${server.url}/robots.txt`)).text();
    expect(body).toMatch(/^User-agent: \*$/m);
    expect(body).toMatch(/^Disallow: \/api$/m);
    expect(body).toMatch(/^Disallow: \/healthz$/m);
    expect(body).toMatch(/^Sitemap: https:\/\/elonmu\.sh\/sitemap\.xml$/m);
    expect(body).not.toMatch(/^Disallow: \/$/m);
  });

  it('still carries the security headers', async () => {
    const res = await fetch(`${server.url}/robots.txt`);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('GET /sitemap.xml', () => {
  it('serves XML with a one-day cache', async () => {
    const res = await fetch(`${server.url}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/xml/);
    expect(res.headers.get('cache-control')).toBe(ONE_DAY);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });

  it('lists exactly one URL, equal to the page canonical', async () => {
    const body = await (await fetch(`${server.url}/sitemap.xml`)).text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    expect(locs).toEqual([canonical as string]);
  });
});

describe('static asset caching', () => {
  it('keeps the one-year cache on hashed assets', async () => {
    const href = html.match(
      /href="(\/static\/css\/main\.css\?v=[0-9a-f]+)"/
    )?.[1];
    if (!href) throw new Error('main.css link not found');
    const res = await fetch(`${server.url}${href}`);
    expect(res.status).toBe(200);
    // serve-static caps maxAge at one year, so this is 31536000, not the
    // 31557600 passed in app.ts
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000');
  });
});
