import axios from 'axios';
import type { GetJson, HttpConfig } from '../http-config';
import type { Clock, HttpGet, Logger } from '../ports';
import { CachedFlightSource } from './cached-flight-source';
import { JetService } from './jet.service';
import { GazetteerPlaceResolver } from './places/gazetteer-place-resolver';
import places from './places/places.json';
import type { JetQuery } from './ports';
import { BlueskyFlightSource } from './sources/bluesky/bluesky-flight-source';

const BLUESKY_CONFIG: HttpConfig = { timeout: 10_000, maxRedirects: 0 };

const systemClock: Clock = { now: () => new Date() };

const CACHE_TTL_MS = 5 * 60_000;

const consoleLogger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

export const createJetModule = ({
  get = axios.get,
  clock = systemClock,
  logger = consoleLogger
}: {
  get?: GetJson;
  clock?: Clock;
  logger?: Logger;
} = {}): JetQuery => {
  const http: HttpGet = async <T>(url: string) =>
    (await get(url, BLUESKY_CONFIG)).data as T;
  const source = new BlueskyFlightSource({
    http,
    resolver: new GazetteerPlaceResolver(places),
    logger,
    clock
  });

  return new JetService(
    new CachedFlightSource(source, clock, CACHE_TTL_MS, logger),
    clock
  );
};

export const warmUp = async (
  jet: JetQuery,
  log: Logger = consoleLogger
): Promise<void> => {
  try {
    await jet.snapshot();
  } catch (err) {
    log.warn('jet: warm-up failed, will retry on the first request', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
