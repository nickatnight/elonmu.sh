import { JetService } from './jet.service';
import type { Clock, JetQuery } from './ports';
import { InMemoryFlightSource } from './sources/memory/in-memory-flight-source';
import { sampleFlights } from './sources/memory/sample-flights';

const systemClock: Clock = { now: () => new Date() };

// The composition root: the only place a concrete flight source is named.
// Swapping the data source means changing the `source` line below.
export const createJetModule = (): JetQuery => {
  const source = new InMemoryFlightSource(sampleFlights);
  return new JetService(source, systemClock);
};
