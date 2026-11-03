import { CachedValue } from '../cache/cached-value';
import type { Clock, Logger } from '../ports';
import type { ReentryLog } from './domain';
import type { ReentrySource } from './ports';
import { retryDelay } from './retry-delay';

const TTL_MS = 12 * 3_600_000;
const KEY = 'starlink-satcat';

export class CachedReentrySource implements ReentrySource {
  private readonly cache: CachedValue<ReentryLog>;

  constructor(
    private readonly inner: ReentrySource,
    clock: Clock,
    logger: Logger
  ) {
    this.cache = new CachedValue({
      clock,
      ttlMs: TTL_MS,
      logger,
      messages: {
        stale: 'starlink: re-entry refresh failed, serving stale re-entries',
        empty: 'starlink: re-entry refresh failed, no re-entries to serve'
      },
      retryAfterMs: retryDelay
    });
  }

  fetchReentries(): Promise<ReentryLog> {
    return this.cache.get(KEY, () => this.inner.fetchReentries());
  }
}
