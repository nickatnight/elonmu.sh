import { describe, expect, it } from 'bun:test';
import { JetService } from '../../src/jet/jet.service';
import {
  FakeClock,
  flight,
  InMemoryFlightSource,
  sampleFlights
} from './fakes';

const serviceAt = (now: string, flights = sampleFlights) =>
  new JetService(new InMemoryFlightSource(flights), new FakeClock(now));

describe('JetService.snapshot', () => {
  it('keeps flights from Jan 1 00:00 UTC and drops the last instant of last year', async () => {
    const snap = await serviceAt('2026-03-01T00:00:00.000Z', [
      flight({ id: 'dec31', departedAt: '2025-12-31T23:59:59.999Z' }),
      flight({ id: 'jan1', departedAt: '2026-01-01T00:00:00.000Z' })
    ]).snapshot();
    expect(snap.flights.map((f) => f.id)).toEqual(['jan1']);
  });

  it('computes the year in UTC, not local time', async () => {
    // 23:30 on Dec 31 in Los Angeles is already Jan 1 in UTC.
    const snap = await serviceAt('2026-12-31T23:30:00.000-08:00').snapshot();
    expect(snap.year).toBe(2027);
    expect(snap.flights).toEqual([]);
  });

  it('orders flights newest first, filing arrival-only flights by landing time', async () => {
    const snap = await serviceAt('2026-07-01T00:00:00.000Z').snapshot();
    expect(snap.flights.map((f) => f.id)).toEqual([
      'airborne',
      'tokyo-hop',
      'arrival-only',
      'austin-sanjose'
    ]);
  });

  it('sums totals over the year’s flights, counting fuel-less flights toward flights and hours', async () => {
    const snap = await serviceAt('2026-07-01T00:00:00.000Z').snapshot();
    expect(snap.totals).toEqual({
      flights: 4,
      // 210 + 60 + 40 minutes; the airborne flight has no duration yet.
      hours: 310 / 60,
      gallons: 1200,
      usd: 7200,
      co2Tons: 12
    });
  });

  it('returns zero totals and no flights for an empty year', async () => {
    const snap = await serviceAt('2027-01-01T00:05:00.000Z').snapshot();
    expect(snap.year).toBe(2027);
    expect(snap.flights).toEqual([]);
    expect(snap.totals).toEqual({
      flights: 0,
      hours: 0,
      gallons: 0,
      usd: 0,
      co2Tons: 0
    });
  });

  it('carries the source attribution and stamps the snapshot with the clock', async () => {
    const source = new InMemoryFlightSource(sampleFlights, {
      attribution: { label: 'Test feed', url: 'https://example.com' }
    });
    const clock = new FakeClock('2026-07-01T00:00:00.000Z');
    const snap = await new JetService(source, clock).snapshot();
    expect(snap.attribution).toEqual({
      label: 'Test feed',
      url: 'https://example.com'
    });
    expect(snap.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('rejects when the source fails', async () => {
    const source = new InMemoryFlightSource(sampleFlights, {
      error: new Error('upstream down')
    });
    const clock = new FakeClock('2026-07-01T00:00:00.000Z');
    await expect(new JetService(source, clock).snapshot()).rejects.toThrow(
      'upstream down'
    );
  });
});
