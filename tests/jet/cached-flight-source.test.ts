import { describe, expect, it } from 'bun:test';
import { CachedFlightSource } from '../../src/jet/cached-flight-source';
import type { Attribution, Flight } from '../../src/jet/domain';
import { warmUp } from '../../src/jet/index';
import { JetService } from '../../src/jet/jet.service';
import type { FlightSource } from '../../src/jet/ports';
import {
  FakeClock,
  FakeLogger,
  failingJet,
  flight,
  InMemoryFlightSource,
  sampleFlights,
  sampleJet
} from './fakes';
import { describeFlightSource } from './flight-source.contract';

const TTL = 5 * 60_000;
const YEAR = new Date('2026-01-01T00:00:00.000Z');

// An inner source the test steers: counts calls, can fail, can be held open.
class ScriptedSource implements FlightSource {
  readonly attribution: Attribution = {
    label: 'Scripted',
    url: 'https://x.test'
  };
  calls = 0;
  failing = false;
  flights: Flight[] = [flight({ id: 'a' })];
  private gate: Promise<void> | null = null;
  private open: () => void = () => {};

  hold(): void {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  release(): void {
    this.open();
    this.gate = null;
  }

  async fetchFlights(): Promise<Flight[]> {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.failing) throw new Error('upstream down');
    return this.flights;
  }
}

const setup = () => {
  const inner = new ScriptedSource();
  const clock = new FakeClock('2026-07-01T00:00:00.000Z');
  return { inner, clock, cached: new CachedFlightSource(inner, clock, TTL) };
};

describeFlightSource('CachedFlightSource around InMemoryFlightSource', {
  make: () =>
    new CachedFlightSource(
      new InMemoryFlightSource(sampleFlights),
      new FakeClock('2026-07-01T00:00:00.000Z')
    ),
  makeFailing: () =>
    new CachedFlightSource(
      new InMemoryFlightSource(sampleFlights, { error: new Error('down') }),
      new FakeClock('2026-07-01T00:00:00.000Z')
    ),
  since: YEAR
});

describe('CachedFlightSource', () => {
  it('passes the inner source’s attribution through', () => {
    expect(setup().cached.attribution).toEqual({
      label: 'Scripted',
      url: 'https://x.test'
    });
  });

  it('serves a second call within the TTL without asking the inner source', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchFlights(YEAR);
    clock.advance(TTL - 1);
    expect(await cached.fetchFlights(YEAR)).toEqual(inner.flights);
    expect(inner.calls).toBe(1);
  });

  it('asks the inner source again once the TTL has passed', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchFlights(YEAR);
    clock.advance(TTL);
    inner.flights = [flight({ id: 'b' })];
    expect((await cached.fetchFlights(YEAR)).map((f) => f.id)).toEqual(['b']);
    expect(inner.calls).toBe(2);
  });

  it('shares one inner call between concurrent callers', async () => {
    const { inner, cached } = setup();
    inner.hold();
    const both = Promise.all([
      cached.fetchFlights(YEAR),
      cached.fetchFlights(YEAR)
    ]);
    inner.release();
    const [a, b] = await both;
    expect(inner.calls).toBe(1);
    expect(a).toEqual(b);
  });

  it('serves the last good result when a refresh fails', async () => {
    const { inner, clock, cached } = setup();
    const good = await cached.fetchFlights(YEAR);
    clock.advance(TTL);
    inner.failing = true;
    expect(await cached.fetchFlights(YEAR)).toEqual(good);
  });

  it('retries the upstream on the next call after a failed refresh', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchFlights(YEAR);
    clock.advance(TTL);
    inner.failing = true;
    await cached.fetchFlights(YEAR);
    inner.failing = false;
    await cached.fetchFlights(YEAR);
    expect(inner.calls).toBe(3);
  });

  it('throws when the upstream fails and nothing has loaded yet', async () => {
    const { inner, cached } = setup();
    inner.failing = true;
    await expect(cached.fetchFlights(YEAR)).rejects.toThrow('upstream down');
  });

  it('never serves a result fetched for a different `since`', async () => {
    const { inner, cached } = setup();
    await cached.fetchFlights(new Date('2025-01-01T00:00:00.000Z'));
    inner.failing = true;
    // New year, upstream down: last year's list must not stand in.
    await expect(cached.fetchFlights(YEAR)).rejects.toThrow('upstream down');
  });

  it('keeps three page loads within 5 minutes to one upstream refresh', async () => {
    const { inner, clock, cached } = setup();
    const jet = new JetService(cached, clock);
    await jet.snapshot();
    clock.advance(2 * 60_000);
    await jet.snapshot();
    clock.advance(2 * 60_000);
    await jet.snapshot();
    expect(inner.calls).toBe(1);
  });
});

describe('warmUp', () => {
  it('loads a snapshot once at startup', async () => {
    let calls = 0;
    const jet = sampleJet();
    const counting = {
      snapshot: () => {
        calls++;
        return jet.snapshot();
      }
    };
    await warmUp(counting, new FakeLogger());
    expect(calls).toBe(1);
  });

  it('logs a failed warm-up as a warning instead of throwing', async () => {
    const logger = new FakeLogger();
    await expect(warmUp(failingJet(), logger)).resolves.toBeUndefined();
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0].msg).toContain('warm-up');
  });
});
