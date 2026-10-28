import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app';
import type { DogeQuery } from '../../src/doge/ports';
import { metaContent, startTestServer, type TestServer } from '../helpers';
import { sampleHype } from '../hype/fakes';
import { sampleJet } from '../jet/fakes';
import { failingDoge, NOW_QUOTE, sampleDoge } from './fakes';

const nastyDoge = (): DogeQuery => ({
  comparison: async () => ({
    ...(await sampleDoge().comparison()),
    attribution: {
      label: '<img src=x onerror=alert(1)>',
      url: 'https://example.com/"><script>'
    }
  })
});

type Name = 'down' | 'up' | 'unavailable' | 'nasty';
const servers = {} as Record<Name, TestServer>;
const html = {} as Record<Name, string>;
const headers = {} as Record<Name, Headers>;
const status = {} as Record<Name, number>;

beforeAll(async () => {
  const doges: Record<Name, DogeQuery> = {
    down: sampleDoge(),
    up: sampleDoge({ at: NOW_QUOTE.at, usd: 0.7563 }),
    unavailable: failingDoge(),
    nasty: nastyDoge()
  };
  for (const name of Object.keys(doges) as Name[]) {
    servers[name] = await startTestServer(
      createApp({ jet: sampleJet(), hype: sampleHype(), doge: doges[name] })
    );
    const res = await fetch(`${servers[name].url}/doge`);
    status[name] = res.status;
    headers[name] = res.headers;
    html[name] = await res.text();
  }
});

afterAll(async () => {
  for (const server of Object.values(servers)) await server.close();
});

const text = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,])/g, '$1')
    .trim();

const element = (page: string, className: string): string =>
  page.match(
    new RegExp(`<(\\w+) class="${className}"[^>]*>[\\s\\S]*?</\\1>`)
  )?.[0] ?? '';

const LEAD =
  "Dogecoin's price now against the minute he went on air hosting Saturday Night Live, 8 May 2021.";

describe('GET /doge', () => {
  it('renders an HTML page with the approved title, heading and lead', () => {
    expect(status.down).toBe(200);
    expect(headers.down.get('content-type')).toContain('text/html');
    expect(html.down).toContain('<title>DOGE since SNL | elonmu.sh</title>');
    expect(html.down).toMatch(/<h1[^>]*>DOGE since SNL<\/h1>/);
    expect(text(element(html.down, 'doge__lead'))).toBe(
      LEAD.replace("'", '&#39;')
    );
    expect(metaContent(html.down, 'name="description"')).toBe(
      LEAD.replace("'", '&#39;')
    );
  });

  it('has its own canonical URL and share tags', () => {
    expect(html.down).toContain(
      '<link rel="canonical" href="https://elonmu.sh/doge"'
    );
    expect(metaContent(html.down, 'property="og:url"')).toBe(
      'https://elonmu.sh/doge'
    );
    expect(metaContent(html.down, 'property="og:title"')).toBe(
      'DOGE since SNL | elonmu.sh'
    );
  });

  it('shows the fall as a big minus percentage, read out as "Down"', () => {
    const change = element(html.down, 'doge__change');
    expect(change).toContain('<span aria-hidden="true">−88.2%</span>');
    expect(change).toContain('<span class="sr-only">Down 88.2%</span>');
  });

  it('shows a rise as a big plus percentage, read out as "Up"', () => {
    const change = element(html.up, 'doge__change');
    expect(change).toContain('<span aria-hidden="true">+12.3%</span>');
    expect(change).toContain('<span class="sr-only">Up 12.3%</span>');
  });

  it('says what the DOGE $1,000 bought at showtime is worth today, as text', () => {
    expect(text(element(html.down, 'doge__line'))).toBe(
      '1,484.94 DOGE was worth $1,000.00 at showtime. Today it is worth $118.03.'
    );
    expect(text(element(html.up, 'doge__line'))).toBe(
      '1,484.94 DOGE was worth $1,000.00 at showtime. Today it is worth $1,123.06.'
    );
  });

  it('pairs SNL night with now, each with its price and time', () => {
    expect(text(element(html.down, 'doge__pair'))).toBe(
      'SNL night $1,000.00 $0.6734 · 8 May 2021, 11:30 pm ET ' +
        'Now $118.03 $0.0795 · 04:30 UTC, 28 Oct 2026'
    );
    expect(html.down).toContain('<time datetime="2021-05-09T03:30:00.000Z">');
    expect(html.down).toContain('<time datetime="2026-10-28T04:30:56.000Z">');
  });

  it('keeps only the dates in the pair at 360 px', () => {
    const pair = element(html.down, 'doge__pair');
    const withoutDetail = pair.replace(
      /<span class="doge__detail">[^<]*<\/span>/g,
      ''
    );
    expect(text(withoutDetail)).toBe(
      'SNL night $1,000.00 8 May 2021 Now $118.03 28 Oct 2026'
    );
  });

  it('credits CoinGecko and Binance with safe external links', () => {
    expect(text(element(html.down, 'doge__credit'))).toBe(
      'Live price: Data provided by CoinGecko. SNL price: Binance DOGE/USDT, 1-minute open at showtime.'
    );
    expect(html.down).toContain(
      '<a href="https://www.coingecko.com/en/coins/dogecoin" rel="noopener noreferrer">Data provided by CoinGecko</a>'
    );
    expect(html.down).toContain(
      '<a href="https://data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT&amp;interval=1m&amp;startTime=1620531000000&amp;limit=1" rel="noopener noreferrer">Binance DOGE/USDT, 1-minute open at showtime</a>'
    );
  });

  it('lets browsers cache the loaded page', () => {
    expect(headers.down.get('cache-control')).not.toBe('no-store');
  });

  it('puts no inline style attributes on the page', () => {
    expect(html.down).not.toMatch(/\sstyle=/);
  });

  it('stays within 20 KB of HTML', () => {
    expect(Buffer.byteLength(html.down)).toBeLessThanOrEqual(20 * 1024);
  });

  it('still renders, uncached, with a short note when CoinGecko has never answered', () => {
    expect(status.unavailable).toBe(200);
    expect(headers.unavailable.get('cache-control')).toBe('no-store');
    expect(html.unavailable).toContain(
      'Dogecoin prices are unavailable right now. Please try again in a few minutes.'
    );
    expect(html.unavailable).toMatch(/<h1[^>]*>DOGE since SNL<\/h1>/);
    expect(html.unavailable).not.toContain('doge__change');
    expect(html.unavailable).not.toContain('doge__pair');
  });

  it('escapes the data it prints', () => {
    expect(html.nasty).not.toContain('<img src=x');
    expect(html.nasty).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html.nasty).not.toContain('"><script>');
  });

  it('serves every local asset the page references', async () => {
    const urls = [...html.down.matchAll(/(?:href|src)="(\/[^/"][^"]*)"/g)]
      .map(([, url]) => url)
      .filter((url) => url.includes('?v='));
    expect(urls.some((u) => u.includes('doge.css'))).toBe(true);
    for (const url of new Set(urls)) {
      const res = await fetch(`${servers.down.url}${url}`);
      await res.arrayBuffer();
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });
});

