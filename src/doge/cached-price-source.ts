import { CachedValue } from '../cache/cached-value';
import type { Clock, Logger } from '../ports';
import type { PriceQuote } from './domain';
import type { PriceSource } from './ports';

const TTL_MS = 5 * 60_000;
const RETRY_AFTER_MS = 60_000;
const KEY = 'dogecoin-usd';

export class CachedPriceSource implements PriceSource {
  private readonly cache: CachedValue<PriceQuote>;

  constructor(
    private readonly inner: PriceSource,
    clock: Clock,
    logger: Logger
  ) {
    this.cache = new CachedValue({
      clock,
      ttlMs: TTL_MS,
      logger,
      messages: {
        stale: 'doge: refresh failed, serving a stale price',
        empty: 'doge: refresh failed, no price to serve'
      },
      retryAfterMs: RETRY_AFTER_MS
    });
  }

  fetchPrice(): Promise<PriceQuote> {
    return this.cache.get(KEY, () => this.inner.fetchPrice());
  }
}
