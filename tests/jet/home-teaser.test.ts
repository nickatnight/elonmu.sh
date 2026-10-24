import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import type { JetQuery } from '../../src/jet/ports';
import { startTestServer, type TestServer } from '../helpers';
import { failingJet, flight, places, sampleJet } from './fakes';

const slowJet = (ms: number): JetQuery => ({
  snapshot: () =>
    new Promise((resolve) =>
      setTimeout(() => resolve(sampleJet().snapshot()), ms)
    )
});

const names = ['full', 'landed', 'empty', 'down', 'slow'] as const;
type Name = (typeof names)[number];
const servers = {} as Record<Name, TestServer>;
const html = {} as Record<Name, string>;
const ms = {} as Record<Name, number>;

beforeAll(async () => {
  const jets: Record<Name, JetQuery> = {
    full: sampleJet(),
    landed: sampleJet([
      flight({
        id: 'new',
        from: places.hawthorne,
        to: places.austin,
        departedAt: '2026-06-20T15:00:00.000Z'
      }),
      flight({ id: 'old', from: places.austin, to: places.sanJose })
    ]),
    empty: sampleJet([]),
    down: failingJet(),
    slow: slowJet(2000)
  };
  for (const name of names) {
    servers[name] = await startTestServer(createApp({ jet: jets[name] }));
    const t0 = performance.now();
    html[name] = await (await fetch(`${servers[name].url}/`)).text();
    ms[name] = performance.now() - t0;
  }
});

afterAll(async () => {
  for (const name of names) await servers[name].close();
});

const teaser = (name: Name) =>
  html[name].match(/<section class="teaser"[\s\S]*?<\/section>/)?.[0] ?? '';

describe('home jet teaser', () => {
  it('sits between the console and the docs', () => {
    const at = (s: string) => html.full.indexOf(s);
    expect(at('class="teaser"')).toBeGreaterThan(at('id="try"'));
    expect(at('class="teaser"')).toBeLessThan(at('id="get-api"'));
  });

  it('has its heading and links to /jet', () => {
    expect(teaser('full')).toMatch(/<h2[^>]*>Meanwhile, the jet<\/h2>/);
    expect(teaser('full')).toMatch(
      /<a class="button teaser__link" href="\/jet">Explore the globe/
    );
  });

  it('draws one SVG path per visible arc over the lazy, fixed-size Earth image', () => {
    const t = teaser('full');
    expect(t).toMatch(
      /<img[^>]+src="\/static\/img\/globe\/teaser-earth\.webp\?v=\w+"[^>]+width="960"[^>]+height="960"[^>]+loading="lazy"/
    );
    expect(t.match(/<path class="teaser__arc[^"]*"/g)).toHaveLength(1);
    expect(t).toMatch(
      /<svg[^>]+viewBox="0 0 960 960"[^>]+role="img"[^>]+aria-label="Map of 4 flights so far in 2026\.[^"]*"/
    );
  });

  it('marks an airborne newest flight with an origin dot, not an arc', () => {
    expect(teaser('full')).toMatch(/<circle class="teaser__origin"/);
    expect(teaser('full')).toContain('In the air since 12:00 UTC from Austin');
  });

  it('draws the newest landed flight bright, on top, with its pulse', () => {
    const t = teaser('landed');
    const arcs = [...t.matchAll(/<path class="(teaser__arc[^"]*)"/g)].map(
      (m) => m[1]
    );
    expect(arcs).toEqual(['teaser__arc', 'teaser__arc is-latest']);
    expect(t.match(/<path class="teaser__pulse"/g)).toHaveLength(1);
    expect(t).toContain('Latest: Hawthorne → Austin, Jun 20');
  });

  it('prints the year’s totals and credits the data source', () => {
    const text = teaser('full')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    expect(text).toContain('4 flights · 5 h');
    expect(teaser('full')).toContain('Flight data:');
  });

  it('shows the bare Earth and says so before the year’s first flight', () => {
    expect(teaser('empty')).toContain('No flights yet this year.');
    expect(teaser('empty')).not.toContain('<path');
    expect(teaser('empty')).toContain('teaser-earth.webp');
  });

  it('falls back to the bare Earth, a note and the link when data fails', () => {
    const t = teaser('down');
    expect(t).toContain('teaser-earth.webp');
    expect(t).not.toContain('<svg');
    expect(t).toContain('href="/jet"');
    expect(t).toContain('Flight data isn’t available right now.');
  });

  it('never holds the home page for a slow upstream: 300 ms, then the fallback', () => {
    expect(ms.slow).toBeLessThan(1000);
    expect(teaser('slow')).toContain('Flight data isn’t available right now.');
  });

  it('loads no script for the teaser', () => {
    expect(teaser('full')).not.toContain('<script');
  });
});
