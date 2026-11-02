import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app';
import type { StarlinkQuery } from '../../src/starlink/ports';
import { FakeClock } from '../fakes';
import { metaContent, startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import {
  failingStarlink,
  orbitsDownStarlink,
  reentriesDownStarlink,
  sampleStarlink
} from './fakes';

const nastyStarlink = (): StarlinkQuery => ({
  snapshot: async () => {
    const real = await sampleStarlink().snapshot();
    const reentries = real.reentries && {
      ...real.reentries,
      recent: real.reentries.recent.map((r) => ({
        ...r,
        name: '<img src=x onerror=alert(1)>'
      }))
    };
    return {
      ...real,
      reentries,
      attribution: [
        { name: '<script>alert(1)</script>', url: 'https://example.com/"><b>' }
      ]
    };
  }
});

type Name =
  | 'ok'
  | 'down'
  | 'orbitsDown'
  | 'reentriesDown'
  | 'nasty'
  | 'newYear';
const servers = {} as Record<Name, TestServer>;
const html = {} as Record<Name, string>;
const headers = {} as Record<Name, Headers>;
const status = {} as Record<Name, number>;
let home: string;

beforeAll(async () => {
  const starlinks: Record<Name, StarlinkQuery> = {
    ok: sampleStarlink(),
    down: failingStarlink(),
    orbitsDown: orbitsDownStarlink(),
    reentriesDown: reentriesDownStarlink(),
    nasty: nastyStarlink(),
    newYear: sampleStarlink(new FakeClock('2027-01-01T00:00:00.000Z'))
  };
  for (const name of Object.keys(starlinks) as Name[]) {
    servers[name] = await startTestServer(
      createApp({ jet: sampleJet(), starlink: starlinks[name] })
    );
    const res = await fetch(`${servers[name].url}/starlink`);
    status[name] = res.status;
    headers[name] = res.headers;
    html[name] = await res.text();
  }
  home = await (await fetch(`${servers.ok.url}/`)).text();
});

afterAll(async () => {
  for (const server of Object.values(servers)) await server.close();
});

const text = (fragment: string): string =>
  fragment
    .replace(/<span class="sr-only">[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const element = (page: string, className: string): string =>
  page.match(
    new RegExp(`<(\\w+) class="${className}"[^>]*>[\\s\\S]*?</\\1>`)
  )?.[0] ?? '';

const DESCRIPTION =
  'Every Starlink satellite in orbit, moving live on a globe, with this year&#39;s re-entries listed as obituaries.';

describe('GET /starlink', () => {
  it('renders the approved title, heading and description', () => {
    expect(status.ok).toBe(200);
    expect(headers.ok.get('content-type')).toContain('text/html');
    expect(html.ok).toContain('<title>Starlink globe | elonmu.sh</title>');
    expect(html.ok).toMatch(/<h1[^>]*>Starlink globe<\/h1>/);
    expect(metaContent(html.ok, 'name="description"')).toBe(DESCRIPTION);
  });

  it('has its own canonical URL and share tags', () => {
    expect(html.ok).toContain(
      '<link rel="canonical" href="https://elonmu.sh/starlink"'
    );
    expect(metaContent(html.ok, 'property="og:url"')).toBe(
      'https://elonmu.sh/starlink'
    );
    expect(metaContent(html.ok, 'property="og:title"')).toBe(
      'Starlink globe | elonmu.sh'
    );
  });

  it('prints the in-orbit count over the globe, on the server', () => {
    expect(text(element(html.ok, 'starlink__count'))).toBe('200 in orbit');
  });

  it("heads the obituaries with this year's count", () => {
    expect(html.ok).toMatch(
      /<h2 id="obits-title">83 burned up in 2026\. RIP\.<\/h2>/
    );
  });

  it('lists the 12 latest re-entries, newest first, with dates and lifespans', () => {
    const obits = [
      ...html.ok.matchAll(/<li class="starlink__obit">([\s\S]*?)<\/li>/g)
    ].map(([, li]) => text(li));
    expect(obits).toHaveLength(12);
    expect(obits.slice(0, 3)).toEqual([
      'STARLINK-1309 2020 → Oct 29 lived 6 years, 7 months',
      'STARLINK-30233 2023 → Oct 29 lived 3 years, 3 months',
      'STARLINK-1036 2019 → Oct 27 lived 6 years, 11 months'
    ]);
  });

  it('reads the arrow as "to" and dates each end with <time>', () => {
    const first =
      html.ok.match(/<li class="starlink__obit">[\s\S]*?<\/li>/)?.[0] ?? '';
    expect(first).toContain('<time datetime="2020-03-18">2020</time>');
    expect(first).toContain('<time datetime="2026-10-29">Oct 29</time>');
    expect(first).toContain(
      '<span aria-hidden="true">→</span><span class="sr-only">to</span>'
    );
  });

  it('credits CelesTrak with a safe external link', () => {
    expect(text(element(html.ok, 'starlink__credit'))).toBe(
      'Orbits and re-entries: CelesTrak'
    );
    expect(html.ok).toContain(
      '<a href="https://celestrak.org" rel="noopener noreferrer">CelesTrak</a>'
    );
  });

  it('shows the still Earth until the globe loads, with the globe sources on its pane', () => {
    const pane =
      html.ok.match(/<div\s+class="starlink__globe"[^>]*>/)?.[0] ?? '';
    expect(pane).toContain('aria-hidden="true"');
    expect(pane).toMatch(
      /data-globe-src="\/static\/vendor\/globe\.gl\.min\.js\?v=\w+"/
    );
    expect(html.ok).toMatch(
      /<img\s+class="starlink__still"\s+src="\/static\/img\/globe\/teaser-earth\.webp\?v=\w+"/
    );
  });

  it('lets browsers cache the full page', () => {
    expect(headers.ok.get('cache-control')).not.toBe('no-store');
  });

  it('puts no inline style attributes or inline scripts on the page', () => {
    expect(html.ok).not.toMatch(/\sstyle=/);
    expect(html.ok).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
  });

  it('stays within 12 KB of HTML', () => {
    expect(Buffer.byteLength(html.ok)).toBeLessThanOrEqual(12 * 1024);
  });

  it('serves every local asset the page references', async () => {
    const urls = [
      ...html.ok.matchAll(/(?:href|src|data-[\w-]+)="(\/[^/"][^"]*)"/g)
    ]
      .map(([, url]) => url)
      .filter((url) => url.includes('?v='));
    expect(urls.some((u) => u.includes('starlink.css'))).toBe(true);
    for (const url of new Set(urls)) {
      const res = await fetch(`${servers.ok.url}${url}`);
      await res.arrayBuffer();
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });

  it('escapes the data it prints', () => {
    expect(html.nasty).not.toContain('<img src=x');
    expect(html.nasty).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html.nasty).not.toContain('<script>alert(1)');
    expect(html.nasty).not.toContain('"><b>');
  });
});

describe('GET /starlink on 1 January', () => {
  it('heads the obituaries with a zero count and prints no empty list', () => {
    expect(html.newYear).toContain('0 burned up in 2027. RIP.');
    expect(html.newYear).not.toMatch(/<ol\b/);
  });
});

describe('GET /starlink when CelesTrak fails', () => {
  it('still renders, uncached, with a short note when nothing has loaded', () => {
    expect(status.down).toBe(200);
    expect(headers.down.get('cache-control')).toBe('no-store');
    expect(html.down).toContain(
      'Satellite data is unavailable right now. Please try again in a few minutes.'
    );
    expect(html.down).toMatch(/<h1[^>]*>Starlink globe<\/h1>/);
    expect(html.down).not.toContain('starlink__count');
    expect(html.down).not.toContain('class="starlink__obits"');
  });

  it('keeps the obituaries, uncached, when only the orbits failed', () => {
    expect(headers.orbitsDown.get('cache-control')).toBe('no-store');
    expect(html.orbitsDown).not.toContain('starlink__count');
    expect(html.orbitsDown).toContain(
      'Satellite positions are unavailable right now.'
    );
    expect(html.orbitsDown).toContain('83 burned up in 2026. RIP.');
  });

  it('keeps the count, uncached, when only the re-entries failed', () => {
    expect(headers.reentriesDown.get('cache-control')).toBe('no-store');
    expect(text(element(html.reentriesDown, 'starlink__count'))).toBe(
      '200 in orbit'
    );
    expect(html.reentriesDown).not.toContain('class="starlink__obits"');
    expect(html.reentriesDown).toContain(
      "This year's re-entries are unavailable right now."
    );
  });
});

describe('starlink assets stay off the home page', () => {
  it('never loads globe.gl, starlink.js, orbits.js or starlink.css on the home page', () => {
    for (const file of ['globe.gl', 'starlink.js', 'orbits.js', 'starlink.css'])
      expect({ file, loaded: home.includes(file) }).toEqual({
        file,
        loaded: false
      });
  });
});

describe('starlink.css', () => {
  const cssDir = path.join(import.meta.dir, '../../src/public/static/css');
  const css = (file: string) =>
    readFileSync(path.join(cssDir, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
  const starlinkOnly = /\.starlink(?![a-z])/g;

  it('links main.css then starlink.css, each with a content hash', () => {
    const links = [
      ...html.ok.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)
    ].map(([, href]) => href);
    expect(links).toEqual([
      expect.stringMatching(/^\/static\/css\/main\.css\?v=\w+$/),
      expect.stringMatching(/^\/static\/css\/starlink\.css\?v=\w+$/)
    ]);
  });

  it('keeps the /starlink-only rules out of main.css, which every home visitor loads', () => {
    expect(css('main.css').match(starlinkOnly)).toBeNull();
    expect(css('starlink.css').match(starlinkOnly)?.length).toBeGreaterThan(0);
  });

  it('takes every colour from the site tokens', () => {
    expect(css('starlink.css')).not.toMatch(
      /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i
    );
  });

  it('sizes the big number with clamp() and tabular figures', () => {
    const rule =
      css('starlink.css').match(/\.starlink__number\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-size:\s*clamp\(/);
    expect(rule).toContain('font-variant-numeric: tabular-nums');
  });

  it('shows the credit link in the muted text, ink on hover and focus, like the other pages', () => {
    const sheet = css('starlink.css');
    expect(sheet).not.toMatch(/\.starlink__credit a\s*\{/);
    expect(sheet).toMatch(
      /\.starlink__credit a:hover,\s*\.starlink__credit a:focus-visible\s*\{\s*color: var\(--ink\);\s*\}/
    );
  });

  it('keeps every class in its stylesheet under .starlink__', () => {
    const classes = [...css('starlink.css').matchAll(/\.([a-z][\w-]*)/g)].map(
      ([, name]) => name
    );
    expect(
      classes.filter((c) => !c.startsWith('starlink__') && c !== 'has-globe')
    ).toEqual([]);
  });

  it('keeps a visible focus style and no !important', () => {
    expect(css('starlink.css')).not.toMatch(/outline:\s*(none|0)|!important/);
  });
});

describe('the page template', () => {
  const view = readFileSync(
    path.join(import.meta.dir, '../../src/views/starlink.ejs'),
    'utf8'
  );

  it('prints data only through escaping <%= %>', () => {
    const raw = [...view.matchAll(/<%-\s*([^%]*)%>/g)].map(([, code]) =>
      code.trim()
    );
    for (const code of raw) expect(code).toMatch(/^include\(/);
  });

  it('links every local file through asset()', () => {
    const local = [...view.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map(
      ([, url]) => url
    );
    expect(local).toEqual([]);
  });
});
