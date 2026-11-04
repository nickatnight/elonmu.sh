import axios, { AxiosError } from 'axios';
import type { GetJson, HttpConfig } from '../http-config';
import type { Clock, HttpGet, Logger } from '../ports';
import { CachedArticleSource } from './cached-article-source';
import { NewsService } from './news.service';
import { type NewsQuery, NewsUpstreamError } from './ports';
import { NewsApiArticleSource } from './sources/newsapi/newsapi-article-source';

const systemClock: Clock = { now: () => new Date() };

const consoleLogger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

const classify = (err: unknown): unknown => {
  if (!(err instanceof AxiosError)) return err;

  if (err.response)
    return new NewsUpstreamError('error-response', { cause: err });

  if (err.request) return new NewsUpstreamError('no-response', { cause: err });

  return new NewsUpstreamError('not-sent', { cause: err });
};

export const createNewsModule = ({
  get = axios.get,
  apiKey = process.env.NEWS_API_KEY ?? '',
  clock = systemClock,
  logger = consoleLogger,
  random = Math.random
}: {
  get?: GetJson;
  apiKey?: string;
  clock?: Clock;
  logger?: Logger;
  random?: () => number;
} = {}): NewsQuery => {
  if (apiKey === '')
    logger.warn(
      'news: NEWS_API_KEY is not set, so NewsAPI will refuse requests'
    );

  const config: HttpConfig = {
    timeout: 10_000,
    maxRedirects: 0,
    headers: { 'X-Api-Key': apiKey }
  };
  const http: HttpGet = async <T>(url: string) => {
    try {
      return (await get(url, config)).data as T;
    } catch (err) {
      throw classify(err);
    }
  };

  return new NewsService(
    new CachedArticleSource(new NewsApiArticleSource({ http }), clock, logger),
    random
  );
};
