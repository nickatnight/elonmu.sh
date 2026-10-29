import { CachedValue } from '../cache/cached-value';
import type { Clock, Logger } from '../ports';
import type { Article } from './domain';
import type { ArticleSource } from './ports';

const TTL_MS = 15 * 60_000;
const RETRY_AFTER_MS = 60_000;
const KEY = 'latest';

export class CachedArticleSource implements ArticleSource {
  private readonly cache: CachedValue<Article[]>;

  constructor(
    private readonly inner: ArticleSource,
    clock: Clock,
    logger: Logger
  ) {
    this.cache = new CachedValue({
      clock,
      ttlMs: TTL_MS,
      logger,
      messages: {
        stale: 'news: refresh failed, serving stale articles',
        empty: 'news: refresh failed, no articles to serve'
      },
      retryAfterMs: RETRY_AFTER_MS
    });
  }

  latest(): Promise<Article[]> {
    return this.cache.get(KEY, () => this.inner.latest());
  }
}
