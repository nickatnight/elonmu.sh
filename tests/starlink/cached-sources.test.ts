import { describe, expect, it } from 'bun:test';
import { CachedOrbitSource } from '../../src/starlink/cached-orbit-source';
import { CachedReentrySource } from '../../src/starlink/cached-reentry-source';
import type { OrbitCatalog, ReentryLog } from '../../src/starlink/domain';
import {
  type OrbitSource,
  type ReentrySource,
  UpstreamRefusedError
} from '../../src/starlink/ports';
import { InMemoryOrbitSource } from '../../src/starlink/sources/memory/in-memory-orbit-source';
import { InMemoryReentrySource } from '../../src/starlink/sources/memory/in-memory-reentry-source';
import { FakeClock, FakeLogger } from '../fakes';
import { capturedOrbits, capturedReentries } from './fakes';
import { describeOrbitSource } from './orbit-source.contract';
import { describeReentrySource } from './reentry-source.contract';

const START = '2026-10-30T04:13:47.000Z';
const HOUR = 3_600_000;
const MINUTE = 60_000;

describeOrbitSource('CachedOrbitSource around InMemoryOrbitSource', {
  make: () =>
    new CachedOrbitSource(
      new InMemoryOrbitSource(capturedOrbits()),
      new FakeClock(START),
      new FakeLogger()
    ),
  makeFailing: () =>
    new CachedOrbitSource(
      new InMemoryOrbitSource(capturedOrbits(), { error: new Error('down') }),
      new FakeClock(START),
      new FakeLogger()
    )
});

describeReentrySource('CachedReentrySource around InMemoryReentrySource', {
  make: () =>
    new CachedReentrySource(
      new InMemoryReentrySource(capturedReentries()),
      new FakeClock(START),
      new FakeLogger()
    ),
  makeFailing: () =>
    new CachedReentrySource(
      new InMemoryReentrySource(capturedReentries(), {
        error: new Error('down')
      }),
      new FakeClock(START),
      new FakeLogger()
    )
});

class ScriptedSource implements OrbitSource, ReentrySource {
  calls = 0;
  failing = false;
  error = new Error('celestrak down');
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

  private async answer<T>(value: T): Promise<T> {
    this.calls++;

    if (this.gate) await this.gate;

    if (this.failing) throw this.error;

    return value;
  }

  fetchOrbits(): Promise<OrbitCatalog> {
    return this.answer(capturedOrbits(`2026-10-30T0${this.calls}:00:00.000Z`));
  }

  fetchReentries(): Promise<ReentryLog> {
    return this.answer(
      capturedReentries(`2026-10-30T0${this.calls}:00:00.000Z`)
    );
  }
}

type Cache = {
  name: string;
  ttlMs: number;
  upstream: string;
  messages: { stale: string; empty: string };
  build: (
    inner: ScriptedSource,
    clock: FakeClock,
    logger: FakeLogger
  ) => () => Promise<{ readAt: string }>;
};

const caches: Cache[] = [
  {
    name: 'CachedOrbitSource',
    ttlMs: 6 * HOUR,
    upstream: 'the GP group',
    messages: {
      stale: 'starlink: orbit refresh failed, serving stale orbits',
      empty: 'starlink: orbit refresh failed, no orbits to serve'
    },
    build: (inner, clock, logger) => {
      const cached = new CachedOrbitSource(inner, clock, logger);

      return () => cached.fetchOrbits();
    }
  },
  {
    name: 'CachedReentrySource',
    ttlMs: 12 * HOUR,
    upstream: 'the satellite catalogue',
    messages: {
      stale: 'starlink: re-entry refresh failed, serving stale re-entries',
      empty: 'starlink: re-entry refresh failed, no re-entries to serve'
    },
    build: (inner, clock, logger) => {
      const cached = new CachedReentrySource(inner, clock, logger);

      return () => cached.fetchReentries();
    }
  }
];

const setup = (cache: Cache) => {
  const inner = new ScriptedSource();
  const clock = new FakeClock(START);
  const logger = new FakeLogger();

  return { inner, clock, logger, fetch: cache.build(inner, clock, logger) };
};

