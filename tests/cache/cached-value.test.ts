import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { CachedValue } from '../../src/cache/cached-value';
import { FakeClock, FakeLogger } from '../fakes';

const TTL = 60_000;
const MESSAGES = {
  stale: 'test: refresh failed, serving stale value',
  empty: 'test: refresh failed, nothing to serve'
};

class ScriptedLoad {
  calls = 0;
  failing = false;
  value = 'first';
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

  readonly load = async (): Promise<string> => {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.failing) throw new Error('upstream down');
    return this.value;
  };
}

const setup = (staleAcrossKeys?: boolean) => {
  const clock = new FakeClock('2026-07-01T00:00:00.000Z');
  const logger = new FakeLogger();
  const cache = new CachedValue<string>({
    clock,
    ttlMs: TTL,
    logger,
    messages: MESSAGES,
    staleAcrossKeys
  });
  return { clock, logger, cache, source: new ScriptedLoad() };
};

describe('CachedValue', () => {
  it('serves a second call within the TTL without loading again', async () => {
    const { clock, cache, source } = setup();
    await cache.get('k', source.load);
    clock.advance(TTL - 1);
    source.value = 'second';
    expect(await cache.get('k', source.load)).toBe('first');
    expect(source.calls).toBe(1);
  });

  it('loads again once the TTL has passed', async () => {
    const { clock, cache, source } = setup();
    await cache.get('k', source.load);
    clock.advance(TTL);
    source.value = 'second';
    expect(await cache.get('k', source.load)).toBe('second');
    expect(source.calls).toBe(2);
  });

  it('shares one load between concurrent callers', async () => {
    const { cache, source } = setup();
    source.hold();
    const both = Promise.all([
      cache.get('k', source.load),
      cache.get('k', source.load)
    ]);
    source.release();
    expect(await both).toEqual(['first', 'first']);
    expect(source.calls).toBe(1);
  });

  it('serves the last good value on failure and warns, naming when it loaded', async () => {
    const { clock, logger, cache, source } = setup();
    await cache.get('k', source.load);
    clock.advance(TTL);
    source.failing = true;
    expect(await cache.get('k', source.load)).toBe('first');
    expect(logger.warnings).toEqual([
      {
        msg: MESSAGES.stale,
        meta: { error: 'upstream down', staleSince: '2026-07-01T00:00:00.000Z' }
      }
    ]);
  });

  it('stays quiet while loads succeed', async () => {
    const { clock, logger, cache, source } = setup();
    await cache.get('k', source.load);
    clock.advance(TTL);
    await cache.get('k', source.load);
    expect(logger.warnings).toEqual([]);
  });

  describe('with nothing loaded yet', () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    beforeEach(() => {
      unhandled.length = 0;
      process.on('unhandledRejection', record);
    });
    afterEach(() => {
      process.off('unhandledRejection', record);
    });

    it('throws, warns, and leaves no unhandled rejection behind', async () => {
      const { logger, cache, source } = setup();
      source.failing = true;
      await expect(cache.get('k', source.load)).rejects.toThrow(
        'upstream down'
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(logger.warnings).toEqual([
        { msg: MESSAGES.empty, meta: { error: 'upstream down' } }
      ]);
    });
  });

  it('tries the load again on the next call after a failure', async () => {
    const { cache, source } = setup();
    source.failing = true;
    await expect(cache.get('k', source.load)).rejects.toThrow();
    source.failing = false;
    expect(await cache.get('k', source.load)).toBe('first');
    expect(source.calls).toBe(2);
  });

  it('never serves a value loaded for a different key by default', async () => {
    const { cache, source } = setup();
    await cache.get('2025', source.load);
    source.failing = true;
    await expect(cache.get('2026', source.load)).rejects.toThrow(
      'upstream down'
    );
  });

  it('serves the value for the previous key when staleAcrossKeys is on', async () => {
    const { logger, cache, source } = setup(true);
    await cache.get('2026-10-25', source.load);
    source.failing = true;
    expect(await cache.get('2026-10-26', source.load)).toBe('first');
    expect(logger.warnings[0]?.msg).toBe(MESSAGES.stale);
  });

  it('treats a new key as a miss even when staleAcrossKeys is on', async () => {
    const { cache, source } = setup(true);
    await cache.get('2026-10-25', source.load);
    source.value = 'second';
    expect(await cache.get('2026-10-26', source.load)).toBe('second');
    expect(source.calls).toBe(2);
  });
});
