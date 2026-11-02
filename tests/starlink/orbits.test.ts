import { describe, expect, it } from 'bun:test';
import {
  EARTH_RADIUS_KM,
  positionAt
} from '../../src/public/static/js/orbits.js';
import type { Satellite } from '../../src/starlink/domain';
import reference from '../fixtures/sgp4-reference.json';
import { sampleStarlink } from './fakes';

const served = async (): Promise<Satellite[]> =>
  (await sampleStarlink().snapshot()).satellites ?? [];

const earthFixedKm = ({
  lat,
  lng,
  altKm
}: {
  lat: number;
  lng: number;
  altKm: number;
}): number[] => {
  const r = EARTH_RADIUS_KM + altKm;
  const φ = (lat * Math.PI) / 180;
  const λ = (lng * Math.PI) / 180;
  return [
    r * Math.cos(φ) * Math.cos(λ),
    r * Math.cos(φ) * Math.sin(λ),
    r * Math.sin(φ)
  ];
};

const distanceKm = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const equatorial = (meanMotionDot: number): Satellite => ({
  id: 1,
  name: 'TEST',
  epoch: '2026-10-30T00:00:00.000Z',
  meanMotion: 15,
  meanMotionDot,
  eccentricity: 0,
  inclination: 0,
  raan: 0,
  argOfPerigee: 0,
  meanAnomaly: 0
});

describe('positionAt against an independent SGP4 run', () => {
  it('records how the reference was made', () => {
    expect(reference.madeWith).toMatch(/sgp4 \d+\.\d+/);
    expect(reference.method).toContain('from_omm');
  });

  it('covers at least 3 satellites at epoch + 0, 6 and 24 hours', () => {
    const ids = new Set(reference.positions.map((p) => p.id));
    expect(ids.size).toBeGreaterThanOrEqual(3);
    for (const id of ids)
      expect(
        reference.positions
          .filter((p) => p.id === id)
          .map((p) => p.hoursFromEpoch)
      ).toEqual([0, 6, 24]);
  });

  it('stays within 50 km of SGP4 at every point, from the elements the API serves', async () => {
    const satellites = await served();
    const errors = reference.positions.map((ref) => {
      const sat = satellites.find((s) => s.id === ref.id);
      if (!sat) throw new Error(`no served satellite ${ref.id}`);
      const at = positionAt(sat, new Date(ref.at));
      return {
        name: ref.name,
        hours: ref.hoursFromEpoch,
        km: Math.round(distanceKm(earthFixedKm(at), ref.itrsKm) * 10) / 10
      };
    });
    if (process.env.PRINT_ERRORS) console.table(errors);
    for (const error of errors)
      expect({ ...error, within50: error.km <= 50 }).toEqual({
        ...error,
        within50: true
      });
  });
});

describe('positionAt', () => {
  it("reads meanMotionDot as CelesTrak's ndot/2 in rev/day², so 0.01 puts a satellite 0.01 rev (3.6°) ahead after a day", () => {
    const day = new Date('2026-10-31T00:00:00.000Z');
    const drag = positionAt(equatorial(0.01), day);
    const none = positionAt(equatorial(0), day);
    const ahead = (((drag.lng - none.lng) % 360) + 360) % 360;
    expect(ahead).toBeCloseTo(3.6, 6);
  });

  it('adds a quarter of the day-one lead after half a day, since the term grows with t²', () => {
    const halfDay = new Date('2026-10-30T12:00:00.000Z');
    const drag = positionAt(equatorial(0.01), halfDay);
    const none = positionAt(equatorial(0), halfDay);
    const ahead = (((drag.lng - none.lng) % 360) + 360) % 360;
    expect(ahead).toBeCloseTo(0.9, 6);
  });

  it('keeps latitude within the inclination and longitude in [-180, 180)', async () => {
    const satellites = await served();
    const at = new Date('2026-10-30T04:30:00.000Z');
    for (const sat of satellites) {
      const { lat, lng } = positionAt(sat, at);
      const limit = Math.min(sat.inclination, 180 - sat.inclination) + 0.01;
      expect({ id: sat.id, ok: Math.abs(lat) <= limit }).toEqual({
        id: sat.id,
        ok: true
      });
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThan(180);
    }
  });

  it('puts operational Starlink satellites between 300 and 600 km up', async () => {
    const satellites = await served();
    const at = new Date('2026-10-30T04:30:00.000Z');
    const operational = satellites.filter(
      (s) => Math.abs(s.meanMotionDot) < 0.0002
    );
    expect(operational.length).toBeGreaterThan(100);
    for (const sat of operational) {
      const { altKm } = positionAt(sat, at);
      expect({ id: sat.id, ok: altKm > 300 && altKm < 600 }).toEqual({
        id: sat.id,
        ok: true
      });
    }
  });

  it('leaves the satellite it is given unchanged', () => {
    const sat = equatorial(0.01);
    const copy = { ...sat };
    positionAt(sat, new Date('2026-10-31T00:00:00.000Z'));
    expect(sat).toEqual(copy);
  });

  it('places 11,130 satellites in under 8 ms in Bun, warm', async () => {
    const satellites = await served();
    const fleet = Array.from(
      { length: 11_130 },
      (_, i) => satellites[i % satellites.length]
    );
    const at = new Date('2026-10-30T04:30:00.000Z');
    const runs = Array.from({ length: 5 }, () => {
      const start = performance.now();
      for (const sat of fleet) positionAt(sat, at);
      return performance.now() - start;
    });
    if (process.env.PRINT_ERRORS)
      console.log(
        `11,130 positions: ${runs.map((ms) => ms.toFixed(2)).join(', ')} ms`
      );
    expect(Math.min(...runs)).toBeLessThan(8);
  });
});
