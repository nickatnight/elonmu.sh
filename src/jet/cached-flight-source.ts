import type { Clock, Logger } from '../ports';
import type { Attribution, Flight } from './domain';
import type { FlightSource } from './ports';

const silent: Logger = { warn: () => {} };

export class CachedFlightSource implements FlightSource {
  private last: { at: number; since: number; flights: Flight[] } | null = null;
  private inFlight: { since: number; promise: Promise<Flight[]> } | null = null;

  constructor(
    private readonly inner: FlightSource,
    private readonly clock: Clock,
    private readonly ttlMs = 5 * 60_000,
    private readonly logger: Logger = silent
  ) {}

  get attribution(): Attribution {
    return this.inner.attribution;
  }

  async fetchFlights(since: Date): Promise<Flight[]> {
    const key = since.getTime();
    const now = this.clock.now().getTime();
    const last = this.last?.since === key ? this.last : null;
    if (last && now - last.at < this.ttlMs) return last.flights;

    if (this.inFlight?.since !== key) {
      const promise = this.inner.fetchFlights(since).then(
        (flights) => {
          this.last = { at: now, since: key, flights };
          return flights;
        },
        (err: unknown) => {
          const error = err instanceof Error ? err.message : String(err);
          if (last) {
            this.logger.warn('jet: refresh failed, serving stale flights', {
              error,
              staleSince: new Date(last.at).toISOString()
            });
            return last.flights;
          }
          this.logger.warn('jet: refresh failed, no data to serve', { error });
          throw err;
        }
      );
      this.inFlight = { since: key, promise };
      // Not .finally(): that returns a second promise which would reject,
      // unhandled, whenever a cold fetch fails.
      promise.then(
        () => this.clearInFlight(promise),
        () => this.clearInFlight(promise)
      );
    }
    return this.inFlight.promise;
  }

  private clearInFlight(promise: Promise<Flight[]>): void {
    if (this.inFlight?.promise === promise) this.inFlight = null;
  }
}