describe('doge stylesheets', () => {
  const sheets = (page: string): string[] =>
    [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
      ([, href]) => href
    );

  it('links main.css then doge.css, each with a content hash', () => {
    const links = sheets(html.down);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatch(/^\/static\/css\/main\.css\?v=\w+$/);
    expect(links[1]).toMatch(/^\/static\/css\/doge\.css\?v=\w+$/);
  });

  it('never links doge.css on the home page', async () => {
    const home = await (await fetch(`${servers.down.url}/`)).text();
    expect(sheets(home).some((href) => href.includes('doge.css'))).toBe(false);
  });

  const cssDir = path.join(import.meta.dir, '../../src/public/static/css');
  const css = (file: string) =>
    readFileSync(path.join(cssDir, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
  const dogeOnly = /\.doge(?![a-z])/g;

  it('keeps the /doge-only rules out of main.css, which every home visitor loads', () => {
    expect(css('main.css').match(dogeOnly)).toBeNull();
  });

  it('puts them in doge.css', () => {
    expect(css('doge.css').match(dogeOnly)?.length).toBeGreaterThan(0);
  });

  it('takes every colour from the site tokens', () => {
    expect(css('doge.css')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('sizes the big number with clamp() and tabular figures', () => {
    const rule = css('doge.css').match(/\.doge__change\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-size:\s*clamp\(/);
    expect(rule).toContain('color: var(--accent)');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it('hides the price and clock in the pair only at 360 px and below', () => {
    const narrow =
      css('doge.css').match(
        /@media \(max-width: 22\.5rem\) \{([\s\S]*?)\n\}/
      )?.[1] ?? '';
    expect(narrow).toMatch(/\.doge__detail\s*\{\s*display:\s*none;/);
  });

  it('keeps a visible focus style, no underlines and no !important', () => {
    expect(css('doge.css')).not.toMatch(
      /text-decoration:\s*underline|outline:\s*(none|0)|!important/
    );
  });
});
