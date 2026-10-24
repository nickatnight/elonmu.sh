import axios from 'axios';
import { CachedFlightSource } from './cached-flight-source';
import { JetService } from './jet.service';
import { GazetteerPlaceResolver } from './places/gazetteer-place-resolver';
import places from './places/places.json';
import type { Clock, HttpGet, JetQuery, Logger } from './ports';
import { BlueskyFlightSource } from './sources/bluesky/bluesky-flight-source';

const systemClock: Clock = { now: () => new Date() };

const CACHE_TTL_MS = 5 * 60_000;

const http: HttpGet = async <T>(url: string) =>
  (await axios.get<T>(url, { timeout: 10_000 })).data;

const logger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

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
