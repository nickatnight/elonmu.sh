import { describe, expect, it } from 'bun:test';
import { CachedPriceSource } from '../../src/doge/cached-price-source';
import { DogeService } from '../../src/doge/doge.service';
import type { PriceQuote } from '../../src/doge/domain';
import type { PriceSource } from '../../src/doge/ports';
import { FakeClock, FakeLogger } from '../fakes';
import { InMemoryPriceSource, NOW_QUOTE } from './fakes';
import { describePriceSource } from './price-source.contract';

const TTL = 5 * 60_000;

class ScriptedSource implements PriceSource {
  calls = 0;
  failing = false;
  quote: PriceQuote = NOW_QUOTE;
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

  async fetchPrice(): Promise<PriceQuote> {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.failing) throw new Error('coingecko down');
    return this.quote;
  }
}

const setup = () => {
  const inner = new ScriptedSource();
  const clock = new FakeClock('2026-10-28T04:31:00.000Z');
  const logger = new FakeLogger();
  return {
    inner,
    clock,
    logger,
    cached: new CachedPriceSource(inner, clock, logger)
  };
};

describePriceSource('CachedPriceSource around InMemoryPriceSource', {
  make: () =>
    new CachedPriceSource(
      new InMemoryPriceSource(NOW_QUOTE),
      new FakeClock('2026-10-28T04:31:00.000Z'),
      new FakeLogger()
    ),
  makeFailing: () =>
    new CachedPriceSource(
      new InMemoryPriceSource(NOW_QUOTE, { error: new Error('down') }),
      new FakeClock('2026-10-28T04:31:00.000Z'),
      new FakeLogger()
    )
});

describe('CachedPriceSource', () => {
  it('serves a second call within 5 minutes without asking CoinGecko', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchPrice();
    clock.advance(TTL - 1);
    await cached.fetchPrice();
    expect(inner.calls).toBe(1);
  });

  it('asks again once 5 minutes have passed', async () => {
    const { inner, clock, cached } = setup();
    await cached.fetchPrice();
    clock.advance(TTL);
    inner.quote = { at: '2026-10-28T04:36:00.000Z', usd: 0.08 };
    expect(await cached.fetchPrice()).toEqual({
      at: '2026-10-28T04:36:00.000Z',
      usd: 0.08
    });
    expect(inner.calls).toBe(2);
  });

  it('shares one upstream call between concurrent cold requests', async () => {
    const { inner, cached } = setup();
    inner.hold();
    const both = Promise.all([cached.fetchPrice(), cached.fetchPrice()]);
    inner.release();
    const [a, b] = await both;
    expect(inner.calls).toBe(1);
    expect(a).toEqual(b);
  });

  it('serves the last good price on failure and warns', async () => {
    const { inner, clock, logger, cached } = setup();
    const good = await cached.fetchPrice();
    clock.advance(TTL);
    inner.failing = true;
    expect(await cached.fetchPrice()).toEqual(good);
    expect(logger.warnings).toEqual([
      {
        msg: 'doge: refresh failed, serving a stale price',
        meta: {
          error: 'coingecko down',
          staleSince: '2026-10-28T04:31:00.000Z'
        }
      }
    ]);
  });

  it('throws and warns when the first fetch fails', async () => {
    const { inner, logger, cached } = setup();
    inner.failing = true;
    await expect(cached.fetchPrice()).rejects.toThrow('coingecko down');
    expect(logger.warnings[0]?.msg).toBe(
      'doge: refresh failed, no price to serve'
    );
  });

  it('waits a minute after a failed refresh before asking CoinGecko again', async () => {
    const { inner, clock, logger, cached } = setup();
    const good = await cached.fetchPrice();
    clock.advance(TTL);
    inner.failing = true;
    for (let i = 0; i < 6; i++) {
      expect(await cached.fetchPrice()).toEqual(good);
      clock.advance(10_000);
    }
    expect(inner.calls).toBe(2);
    expect(logger.warnings).toHaveLength(1);
    await cached.fetchPrice();
    expect(inner.calls).toBe(3);
  });

  it('waits a minute after a failed cold fetch too, failing fast meanwhile', async () => {
    const { inner, clock, cached } = setup();
    inner.failing = true;
    await expect(cached.fetchPrice()).rejects.toThrow();
    clock.advance(59_000);
    await expect(cached.fetchPrice()).rejects.toThrow();
    expect(inner.calls).toBe(1);
    clock.advance(1_000);
    inner.failing = false;
    expect(await cached.fetchPrice()).toEqual(NOW_QUOTE);
    expect(inner.calls).toBe(2);
  });

  it('keeps an hour of steady page loads to 12 CoinGecko calls', async () => {
    const { inner, clock, cached } = setup();
    const doge = new DogeService(cached);
    for (let second = 0; second < 3600; second += 10) {
      await doge.comparison();
      clock.advance(10_000);
    }
    expect(inner.calls).toBe(12);
  });
});
