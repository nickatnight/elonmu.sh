import { describe, expect, it } from 'bun:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { createApp } from '../src/app';
import { createNewsModule } from '../src/news';
import { FakeClock, FakeLogger } from './fakes';
import { newsApiArticle } from './fixtures';
import { startTestServer } from './helpers';
import { sampleJet } from './jet/fakes';

type NewsGet = (url: string) => Promise<{ data: unknown }>;

const resolving =
  (data: unknown): NewsGet =>
  async () => ({ data });

const rejecting =
  (error: unknown): NewsGet =>
  async () => {
    throw error;
  };

const fetchFrom = async (get: NewsGet, path: string) => {
  const server = await startTestServer(
    createApp({
      jet: sampleJet(),
      news: createNewsModule({ get, logger: new FakeLogger() })
    })
  );
  try {
    return await fetch(`${server.url}${path}`);
  } finally {
    await server.close();
  }
};

const getApi = async (get: NewsGet) => {
  const res = await fetchFrom(get, '/api/news');
  return { status: res.status, body: await res.json() };
};

describe('GET /api', () => {
  it('is gone: the plain-text 404, and NewsAPI is never called', async () => {
    let calls = 0;
    const get: NewsGet = async () => {
      calls++;
      return { data: { articles: [newsApiArticle] } };
    };
    const res = await fetchFrom(get, '/api');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('does not compute...');
    expect(calls).toBe(0);
  });
});

describe('GET /api/news', () => {
  it('maps a NewsAPI article to the public shape', async () => {
    const get = resolving({ articles: [newsApiArticle] });

    expect(await getApi(get)).toEqual({
      status: 200,
      body: {
        source: 'Business Insider',
        title: newsApiArticle.title,
        description: newsApiArticle.description,
        url: newsApiArticle.url,
        urlImage: newsApiArticle.urlToImage,
        publishDate: newsApiArticle.publishedAt
      }
    });
  });

  it('returns 200 with an error when NewsAPI responds with an error', async () => {
    const get = rejecting(
      new AxiosError('401', 'ERR_BAD_REQUEST', undefined, {}, {
        status: 401
      } as AxiosResponse)
    );

    expect(await getApi(get)).toEqual({
      status: 200,
      body: {
        error: 'There was an error with NewsAPI. Please try again later.'
      }
    });
  });

  it('returns 200 with an error when NewsAPI never responds', async () => {
    const get = rejecting(
      new AxiosError('timeout', 'ECONNABORTED', undefined, {})
    );

    expect(await getApi(get)).toEqual({
      status: 200,
      body: {
        error: 'There was an error with request. Please try again later.'
      }
    });
  });

  it('returns 500 when the request could not be made', async () => {
    const get = rejecting(new AxiosError('bad config'));

    expect(await getApi(get)).toEqual({
      status: 500,
      body: { error: 'Something broke. Please try again later.' }
    });
  });

  it('returns 500 for non-Axios errors', async () => {
    const get = resolving({ articles: [] });

    expect(await getApi(get)).toEqual({
      status: 500,
      body: { error: 'An unknown error occurred. Please try again later.' }
    });
  });
});

describe('GET /api/news while NewsAPI is down', () => {
  it('answers with the same error body for a minute without asking NewsAPI, then asks again', async () => {
    let calls = 0;
    const get: NewsGet = async () => {
      calls++;
      throw new AxiosError('401', 'ERR_BAD_REQUEST', undefined, {}, {
        status: 401
      } as AxiosResponse);
    };
    const clock = new FakeClock('2026-10-28T09:00:00.000Z');
    const server = await startTestServer(
      createApp({
        jet: sampleJet(),
        news: createNewsModule({ get, clock, logger: new FakeLogger() })
      })
    );
    const body = async () => (await fetch(`${server.url}/api/news`)).json();
    const error = {
      error: 'There was an error with NewsAPI. Please try again later.'
    };
    try {
      expect(await body()).toEqual(error);
      clock.advance(59_000);
      expect(await body()).toEqual(error);
      expect(calls).toBe(1);
      clock.advance(1_000);
      expect(await body()).toEqual(error);
      expect(calls).toBe(2);
    } finally {
      await server.close();
    }
  });
});
