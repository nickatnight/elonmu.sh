import type { Clock, Logger } from '../ports';

export type CachedValueOptions = {
  clock: Clock;
  ttlMs: number;
  logger: Logger;
  messages: { stale: string; empty: string };
  staleAcrossKeys?: boolean;
  retryAfterMs?: number;
};

type Entry<T> = { key: string; at: number; value: T };

type Failure = { at: number; error: unknown };

export class CachedValue<T> {
  private last: Entry<T> | null = null;
  private inFlight: { key: string; promise: Promise<T> } | null = null;
  private failure: Failure | null = null;

  constructor(private readonly options: CachedValueOptions) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const { clock, ttlMs, staleAcrossKeys = false } = this.options;
    const now = clock.now().getTime();
    const sameKey = this.last?.key === key ? this.last : null;
    if (sameKey && now - sameKey.at < ttlMs)
      return Promise.resolve(sameKey.value);
    if (this.inFlight?.key === key) return this.inFlight.promise;

    const fallback = staleAcrossKeys ? this.last : sameKey;
    const failure = this.backingOff(now);
    if (failure)
      return fallback
        ? Promise.resolve(fallback.value)
        : Promise.reject(failure.error);

    const promise = load().then(
      (value) => {
        this.last = { key, at: now, value };
        this.failure = null;
        return value;
      },
      (err: unknown) => this.recover(err, fallback)
    );
    this.inFlight = { key, promise };
    // Not .finally(): that returns a second promise which would reject,
    // unhandled, whenever a cold load fails.
    promise.then(
      () => this.clearInFlight(promise),
      () => this.clearInFlight(promise)
    );
    return promise;
  }

  private backingOff(now: number): Failure | null {
    const { retryAfterMs } = this.options;
    if (retryAfterMs === undefined || !this.failure) return null;
    return now - this.failure.at < retryAfterMs ? this.failure : null;
  }

  private recover(err: unknown, fallback: Entry<T> | null): T {
    const { clock, logger, messages } = this.options;
    this.failure = { at: clock.now().getTime(), error: err };
    const error = err instanceof Error ? err.message : String(err);
    if (fallback) {
      logger.warn(messages.stale, {
        error,
        staleSince: new Date(fallback.at).toISOString()
      });
      return fallback.value;
    }
    logger.warn(messages.empty, { error });
    throw err;
  }

  private clearInFlight(promise: Promise<T>): void {
    if (this.inFlight?.promise === promise) this.inFlight = null;
  }
}
