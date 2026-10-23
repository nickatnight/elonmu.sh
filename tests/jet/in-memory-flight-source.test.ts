import { describe, it } from 'bun:test';
import { sampleFlights as standInFlights } from '../../src/jet/sources/memory/sample-flights';
import { InMemoryFlightSource, sampleFlights } from './fakes';
import {
  assertFlightShape,
  describeFlightSource
} from './flight-source.contract';

describeFlightSource('InMemoryFlightSource', {
  make: () => new InMemoryFlightSource(sampleFlights),
  makeFailing: () =>
    new InMemoryFlightSource(sampleFlights, {
      error: new Error('upstream down')
    }),
  since: new Date('2026-01-01T00:00:00.000Z')
});

describe('the stand-in sample flights', () => {
  it('meet the flight shape rules', () => {
    assertFlightShape(standInFlights);
  });
});
