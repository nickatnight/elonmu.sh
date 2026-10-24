import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { metaContent, startTestServer, type TestServer } from './helpers';
import { sampleJet } from './jet/fakes';

let server: TestServer;
let html: string;

beforeAll(async () => {
  server = await startTestServer(createApp({ jet: sampleJet() }));
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
    expect(res.status).toBe(200);
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

  it('lists one URL per page, each equal to that page canonical', async () => {
    const body = await (await fetch(`${server.url}/sitemap.xml`)).text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const canonicals: string[] = [];
    for (const path of ['/', '/jet']) {
      const page = await (await fetch(`${server.url}${path}`)).text();
      const canonical = page.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect({ path, canonical }).toEqual({
        path,
        canonical: expect.any(String)
      });
      canonicals.push(canonical as string);
    }
    expect(locs).toEqual(canonicals);
  });
});

describe('share tag URLs', () => {
  it('point og:url and twitter:url at each page canonical', async () => {
    for (const path of ['/', '/jet']) {
      const page = await (await fetch(`${server.url}${path}`)).text();
      const canonical = page.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect({ path, canonical }).toEqual({
        path,
        canonical: expect.any(String)
      });
      for (const attr of ['property="og:url"', 'property="twitter:url"']) {
        expect({ path, attr, url: metaContent(page, attr) }).toEqual({
          path,
          attr,
          url: canonical as string
        });
      }
    }
  });
});

describe('/jet share tags', () => {
  let jet: string;
  beforeAll(async () => {
    jet = await (await fetch(`${server.url}/jet`)).text();
  });

  const meta = (attr: string) => metaContent(jet, attr);

  it('points og:url at its own canonical', () => {
    expect(meta('property="og:url"')).toBe('https://elonmu.sh/jet');
  });

  it('shares its own title and description', () => {
    const title = jet.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const description = meta('name="description"');
    expect(description).toBeTruthy();
    expect(meta('property="og:title"')).toBe(title);
    expect(meta('name="twitter:title"')).toBe(title);
    expect(meta('property="og:description"')).toBe(description);
    expect(meta('name="twitter:description"')).toBe(description);
  });

  it('uses the site share card, with its size and alt text', () => {
    for (const attr of [
      'property="og:image"',
      'property="og:image:width"',
      'property="og:image:height"',
      'property="og:image:alt"',
      'name="twitter:image"'
    ]) {
      expect({ attr, value: meta(attr) }).toEqual({
        attr,
        value: metaContent(html, attr)
      });
    }
    expect(meta('name="twitter:card"')).toBe('summary_large_image');
    expect(meta('property="og:type"')).toBe('website');
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
