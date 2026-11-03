import { describe, expect, it } from 'bun:test';
import { CachedOrbitSource } from '../../src/starlink/cached-orbit-source';
import { CachedReentrySource } from '../../src/starlink/cached-reentry-source';
import type { StarlinkSnapshot } from '../../src/starlink/domain';
import { InMemoryOrbitSource } from '../../src/starlink/sources/memory/in-memory-orbit-source';
import { InMemoryReentrySource } from '../../src/starlink/sources/memory/in-memory-reentry-source';
import { StarlinkService } from '../../src/starlink/starlink.service';
import { FakeClock, FakeLogger, inTimeZone } from '../fakes';
import satcat from '../fixtures/celestrak-starlink-satcat.json';
import {
  capturedOrbits,
  capturedReentries,
  ORBITS_READ_AT,
  REENTRIES_READ_AT
} from './fakes';

const NOW = '2026-10-30T04:30:00.000Z';

const service = ({
  clock = new FakeClock(NOW),
  orbits = new InMemoryOrbitSource(capturedOrbits()),
  reentries = new InMemoryReentrySource(capturedReentries())
} = {}) => new StarlinkService({ orbits, reentries, clock });

const down = { error: new Error('celestrak down') };

const decaysIn = (year: number) =>
  satcat.filter((r) => r.DECAY_DATE.startsWith(`${year}-`)).length;

describe('StarlinkService', () => {
  it('counts every satellite in orbit and lists them all', async () => {
    const snapshot = await service().snapshot();
    expect(snapshot.inOrbit).toBe(200);
    expect(snapshot.satellites).toHaveLength(200);
  });

  it("counts the re-entries dated in the clock's UTC year", async () => {
    const { reentries } = await service().snapshot();
    expect(decaysIn(2026)).toBe(83);
    expect(reentries?.year).toBe(2026);
    expect(reentries?.count).toBe(83);
  });

  it("lists this year's latest 12 re-entries, newest first, ties by id", async () => {
    const { reentries } = await service().snapshot();
    expect(
      reentries?.recent.map((r) => `${r.reentered} ${r.id} ${r.name}`)
    ).toEqual([
      '2026-10-29 45414 STARLINK-1309',
      '2026-10-29 57302 STARLINK-30233',
      '2026-10-27 44741 STARLINK-1036',
      '2026-10-26 48582 STARLINK-2236',
      '2026-10-25 46066 STARLINK-1525',
      '2026-10-25 48562 STARLINK-2187',
      '2026-10-25 67102 STARLINK-36255',
      '2026-10-24 45671 STARLINK-1454',
      '2026-10-24 47625 STARLINK-1704',
      '2026-10-24 57416 STARLINK-30224',
      '2026-10-23 46174 STARLINK-1641',
      '2026-10-23 53499 STARLINK-4454'
    ]);
  });

  it('gives each listed re-entry its launch date too', async () => {
    const { reentries } = await service().snapshot();
    expect(reentries?.recent[0]).toEqual({
      id: 45414,
      name: 'STARLINK-1309',
      launched: '2020-03-18',
      reentered: '2026-10-29'
    });
  });

  it('rolls the count over at midnight UTC on 1 January, from the same catalogue, while Los Angeles is still in 2026', async () => {
    await inTimeZone('America/Los_Angeles', async () => {
      const clock = new FakeClock('2026-12-31T23:59:59.999Z');
      const starlink = service({ clock });
      const lastDay = await starlink.snapshot();
      clock.advance(1);
      const newYear = await starlink.snapshot();
      expect(lastDay.reentries).toMatchObject({ year: 2026, count: 83 });
      expect(newYear.reentries).toEqual({ year: 2027, count: 0, recent: [] });
    });
  });

  it('still counts 2026 at noon UTC on 31 December, when Kiritimati is already in 2027', async () => {
    await inTimeZone('Pacific/Kiritimati', async () => {
      const { reentries } = await service({
        clock: new FakeClock('2026-12-31T12:00:00.000Z')
      }).snapshot();
      expect(reentries).toMatchObject({ year: 2026, count: 83 });
    });
  });

  it('counts last year by its own dates when the clock is in last year', async () => {
    const { reentries } = await service({
      clock: new FakeClock('2025-12-31T12:00:00.000Z')
    }).snapshot();
    expect(reentries?.count).toBe(decaysIn(2025));
    expect(reentries?.recent[0]?.reentered).toBe('2025-12-31');
  });

  it('dates the snapshot by the older of the two reads', async () => {
    const early = await service({
      orbits: new InMemoryOrbitSource(
        capturedOrbits('2026-10-30T01:00:00.000Z')
      )
    }).snapshot();
    const late = await service().snapshot();
    expect(early.updatedAt).toBe('2026-10-30T01:00:00.000Z');
    expect(late.updatedAt).toBe(ORBITS_READ_AT);
  });

  it('credits CelesTrak', async () => {
    expect((await service().snapshot()).attribution).toEqual([
      { name: 'CelesTrak', url: 'https://celestrak.org' }
    ]);
  });

  it('rounds elements to the precision that keeps 11k satellites under the gzip budget', async () => {
    const { satellites } = await service().snapshot();
    expect(satellites?.find((s) => s.id === 44714)).toEqual({
      id: 44714,
      name: 'STARLINK-1008',
      epoch: '2026-10-28T20:33:11.108Z',
      meanMotion: 15.68273,
      meanMotionDot: 0.00034,
      eccentricity: 0.0002,
      inclination: 53.14,
      raan: 138.75,
      argOfPerigee: 162.32,
      meanAnomaly: 197.79
    });
  });

  it('puts the fields in the documented order', async () => {
    const snapshot = await service().snapshot();
    expect(Object.keys(snapshot)).toEqual([
      'updatedAt',
      'inOrbit',
      'satellites',
      'reentries',
      'attribution'
    ]);
    expect(Object.keys(snapshot.reentries ?? {})).toEqual([
      'year',
      'count',
      'recent'
    ]);
  });
});

