import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import type { NewsQuery } from '../src/news/ports';
import { startTestServer, type TestServer } from './helpers';
import { sampleJet } from './jet/fakes';
import { sampleNews } from './news/fakes';

let server: TestServer;
let newsCalls = 0;

const countingNews = (inner: NewsQuery): NewsQuery => ({
  random: () => {
    newsCalls++;
    return inner.random();
  }
});

beforeAll(async () => {
  server = await startTestServer(
    createApp({ jet: sampleJet(), news: countingNews(sampleNews()) })
  );
});

afterAll(() => server.close());

describe('GET /healthz', () => {
  it('returns 200 ok without calling NewsAPI', async () => {
    const res = await fetch(`${server.url}/healthz`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(newsCalls).toBe(0);
  });
});
