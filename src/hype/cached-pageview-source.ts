import { CachedValue } from '../cache/cached-value';
import type { Clock, Logger } from '../ports';
import { type DayViews, isoDate } from './domain';
import type { PageviewSource } from './ports';

const TTL_MS = 4 * 60 * 60_000;
const RETRY_AFTER_MS = 60_000;

export class CachedPageviewSource implements PageviewSource {
  private readonly cache: CachedValue<DayViews[]>;

  constructor(
    private readonly inner: PageviewSource,
    clock: Clock,
    logger: Logger
  ) {
    this.cache = new CachedValue({
      clock,
      ttlMs: TTL_MS,
      logger,
      messages: {
        stale: 'hype: refresh failed, serving stale pageviews',
        empty: 'hype: refresh failed, no data to serve'
      },
      staleAcrossKeys: true,
      retryAfterMs: RETRY_AFTER_MS
    });
  }

  fetchDays(from: Date, to: Date): Promise<DayViews[]> {
    return this.cache.get(isoDate(to), () => this.inner.fetchDays(from, to));
  }
}
