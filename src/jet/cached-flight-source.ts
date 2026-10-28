import { CachedValue } from '../cache/cached-value';
import type { Clock, Logger } from '../ports';
import type { Attribution, Flight } from './domain';
import type { FlightSource } from './ports';

const silent: Logger = { warn: () => {} };

export class CachedFlightSource implements FlightSource {
  private readonly cache: CachedValue<Flight[]>;

  constructor(
    private readonly inner: FlightSource,
    clock: Clock,
    ttlMs = 5 * 60_000,
    logger: Logger = silent
  ) {
    this.cache = new CachedValue({
      clock,
      ttlMs,
      logger,
      messages: {
        stale: 'jet: refresh failed, serving stale flights',
        empty: 'jet: refresh failed, no data to serve'
      }
    });
  }

  get attribution(): Attribution {
    return this.inner.attribution;
  }

  fetchFlights(since: Date): Promise<Flight[]> {
    return this.cache.get(String(since.getTime()), () =>
      this.inner.fetchFlights(since)
    );
  }
}
