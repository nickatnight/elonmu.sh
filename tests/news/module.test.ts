import { describe, expect, it } from 'bun:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { createNewsModule } from '../../src/news/index';
import { type NewsFailure, NewsUpstreamError } from '../../src/news/ports';
import { FakeClock, FakeLogger } from '../fakes';
import { newsApiArticle } from '../fixtures';

const quiet = { logger: new FakeLogger() };

describe('createNewsModule', () => {
  it('asks NewsAPI with the key it is given, and returns its article', async () => {
    const urls: string[] = [];
    const news = createNewsModule({
      ...quiet,
      apiKey: 'k-123',
      get: async (url) => {
        urls.push(url);
        return { data: { articles: [newsApiArticle] } };
      }
    });

    expect((await news.random()).title).toBe(newsApiArticle.title);
    expect(new URL(urls[0] ?? '').searchParams.get('apiKey')).toBe('k-123');
  });

  it('gives NewsAPI 10 s to answer, like the other upstreams', async () => {
    const configs: unknown[] = [];
    const news = createNewsModule({
      ...quiet,
      get: async (_url, config) => {
        configs.push(config);
        return { data: { articles: [newsApiArticle] } };
      }
    });
    await news.random();
    expect(configs).toEqual([{ timeout: 10_000 }]);
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
