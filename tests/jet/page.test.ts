import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app';
import { startTestServer, type TestServer } from '../helpers';
import { failingJet, flight, sampleJet } from './fakes';

// sampleJet() is frozen at 2026-07-01: four 2026 flights, newest airborne.
const servers: Record<'full' | 'empty' | 'down' | 'nasty', TestServer> =
  {} as never;
const html: Record<keyof typeof servers, string> = {} as never;

beforeAll(async () => {
  const nasty = flight({
    from: { name: '<img src=x onerror=alert(1)>, Evil, Place', lat: 1, lon: 1 }
  });
  const apps = {
    full: createApp({ jet: sampleJet() }),
    empty: createApp({ jet: sampleJet([]) }),
    down: createApp({ jet: failingJet() }),
    nasty: createApp({ jet: sampleJet([nasty]) })
  };
  for (const [name, app] of Object.entries(apps) as [
    keyof typeof servers,
    (typeof apps)['full']
  ][]) {
    servers[name] = await startTestServer(app);
    html[name] = await (await fetch(`${servers[name].url}/jet`)).text();
  }
});

afterAll(async () => {
  for (const server of Object.values(servers)) await server.close();
});

describe('GET /jet', () => {
  it('renders an HTML page with its own title and canonical URL', async () => {
    const res = await fetch(`${servers.full.url}/jet`);
    await res.arrayBuffer();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html.full).toMatch(/<title>[^<]*Jet[^<]*<\/title>/);
    expect(html.full).toContain(
      '<link rel="canonical" href="https://elonmu.sh/jet"'
    );
  });

  it('prints the year-to-date totals as plain numbers', () => {
    // The visible text: values and units are styled separately.
    const totals =
      html.full.match(/<ul class="totals"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const text = totals.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    // 210 + 60 + 40 min = 5 h; fuel from the three fuelled flights.
    expect(text).toContain('4 flights');
    expect(text).toContain('5 h');
    expect(text).toContain('1,200 gal');
    expect(text).toContain('$7.2K fuel');
    expect(text).toContain('12 t CO₂');
  });

  it('lists every flight, newest first, the latest one marked', () => {
    const rows = [
      ...html.full.matchAll(/<li class="flight[^"]*" data-flight="([^"]+)"/g)
    ];
    expect(rows.map((m) => m[1])).toEqual([
      'airborne',
      'tokyo-hop',
      'arrival-only',
      'austin-sanjose'
    ]);
    expect(rows[0][0]).toContain('is-latest');
  });

  it('says where an airborne flight left from and when', () => {
    expect(html.full).toContain('In the air since 12:00 UTC from Austin');
  });

  it('shows each row’s route, date and a link to the original post', () => {
    expect(html.full).toContain('Austin → San Jose');
    expect(html.full).toMatch(
      /<time datetime="2026-03-01T14:00:00.000Z">Mar 1<\/time>/
    );
    expect(html.full).toContain('href="https://example.com/f1"');
  });

  it('credits the data source with a safe external link', () => {
    expect(html.full).toMatch(
      /Flight data: <a href="https:\/\/elonmu\.sh\/jet" rel="noopener noreferrer">Sample flight data<\/a>/
    );
  });

  it('renders tail chips as pressed-state buttons, hidden until the script runs', () => {
    const chips = html.full.match(/<div class="chips"[^>]*>/)?.[0] ?? '';
    expect(chips).toContain('hidden');
    const buttons = html.full.match(/<button[^>]*class="chip"[^>]*>/g) ?? [];
    // All, then N628TS, N7628, N8628.
    expect(buttons).toHaveLength(4);
    for (const b of buttons) expect(b).toMatch(/aria-pressed="(true|false)"/);
    expect(buttons[0]).toContain('aria-pressed="true"');
  });

  it('has a polite live region for filter results', () => {
    expect(html.full).toMatch(
      /<p class="sr-only jet__status" aria-live="polite"><\/p>/
    );
  });

  it('hides the globe area from assistive tech and shows a still Earth without JS', () => {
    const globe =
      html.full.match(/<div\s+class="jet__globe"[^>]*>[\s\S]*?<\/div>/)?.[0] ??
      '';
    expect(globe).toContain('aria-hidden="true"');
    expect(globe).toMatch(
      /<img[^>]+src="\/static\/img\/globe\/teaser-earth\.webp\?v=\w+"/
    );
  });

  it('links main.css then jet.css, each with a content hash', () => {
    const sheets = [
      ...html.full.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)
    ].map(([, href]) => href);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatch(/^\/static\/css\/main\.css\?v=\w+$/);
    expect(sheets[1]).toMatch(/^\/static\/css\/jet\.css\?v=\w+$/);
  });

  it('says so when there are no flights yet this year', () => {
    expect(html.empty).toContain('No flights yet this year.');
    expect(html.empty.replace(/<[^>]+>/g, '')).toMatch(/0\s+flights/);
    expect(html.empty).not.toContain('data-flight=');
  });

  it('still renders, with a short note, when flight data has never loaded', async () => {
    const res = await fetch(`${servers.down.url}/jet`);
    await res.arrayBuffer();
    expect(res.status).toBe(200);
    expect(html.down).toContain('Flight data is unavailable right now');
    expect(html.down).not.toContain('data-flight=');
  });

  it('escapes post-derived text', () => {
    expect(html.nasty).not.toContain('<img src=x');
    expect(html.nasty).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('the live globe', () => {
  it('loads jet.js, and leaves globe.gl for jet.js to fetch after page load', () => {
    expect(html.full).toMatch(
      /<script type="module" src="\/static\/js\/jet\.js\?v=\w+"><\/script>/
    );
    // No script tag: the 523 KB library must not compete with the page's
    // own content for bandwidth. jet.js reads its hashed URL from here.
    expect(html.full).not.toMatch(/<script[^>]+globe\.gl/);
    expect(html.full).toMatch(
      /class="jet__globe"[^>]*data-globe-src="\/static\/vendor\/globe\.gl\.min\.js\?v=\w+"/
    );
  });

  it('hands jet.js the hashed night textures, desktop and phone', () => {
    expect(html.full).toMatch(
      /class="jet__globe"[^>]*data-texture="\/static\/img\/globe\/earth-night\.jpg\?v=\w+"/
    );
    expect(html.full).toMatch(
      /data-texture-small="\/static\/img\/globe\/earth-night-2048\.jpg\?v=\w+"/
    );
  });

  it('keys the globe’s marks inside the (aria-hidden) globe pane', () => {
    const globe =
      html.full.match(/<div\s+class="jet__globe"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const legend = globe.match(/<ul class="legend"[\s\S]*<\/ul>/)?.[0] ?? '';
    const items = [...legend.matchAll(/<li[^>]*>[\s\S]*?<\/li>/g)].map((m) =>
      m[0].replace(/<[^>]+>/g, '').trim()
    );
    expect(items).toEqual([
      'Latest flight',
      'Earlier flights',
      'Local hop or one end known',
      'In the air now'
    ]);
  });

  it('leaves "In the air now" out of the key when nothing is airborne', () => {
    expect(html.nasty).toContain('class="legend"');
    expect(html.nasty).not.toContain('In the air now');
  });

  it('never loads globe.gl or jet.js on the home page', async () => {
    const home = await (await fetch(`${servers.full.url}/`)).text();
    expect(home).not.toContain('globe.gl');
    expect(home).not.toContain('jet.js');
    expect(home).not.toContain('three');
  });

  it('links only main.css on the home page, never jet.css', async () => {
    const home = await (await fetch(`${servers.full.url}/`)).text();
    const sheets = [
      ...home.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)
    ].map(([, href]) => href);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatch(/^\/static\/css\/main\.css\?v=\w+$/);
  });

  it('fetches the still Earth (the page’s LCP) ahead of the globe library', () => {
    const still = html.full.match(/<img\s+class="jet__still"[^>]*>/)?.[0] ?? '';
    expect(still).toContain('fetchpriority="high"');
    expect(still).not.toContain('loading="lazy"');
  });

  it('serves every local asset the page references', async () => {
    const urls = [
      ...html.full.matchAll(
        /(?:href|src|data-texture(?:-small)?|data-globe-src)="(\/[^/"][^"]*)"/g
      )
    ]
      .map(([, url]) => url)
      .filter(
        (url) =>
          !['/', '/jet', '/api/news'].includes(url) && !url.startsWith('/#')
      );
    // Vendor script, jet.js, both globe images, stylesheet, icons.
    for (const want of [
      'globe.gl.min.js',
      'jet.js',
      'earth-night.jpg',
      'earth-night-2048.jpg',
      'teaser-earth.webp'
    ]) {
      expect(urls.some((u) => u.includes(want))).toBe(true);
    }
    for (const url of new Set(urls)) {
      const res = await fetch(`${servers.full.url}${url}`);
      await res.arrayBuffer();
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });

  it('serves the vendored globe.gl gzipped', async () => {
    const page = html.full.match(
      /data-globe-src="(\/static\/vendor\/globe\.gl\.min\.js\?v=\w+)"/
    )?.[1];
    const res = await fetch(`${servers.full.url}${page}`, {
      headers: { 'Accept-Encoding': 'gzip' },
      decompress: false
    });
    const body = await res.arrayBuffer();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    // Budget: ≤ 530 KB on the wire (spec, raised 2026-10-23).
    expect(body.byteLength).toBeLessThanOrEqual(530 * 1024);
  });
});

describe('topbar', () => {
  it('links to /jet from the home page', async () => {
    const home = await (await fetch(`${servers.full.url}/`)).text();
    expect(home).toMatch(/<a href="\/jet"[^>]*>Jet<\/a>/);
  });

  it('marks Jet as the current page on /jet', () => {
    expect(html.full).toMatch(/<a href="\/jet" aria-current="page">Jet<\/a>/);
  });

  it('points News API at the home page section from /jet', () => {
    expect(html.full).toMatch(/<a href="\/#get-api"[^>]*>News API<\/a>/);
  });

  it('marks only Jet as the current page', () => {
    expect(html.full.match(/aria-current="page"/g)?.length).toBe(1);
  });
});

describe('stylesheets', () => {
  const cssDir = path.join(import.meta.dir, '../../src/public/static/css');
  // Comments name jet.js and the like; only rules count.
  const css = (file: string) =>
    readFileSync(path.join(cssDir, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
  // Class selectors only /jet uses: .jet, .jet__*, .jet-tip, .chip(s)*,
  // .flight(s)*, .legend*, .totals*. The teaser's .teaser__totals doesn't match.
  const jetOnly = /\.(?:jet|chips?|flights?|legend|totals)(?![a-z])/g;

  it('keeps the /jet-only rules out of main.css, which every home visitor loads', () => {
    expect(css('main.css').match(jetOnly)).toBeNull();
  });

  it('puts them in jet.css', () => {
    const found = new Set(
      css('jet.css')
        .match(jetOnly)
        ?.map((s) => s.replace(/s$/, ''))
    );
    expect([...found].sort()).toEqual([
      '.chip',
      '.flight',
      '.jet',
      '.legend',
      '.total'
    ]);
  });
});
