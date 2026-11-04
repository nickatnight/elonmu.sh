import { describe, expect, it } from 'bun:test';
import axios from 'axios';
import { createJetModule } from '../../src/jet/index';
import { FakeClock, FakeLogger } from '../fakes';
import { serveRedirect } from '../helpers';

const deps = () => ({
  clock: new FakeClock('2026-11-04T12:00:00.000Z'),
  logger: new FakeLogger()
});

describe('createJetModule', () => {
  it('calls Bluesky with a 10 s timeout and no redirects', async () => {
    const requests: { url: string; config: unknown }[] = [];
    const jet = createJetModule({
      ...deps(),
      get: async (url, config) => {
        requests.push({ url, config });

        return { data: { feed: [] } };
      }
    });

    await jet.snapshot();
    expect(requests).toEqual([
      {
        url: 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=elonjet.net&limit=100',
        config: { timeout: 10_000, maxRedirects: 0 }
      }
    ]);
  });

  it('fails on a Bluesky redirect with nothing cached, and never follows it', async () => {
    const upstream = serveRedirect({ feed: [] });

    try {
      const jet = createJetModule({
        ...deps(),
        get: (_url, config) => axios.get(upstream.url, config)
      });

      await expect(jet.snapshot()).rejects.toMatchObject({
        response: { status: 302 }
      });
      expect(upstream.hits).toEqual(['/moved']);
    } finally {
      await upstream.stop();
    }
  });
});
