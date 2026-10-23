import type { Attribution, Flight } from './domain';
import type { Clock, FlightSource } from './ports';

// Adds caching to any FlightSource without changing it:
// - a result is reused for `ttlMs` (5 minutes by default);
// - concurrent callers share one in-flight request;
// - when a refresh fails, the last good result for the same `since` is
//   served; with nothing to fall back on, the error is thrown.
export class CachedFlightSource implements FlightSource {
  private last: { at: number; since: number; flights: Flight[] } | null = null;
  private inFlight: { since: number; promise: Promise<Flight[]> } | null = null;

  constructor(
    private readonly inner: FlightSource,
    private readonly clock: Clock,
    private readonly ttlMs = 5 * 60_000
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
          if (last) return last.flights;
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