for (const cache of caches) {
  const hours = cache.ttlMs / HOUR;

  describe(cache.name, () => {
    it(`serves a second call within ${hours} hours without asking ${cache.upstream} again`, async () => {
      const { inner, clock, fetch } = setup(cache);

      await fetch();
      clock.advance(cache.ttlMs - 1);
      await fetch();
      expect(inner.calls).toBe(1);
    });

    it(`asks again once ${hours} hours have passed`, async () => {
      const { inner, clock, fetch } = setup(cache);

      await fetch();
      clock.advance(cache.ttlMs);
      expect((await fetch()).readAt).toBe('2026-10-30T01:00:00.000Z');
      expect(inner.calls).toBe(2);
    });

    it('shares one upstream call between concurrent cold requests', async () => {
      const { inner, fetch } = setup(cache);

      inner.hold();
      const both = Promise.all([fetch(), fetch()]);

      inner.release();
      const [a, b] = await both;

      expect(inner.calls).toBe(1);
      expect(a).toEqual(b);
    });

    it('serves the last good data on failure, keeping its read time, and warns once', async () => {
      const { inner, clock, logger, fetch } = setup(cache);
      const good = await fetch();

      clock.advance(cache.ttlMs);
      inner.failing = true;
      expect(await fetch()).toEqual(good);
      expect(good.readAt).toBe('2026-10-30T00:00:00.000Z');
      expect(logger.warnings).toEqual([
        {
          msg: cache.messages.stale,
          meta: { error: 'celestrak down', staleSince: START }
        }
      ]);
    });

    it('throws and warns when the first fetch fails', async () => {
      const { inner, logger, fetch } = setup(cache);

      inner.failing = true;
      await expect(fetch()).rejects.toThrow('celestrak down');
      expect(logger.warnings.map((w) => w.msg)).toEqual([cache.messages.empty]);
    });

    it('asks again at most once a minute while the upstream fails', async () => {
      const { inner, clock, logger, fetch } = setup(cache);
      const good = await fetch();

      clock.advance(cache.ttlMs);
      inner.failing = true;

      for (let i = 0; i < 6; i++) {
        expect(await fetch()).toEqual(good);
        clock.advance(10_000);
      }

      expect(inner.calls).toBe(2);
      expect(logger.warnings).toHaveLength(1);
      await fetch();
      expect(inner.calls).toBe(3);
    });

    it('fails fast for a minute after a failed cold fetch, then tries again', async () => {
      const { inner, clock, fetch } = setup(cache);

      inner.failing = true;
      await expect(fetch()).rejects.toThrow();
      clock.advance(59_000);
      await expect(fetch()).rejects.toThrow();
      expect(inner.calls).toBe(1);
      clock.advance(1_000);
      inner.failing = false;
      await fetch();
      expect(inner.calls).toBe(2);
    });

    it('waits 2 hours after CelesTrak refuses, serving the last good data with one warning per refusal', async () => {
      const { inner, clock, logger, fetch } = setup(cache);
      const good = await fetch();

      clock.advance(cache.ttlMs);
      inner.failing = true;
      inner.error = new UpstreamRefusedError(403);
      expect(await fetch()).toEqual(good);
      clock.advance(MINUTE);
      expect(await fetch()).toEqual(good);
      clock.advance(2 * HOUR - MINUTE - 1);
      expect(await fetch()).toEqual(good);
      expect(inner.calls).toBe(2);
      expect(logger.warnings).toHaveLength(1);
      clock.advance(1);
      expect(await fetch()).toEqual(good);
      expect(inner.calls).toBe(3);
      expect(logger.warnings.map((w) => w.msg)).toEqual([
        cache.messages.stale,
        cache.messages.stale
      ]);
    });

    it('fails fast for 2 hours after a refused cold fetch, then tries again', async () => {
      const { inner, clock, fetch } = setup(cache);

      inner.failing = true;
      inner.error = new UpstreamRefusedError(429);
      await expect(fetch()).rejects.toThrow(UpstreamRefusedError);
      clock.advance(2 * HOUR - 1);
      await expect(fetch()).rejects.toThrow(UpstreamRefusedError);
      expect(inner.calls).toBe(1);
      clock.advance(1);
      inner.failing = false;
      await fetch();
      expect(inner.calls).toBe(2);
    });

    it('goes back to the 1-minute retry once a fetch succeeds after a refusal', async () => {
      const { inner, clock, fetch } = setup(cache);

      inner.failing = true;
      inner.error = new UpstreamRefusedError(403);
      await expect(fetch()).rejects.toThrow();
      clock.advance(2 * HOUR);
      inner.failing = false;
      const good = await fetch();

      clock.advance(cache.ttlMs);
      inner.failing = true;
      inner.error = new Error('celestrak down');
      expect(await fetch()).toEqual(good);
      clock.advance(MINUTE);
      expect(await fetch()).toEqual(good);
      expect(inner.calls).toBe(4);
    });

    it(`keeps a day of requests every 10 seconds to ${24 / hours} upstream calls`, async () => {
      const { inner, clock, fetch } = setup(cache);

      for (let s = 0; s < 24 * 3600; s += 10) {
        await fetch();
        clock.advance(10_000);
      }

      expect(inner.calls).toBe(24 / hours);
    });
  });
}
