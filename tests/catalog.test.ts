import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { SERVICES } from '../src/catalog';
import { sampleDoge } from './doge/fakes';
import { startTestServer, type TestServer } from './helpers';
import { sampleHype } from './hype/fakes';
import { sampleJet } from './jet/fakes';
import { sampleNews } from './news/fakes';

describe('SERVICES', () => {
  it('lists the News API, the jet tracker, the hype meter, then DOGE since SNL', () => {
    expect(SERVICES.map((service) => service.id)).toEqual([
      'news-api',
      'jet-tracker',
      'hype-meter',
      'doge-since-snl'
    ]);
  });

  it('has unique, kebab-case ids', () => {
    const ids = SERVICES.map((service) => service.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('links every service to a page of its own, never a fragment', () => {
    for (const { href } of SERVICES) expect(href).not.toContain('#');
  });

  it('names the news service News roulette, News in the nav', () => {
    expect(SERVICES[0]).toEqual({
      id: 'news-api',
      name: 'News roulette',
      nav: 'News',
      summary:
        'One random news article about Elon Musk. Spin again for another.',
      href: '/news',
      cta: 'Spin the wheel',
      api: '/api/news'
    });
  });

  it('links every service to a same-origin path', () => {
    // A leading "//" would be protocol-relative, i.e. another origin.
    for (const { href } of SERVICES) expect(href).toMatch(/^\/(?!\/)/);
  });

  it('fills every field', () => {
    for (const service of SERVICES) {
      for (const [field, value] of Object.entries(service)) {
        expect({ field, value: value.trim() }).not.toEqual({
          field,
          value: ''
        });
      }
    }
  });

  it('keeps HTML out of the summaries', () => {
    for (const { summary } of SERVICES) expect(summary).not.toMatch(/[<>]/);
  });

  it('gives every service its endpoint under /api', () => {
    expect(SERVICES.map(({ id, api }) => ({ id, api }))).toEqual([
      { id: 'news-api', api: '/api/news' },
      { id: 'jet-tracker', api: '/api/jet/flights' },
      { id: 'hype-meter', api: '/api/hype' },
      { id: 'doge-since-snl', api: '/api/doge' }
    ]);
  });
});

describe('SERVICES over HTTP', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(
      createApp({
        jet: sampleJet(),
        hype: sampleHype(),
        doge: sampleDoge(),
        news: sampleNews()
      })
    );
  });

  afterAll(() => server.close());

  it('serves every endpoint in the catalog as JSON with a 200', async () => {
    for (const { api } of SERVICES) {
      const res = await fetch(`${server.url}${api}`);
      const body = (await res.json()) as Record<string, unknown>;
      expect({ api, status: res.status, error: body.error }).toEqual({
        api,
        status: 200,
        error: undefined
      });
    }
  });
});
