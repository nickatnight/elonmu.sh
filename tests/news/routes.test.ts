import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import { startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import { article, sampleNews } from './fakes';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(
    createApp({ jet: sampleJet(), news: sampleNews() })
  );
});

afterAll(() => server.close());

describe('GET /api/news over the wire', () => {
  it('sends the article as compact JSON, keys in the documented order', async () => {
    const res = await fetch(`${server.url}/api/news`);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    const a = article();
    expect(await res.text()).toBe(
      JSON.stringify({
        source: a.source,
        title: a.title,
        description: a.description,
        url: a.url,
        urlImage: a.urlImage,
        publishDate: a.publishDate
      })
    );
  });

  it('sets no Cache-Control, as before the move', async () => {
    const res = await fetch(`${server.url}/api/news`);
    await res.arrayBuffer();
    expect(res.headers.get('cache-control')).toBeNull();
  });
});
