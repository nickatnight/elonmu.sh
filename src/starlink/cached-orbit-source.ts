import { CachedValue } from '../cache/cached-value';
import type { Clock, Logger } from '../ports';
import type { OrbitCatalog } from './domain';
import type { OrbitSource } from './ports';
import { retryDelay } from './retry-delay';

const TTL_MS = 6 * 3_600_000;
const KEY = 'starlink-gp';

export class CachedOrbitSource implements OrbitSource {
  private readonly cache: CachedValue<OrbitCatalog>;

  constructor(
    private readonly inner: OrbitSource,
    clock: Clock,
    logger: Logger
  ) {
    this.cache = new CachedValue({
      clock,
      ttlMs: TTL_MS,
      logger,
      messages: {
        stale: 'starlink: orbit refresh failed, serving stale orbits',
        empty: 'starlink: orbit refresh failed, no orbits to serve'
      },
      retryAfterMs: retryDelay
    });
  }

  fetchOrbits(): Promise<OrbitCatalog> {
    return this.cache.get(KEY, () => this.inner.fetchOrbits());
  }
}
