import { InMemoryFlightSource, sampleFlights } from './fakes';
import { describeFlightSource } from './flight-source.contract';

describeFlightSource('InMemoryFlightSource', {
  make: () => new InMemoryFlightSource(sampleFlights),
  makeFailing: () =>
    new InMemoryFlightSource(sampleFlights, {
      error: new Error('upstream down')
    }),
  since: new Date('2026-01-01T00:00:00.000Z')
});
