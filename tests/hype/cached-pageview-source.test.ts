import { describe, expect, it } from 'bun:test';
import { CachedPageviewSource } from '../../src/hype/cached-pageview-source';
import type { DayViews } from '../../src/hype/domain';
import { HypeService } from '../../src/hype/hype.service';
import type { PageviewSource } from '../../src/hype/ports';
import { FakeClock, FakeLogger } from '../fakes';
import { day, InMemoryPageviewSource } from './fakes';
import { describePageviewSource } from './pageview-source.contract';

const TTL = 4 * 60 * 60_000;
const FROM = new Date('2025-10-27T00:00:00.000Z');
const TO = new Date('2026-10-26T00:00:00.000Z');
const NEXT_TO = new Date('2026-10-27T00:00:00.000Z');

class ScriptedSource implements PageviewSource {
  calls = 0;
  failing = false;
  days: DayViews[] = [day('2026-10-26', 100)];
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

  async fetchDays(): Promise<DayViews[]> {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.failing) throw new Error('wikimedia down');
    return this.days;
  }
}

const setup = () => {
  const inner = new ScriptedSource();
  const clock = new FakeClock('2026-10-27T09:00:00.000Z');
  const logger = new FakeLogger();
  return {
    inner,
    clock,
    logger,
    cached: new CachedPageviewSource(inner, clock, logger)
  };
};

describePageviewSource('CachedPageviewSource around InMemoryPageviewSource', {
  make: () =>
    new CachedPageviewSource(
      new InMemoryPageviewSource([day('2026-06-01', 5), day('2026-06-03', 7)]),
      new FakeClock('2026-10-27T09:00:00.000Z'),
      new FakeLogger()
    ),
  makeFailing: () =>
    new CachedPageviewSource(
      new InMemoryPageviewSource([], { error: new Error('down') }),
      new FakeClock('2026-10-27T09:00:00.000Z'),
      new FakeLogger()
    ),
  from: new Date('2026-06-01T00:00:00.000Z'),
  to: new Date('2026-06-30T00:00:00.000Z'),
  missing: '2026-06-02'
});

describe('CachedPageviewSource', () => {
  it('serves a second call within 4 hours without asking Wikimedia', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchDays(FROM, TO);
    clock.advance(TTL - 1);
    await cached.fetchDays(FROM, TO);
    expect(inner.calls).toBe(1);
  });

  it('asks again once 4 hours have passed', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchDays(FROM, TO);
    clock.advance(TTL);
    inner.days = [day('2026-10-26', 200)];
    expect(await cached.fetchDays(FROM, TO)).toEqual([day('2026-10-26', 200)]);
    expect(inner.calls).toBe(2);
  });

  it('shares one upstream call between concurrent cold requests', async () => {
    const { inner, cached } = setup();
    inner.hold();
    const both = Promise.all([
      cached.fetchDays(FROM, TO),
      cached.fetchDays(FROM, TO)
    ]);
    inner.release();
    const [a, b] = await both;
    expect(inner.calls).toBe(1);
    expect(a).toEqual(b);
  });

  it('serves the last good series on failure and warns', async () => {
    const { inner, clock, logger, cached } = setup();
    const good = await cached.fetchDays(FROM, TO);
    clock.advance(TTL);
    inner.failing = true;
    expect(await cached.fetchDays(FROM, TO)).toEqual(good);
    expect(logger.warnings).toEqual([
      {
        msg: 'hype: refresh failed, serving stale pageviews',
        meta: {
          error: 'wikimedia down',
          staleSince: '2026-10-27T09:00:00.000Z'
        }
      }
    ]);
  });

  it('serves yesterday’s series when the first fetch after midnight fails', async () => {
    const { inner, clock, cached } = setup();
    const good = await cached.fetchDays(FROM, TO);
    clock.set('2026-10-28T00:05:00.000Z');
    inner.failing = true;
    expect(await cached.fetchDays(FROM, NEXT_TO)).toEqual(good);
  });

  it('fetches again for a new day even within 4 hours', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchDays(FROM, TO);
    clock.advance(60_000);
    await cached.fetchDays(FROM, NEXT_TO);
    expect(inner.calls).toBe(2);
  });

  it('throws and warns when the first fetch fails', async () => {
    const { inner, logger, cached } = setup();
    inner.failing = true;
    await expect(cached.fetchDays(FROM, TO)).rejects.toThrow('wikimedia down');
    expect(logger.warnings[0]?.msg).toBe(
      'hype: refresh failed, no data to serve'
    );
  });

  it('waits a minute after a failed refresh before asking Wikimedia again', async () => {
    const { inner, clock, logger, cached } = setup();
    const good = await cached.fetchDays(FROM, TO);
    clock.advance(TTL);
    inner.failing = true;
    for (let i = 0; i < 6; i++) {
      expect(await cached.fetchDays(FROM, TO)).toEqual(good);
      clock.advance(10_000);
    }
    expect(inner.calls).toBe(2);
    expect(logger.warnings).toHaveLength(1);
    await cached.fetchDays(FROM, TO);
    expect(inner.calls).toBe(3);
  });

  it('keeps steady page loads over 4 hours to one Wikimedia call', async () => {
    const { inner, clock, cached } = setup();
    const hype = new HypeService(cached, clock);
    for (let i = 0; i < 4; i++) {
      await hype.series();
      clock.advance(TTL / 4 - 1);
    }
    expect(inner.calls).toBe(1);
  });
});
