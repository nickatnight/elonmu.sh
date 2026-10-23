import axios from 'axios';
import { CachedFlightSource } from './cached-flight-source';
import { JetService } from './jet.service';
import { GazetteerPlaceResolver } from './places/gazetteer-place-resolver';
import places from './places/places.json';
import type { Clock, HttpGet, JetQuery, Logger } from './ports';
import { BlueskyFlightSource } from './sources/bluesky/bluesky-flight-source';

const systemClock: Clock = { now: () => new Date() };

// How long a crawl of the feed is reused before the next refresh.
const CACHE_TTL_MS = 5 * 60_000;

const http: HttpGet = async <T>(url: string) =>
  (await axios.get<T>(url, { timeout: 10_000 })).data;

const logger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

// The composition root: the only place a concrete flight source is named.
// Swapping the data source means changing the `source` line below, e.g. to
// `new InMemoryFlightSource(sampleFlights)` from ./sources/memory.
export const createJetModule = (): JetQuery => {
  const source = new BlueskyFlightSource({
    http,
    resolver: new GazetteerPlaceResolver(places),
    logger,
    clock: systemClock
  });
  return new JetService(
    new CachedFlightSource(source, systemClock, CACHE_TTL_MS, logger),
    systemClock
  );
};

// Loads the first snapshot at startup so the first visitor doesn't wait on
// the upstream crawl. Fire-and-forget: a failure is logged, never thrown,
// and never holds up the server.
export const warmUp = async (
  jet: JetQuery,
  log: Logger = logger
): Promise<void> => {
  try {
    await jet.snapshot();
  } catch (err) {
    log.warn('jet: warm-up failed, will retry on the first request', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