describe('StarlinkService over the caches', () => {
  const cachedService = (clock: FakeClock) =>
    new StarlinkService({
      orbits: new CachedOrbitSource(
        new InMemoryOrbitSource(capturedOrbits()),
        clock,
        new FakeLogger()
      ),
      reentries: new CachedReentrySource(
        new InMemoryReentrySource(capturedReentries()),
        clock,
        new FakeLogger()
      ),
      clock
    });

  it('reuses one snapshot while both catalogues and the UTC year are unchanged', async () => {
    const clock = new FakeClock(NOW);
    const starlink = cachedService(clock);
    const first = await starlink.snapshot();
    clock.advance(60_000);
    expect(await starlink.snapshot()).toBe(first);
  });

  it('builds a new snapshot once the orbits are read again', async () => {
    const clock = new FakeClock(NOW);
    const starlink = cachedService(clock);
    const first = await starlink.snapshot();
    clock.advance(6 * 3_600_000);
    const next = await starlink.snapshot();
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
  });

  it('builds a new snapshot when the UTC year turns, from the same catalogues', async () => {
    const clock = new FakeClock('2026-12-31T23:59:59.999Z');
    const starlink = cachedService(clock);
    const lastDay = await starlink.snapshot();
    clock.advance(1);
    const newYear = await starlink.snapshot();
    expect(newYear).not.toBe(lastDay);
    expect(newYear.reentries).toEqual({ year: 2027, count: 0, recent: [] });
  });
});

describe('StarlinkService when one upstream fails', () => {
  it('still serves the re-entries when the orbits fail, dated by the re-entries', async () => {
    const snapshot = await service({
      orbits: new InMemoryOrbitSource(capturedOrbits(), down)
    }).snapshot();
    expect(snapshot).toMatchObject({
      updatedAt: REENTRIES_READ_AT,
      inOrbit: null,
      satellites: null,
      reentries: { year: 2026, count: 83 }
    });
  });

  it('still serves the orbits when the re-entries fail', async () => {
    const snapshot: StarlinkSnapshot = await service({
      reentries: new InMemoryReentrySource(capturedReentries(), down)
    }).snapshot();
    expect(snapshot.reentries).toBeNull();
    expect(snapshot.inOrbit).toBe(200);
    expect(snapshot.updatedAt).toBe(ORBITS_READ_AT);
  });

  it('throws when both fail', async () => {
    await expect(
      service({
        orbits: new InMemoryOrbitSource(capturedOrbits(), down),
        reentries: new InMemoryReentrySource(capturedReentries(), down)
      }).snapshot()
    ).rejects.toThrow('celestrak down');
  });
});
