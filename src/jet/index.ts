import axios from 'axios';
import { JetService } from './jet.service';
import { GazetteerPlaceResolver } from './places/gazetteer-place-resolver';
import places from './places/places.json';
import type { Clock, HttpGet, JetQuery, Logger } from './ports';
import { BlueskyFlightSource } from './sources/bluesky/bluesky-flight-source';

const systemClock: Clock = { now: () => new Date() };

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
  return new JetService(source, systemClock);
};
