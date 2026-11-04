import { describe, expect, it } from 'bun:test';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { createNewsModule } from '../../src/news/index';
import { type NewsFailure, NewsUpstreamError } from '../../src/news/ports';
import { FakeClock, FakeLogger } from '../fakes';
import { newsApiArticle } from '../fixtures';
import { serveRedirect } from '../helpers';

const quiet = { logger: new FakeLogger() };

describe('createNewsModule', () => {
  it('sends the key in the X-Api-Key header and never in the URL', async () => {
    const requests: { url: string; config: unknown }[] = [];
    const news = createNewsModule({
      ...quiet,
      apiKey: 'k-123',
      get: async (url, config) => {
        requests.push({ url, config });

        return { data: { articles: [newsApiArticle] } };
      }
    });

    expect((await news.random()).title).toBe(newsApiArticle.title);
    expect(requests.map(({ config }) => config)).toEqual([
      expect.objectContaining({ headers: { 'X-Api-Key': 'k-123' } })
    ]);
    expect(requests.map(({ url }) => url)).toEqual([
      expect.not.stringMatching(/apiKey|k-123/)
    ]);
  });

  it('calls NewsAPI with the key header, a 10 s timeout and no redirects', async () => {
    const requests: { url: string; config: unknown }[] = [];
    const news = createNewsModule({
      ...quiet,
      apiKey: 'k-123',
      get: async (url, config) => {
        requests.push({ url, config });

        return { data: { articles: [newsApiArticle] } };
      }
    });

    await news.random();
    expect(requests).toEqual([
      {
        url: 'https://newsapi.org/v2/everything?q=elon%20musk&language=en',
        config: {
          timeout: 10_000,
          maxRedirects: 0,
          headers: { 'X-Api-Key': 'k-123' }
        }
      }
    ]);
  });

  it('warns once, when it is created, that NEWS_API_KEY is missing', async () => {
    const logger = new FakeLogger();
    const news = createNewsModule({
      logger,
      apiKey: '',
      get: async () => ({ data: { articles: [newsApiArticle] } })
    });
    const oneWarning = [{ msg: expect.stringContaining('NEWS_API_KEY') }];

    expect(logger.warnings).toEqual(oneWarning);
    await news.random();
    await news.random();
    expect(logger.warnings).toEqual(oneWarning);
  });

  it('logs nothing at creation when it has a key', () => {
    const logger = new FakeLogger();

    createNewsModule({
      logger,
      apiKey: 'k-123',
      get: async () => ({ data: {} })
    });
    expect(logger.warnings).toEqual([]);
  });

  it('reports a NewsAPI redirect as an error response and never follows it', async () => {
    const upstream = serveRedirect({ articles: [newsApiArticle] });

    try {
      const news = createNewsModule({
        ...quiet,
        apiKey: 'k-123',
        get: (_url, config) => axios.get(upstream.url, config)
      });
      const thrown = await news.random().catch((err: unknown) => err);

      expect((thrown as NewsUpstreamError).failure).toBe('error-response');
      expect(upstream.hits).toEqual(['/moved']);
    } finally {
      await upstream.stop();
    }
  });

  it('reports a timed-out request as no response, like any unanswered one', async () => {
    const news = createNewsModule({
      ...quiet,
      get: async () => {
        throw new AxiosError(
          'timeout of 10000ms exceeded',
          'ECONNABORTED',
          undefined,
          {}
        );
      }
    });
    const thrown = await news.random().catch((err: unknown) => err);

    expect((thrown as NewsUpstreamError).failure).toBe('no-response');
  });

  it('caches the articles, so requests within 15 minutes make one call', async () => {
    let calls = 0;
    const clock = new FakeClock('2026-10-28T09:00:00.000Z');
    const news = createNewsModule({
      ...quiet,
      clock,
      get: async () => {
        calls++;

        return { data: { articles: [newsApiArticle] } };
      }
    });

    await news.random();
    clock.advance(15 * 60_000 - 1);
    await news.random();
    expect(calls).toBe(1);
    clock.advance(1);
    await news.random();
    expect(calls).toBe(2);
  });

  it('picks the article with the random draw it is given', async () => {
    const news = createNewsModule({
      ...quiet,
      random: () => 0.99,
      get: async () => ({
        data: {
          articles: [
            { ...newsApiArticle, title: 'first' },
            { ...newsApiArticle, title: 'last' }
          ]
        }
      })
    });

    expect((await news.random()).title).toBe('last');
  });

  it.each([
    [
      'NewsAPI answered with an error',
      new AxiosError('401', 'ERR_BAD_REQUEST', undefined, {}, {
        status: 401
      } as AxiosResponse),
      'error-response'
    ],
    [
      'NewsAPI never answered',
      new AxiosError('timeout', 'ECONNABORTED', undefined, {}),
      'no-response'
    ],
    ['the request was never sent', new AxiosError('bad config'), 'not-sent']
  ] as [string, AxiosError, NewsFailure][])(
    'reports %s as a %s failure',
    async (_name, error, failure) => {
      const news = createNewsModule({
        ...quiet,
        get: async () => {
          throw error;
        }
      });
      const thrown = await news.random().catch((err: unknown) => err);

      expect(thrown).toBeInstanceOf(NewsUpstreamError);
      expect((thrown as NewsUpstreamError).failure).toBe(failure);
    }
  );

  it('passes other errors through unchanged', async () => {
    const error = new TypeError('boom');
    const news = createNewsModule({
      ...quiet,
      get: async () => {
        throw error;
      }
    });

    await expect(news.random()).rejects.toBe(error);
  });
});
