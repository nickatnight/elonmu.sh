import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app';
import type { HypeQuery } from '../../src/hype/ports';
import { metaContent, startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import { capturedDays, failingHype, sampleHype } from './fakes';

const nastyHype = (): HypeQuery => ({
  series: async () => ({
    ...(await sampleHype().series()),
    attribution: {
      label: '<img src=x onerror=alert(1)>',
      url: 'https://example.com/"><script>'
    }
  })
});

type Name = 'full' | 'empty' | 'down' | 'nasty';
const servers = {} as Record<Name, TestServer>;
const html = {} as Record<Name, string>;
const headers = {} as Record<Name, Headers>;

beforeAll(async () => {
  const hypes: Record<Name, HypeQuery> = {
    full: sampleHype(capturedDays()),
    empty: sampleHype([]),
    down: failingHype(),
    nasty: nastyHype()
  };
  for (const name of Object.keys(hypes) as Name[]) {
    servers[name] = await startTestServer(
      createApp({ jet: sampleJet(), hype: hypes[name] })
    );
    const res = await fetch(`${servers[name].url}/hype`);
    headers[name] = res.headers;
    html[name] = await res.text();
  }
});

afterAll(async () => {
  for (const server of Object.values(servers)) await server.close();
});

const svgs = (page: string): string[] =>
  page.match(/<svg\b[^>]*class="hype__svg[\s\S]*?<\/svg>/g) ?? [];

const text = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('GET /hype', () => {
  it('renders an HTML page with the approved title, heading and description', () => {
    expect(headers.full.get('content-type')).toContain('text/html');
    expect(html.full).toContain('<title>Hype meter | elonmu.sh</title>');
    expect(html.full).toMatch(/<h1[^>]*>Hype meter<\/h1>/);
    expect(metaContent(html.full, 'name="description"')).toBe(
      'Daily Wikipedia views of the Elon Musk article over the last year. ' +
        'Each spike is a tremor; the biggest are named.'
    );
  });

  it('has its own canonical URL and share tags', () => {
    expect(html.full).toContain(
      '<link rel="canonical" href="https://elonmu.sh/hype"'
    );
    expect(metaContent(html.full, 'property="og:url"')).toBe(
      'https://elonmu.sh/hype'
    );
    expect(metaContent(html.full, 'property="og:title"')).toBe(
      'Hype meter | elonmu.sh'
    );
  });

  it('draws a wide and a narrow chart, each an image with a summary', () => {
    const charts = svgs(html.full);
    expect(charts).toHaveLength(2);
    expect(charts[0]).toMatch(/class="hype__svg hype__svg--wide"/);
    expect(charts[0]).toContain('viewBox="0 0 720 ');
    expect(charts[1]).toMatch(/class="hype__svg hype__svg--narrow"/);
    expect(charts[1]).toContain('viewBox="0 0 360 ');
    for (const svg of charts) {
      expect(svg).toContain('role="img"');
      expect(svg).toContain(
        'aria-label="Daily views, 27 Oct 2025 – 26 Oct 2026, peak 194,434 on 12 Jun 2026"'
      );
    }
  });

  it('draws the needles as one path per colour', () => {
    const [wide] = svgs(html.full);
    expect(wide.match(/<path\b/g)).toHaveLength(2);
    expect(wide).toMatch(/<path class="hype__needles" d="M/);
    expect(wide).toMatch(/<path class="hype__needles hype__needles--hot" d="M/);
  });

  it('labels the spikes on the chart', () => {
    const [wide, narrow] = svgs(html.full);
    expect(wide.match(/class="hype__label"/g)).toHaveLength(5);
    expect(narrow.match(/class="hype__label"/g)).toHaveLength(3);
    expect(wide).toContain('12 Jun · 9.3×');
  });

  it('lists the spikes as an ordered list, readable without hovering', () => {
    const list =
      html.full.match(/<ol class="hype__spikes"[\s\S]*?<\/ol>/)?.[0] ?? '';
    const items = [...list.matchAll(/<li[\s\S]*?<\/li>/g)].map(([li]) =>
      text(li)
    );
    expect(items).toHaveLength(5);
    expect(items[0]).toBe('12 Jun 2026 194,434 views 9.3× a normal day');
    expect(list).toContain('<time datetime="2026-06-12">12 Jun 2026</time>');
  });

  it('states a normal day, the peak and the total', () => {
    const stats =
      html.full.match(/<ul class="hype__stats"[\s\S]*?<\/ul>/)?.[0] ?? '';
    expect(text(stats)).toBe(
      '20,803 views on a normal day 194,434 views at the peak, 12 Jun 2026 8,678,483 views in 365 days'
    );
  });

  it('credits Wikimedia with a safe external link', () => {
    expect(html.full).toContain(
      'Data: <a href="https://pageviews.wmcloud.org/?project=en.wikipedia.org&amp;pages=Elon_Musk" rel="noopener noreferrer">Wikimedia pageviews (en.wikipedia, users only)</a>'
    );
  });

  it('puts no inline style attributes on the page', () => {
    expect(html.full).not.toMatch(/\sstyle=/);
  });

  it('loads no script', () => {
    expect(html.full).not.toContain('<script');
  });

  it('stays within 60 KB of HTML for a full year', () => {
    expect(Buffer.byteLength(html.full)).toBeLessThanOrEqual(60 * 1024);
  });

  it('says so when there are no days to draw', () => {
    expect(html.empty).toContain('No pageviews in the last 365 days.');
    expect(svgs(html.empty)).toEqual([]);
    expect(html.empty).not.toContain('hype__spikes');
  });

  it('still renders, uncached, with a short note when Wikimedia has never answered', () => {
    expect(headers.down.get('cache-control')).toBe('no-store');
    expect(html.down).toContain(
      'Pageview data is unavailable right now. Please try again in a few minutes.'
    );
    expect(svgs(html.down)).toEqual([]);
  });

  it('escapes the data it prints', () => {
    expect(html.nasty).not.toContain('<img src=x');
    expect(html.nasty).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html.nasty).not.toContain('"><script>');
  });

  it('serves every local asset the page references', async () => {
    const urls = [...html.full.matchAll(/(?:href|src)="(\/[^/"][^"]*)"/g)]
      .map(([, url]) => url)
      .filter((url) => url.includes('?v='));
    expect(urls.some((u) => u.includes('hype.css'))).toBe(true);
    for (const url of new Set(urls)) {
      const res = await fetch(`${servers.full.url}${url}`);
      await res.arrayBuffer();
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });
});

describe('hype stylesheets', () => {
  const sheets = (page: string): string[] =>
    [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
      ([, href]) => href
    );

  it('links main.css then hype.css, each with a content hash', () => {
    const links = sheets(html.full);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatch(/^\/static\/css\/main\.css\?v=\w+$/);
    expect(links[1]).toMatch(/^\/static\/css\/hype\.css\?v=\w+$/);
  });

  it('never links hype.css on the home page', async () => {
    const home = await (await fetch(`${servers.full.url}/`)).text();
    expect(sheets(home).some((href) => href.includes('hype.css'))).toBe(false);
  });

  const cssDir = path.join(import.meta.dir, '../../src/public/static/css');
  const css = (file: string) =>
    readFileSync(path.join(cssDir, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
  const hypeOnly = /\.hype(?![a-z])/g;

  it('keeps the /hype-only rules out of main.css, which every home visitor loads', () => {
    expect(css('main.css').match(hypeOnly)).toBeNull();
  });

  it('puts them in hype.css', () => {
    expect(css('hype.css').match(hypeOnly)?.length).toBeGreaterThan(0);
  });

  it('keeps a visible focus style and no underlines', () => {
    expect(css('hype.css')).not.toMatch(
      /text-decoration:\s*underline|outline:\s*(none|0)/
    );
  });
});
