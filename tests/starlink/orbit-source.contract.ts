import { describe, expect, it } from 'bun:test';
import type { OrbitSource } from '../../src/starlink/ports';

export type OrbitContractSubject = {
  make: () => OrbitSource;
  makeFailing: () => OrbitSource;
};

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const isIsoUtc = (value: string): boolean =>
  ISO_UTC.test(value) && new Date(value).toISOString() === value;

export const describeOrbitSource = (
  name: string,
  subject: OrbitContractSubject
): void => {
  describe(`${name} meets the OrbitSource contract`, () => {
    it('1. returns at least one satellite', async () => {
      const { satellites } = await subject.make().fetchOrbits();

      expect(satellites.length).toBeGreaterThan(0);
    });

    it('2. gives each satellite a unique positive integer id', async () => {
      const { satellites } = await subject.make().fetchOrbits();
      const ids = satellites.map((s) => s.id);

      for (const id of ids)
        expect(Number.isSafeInteger(id) && id > 0).toBe(true);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('3. names every satellite', async () => {
      const { satellites } = await subject.make().fetchOrbits();

      for (const { name } of satellites) expect(name.trim()).not.toBe('');
    });

    it('4. gives each epoch as an ISO 8601 UTC timestamp', async () => {
      const { satellites } = await subject.make().fetchOrbits();

      for (const { epoch } of satellites) expect(isIsoUtc(epoch)).toBe(true);
    });

    it('5. gives finite elements an orbit can have', async () => {
      const { satellites } = await subject.make().fetchOrbits();

      for (const s of satellites) {
        const elements = [
          s.meanMotion,
          s.meanMotionDot,
          s.eccentricity,
          s.inclination,
          s.raan,
          s.argOfPerigee,
          s.meanAnomaly
        ];

        expect({ id: s.id, finite: elements.every(Number.isFinite) }).toEqual({
          id: s.id,
          finite: true
        });
        expect(s.meanMotion).toBeGreaterThan(0);
        expect(s.eccentricity).toBeGreaterThanOrEqual(0);
        expect(s.eccentricity).toBeLessThan(1);
        expect(s.inclination).toBeGreaterThanOrEqual(0);
        expect(s.inclination).toBeLessThanOrEqual(180);
      }
    });

    it('6. carries only the domain fields', async () => {
      const catalog = await subject.make().fetchOrbits();

      expect(Object.keys(catalog).sort()).toEqual(['readAt', 'satellites']);

      for (const s of catalog.satellites)
        expect(Object.keys(s).sort()).toEqual([
          'argOfPerigee',
          'eccentricity',
          'epoch',
          'id',
          'inclination',
          'meanAnomaly',
          'meanMotion',
          'meanMotionDot',
          'name',
          'raan'
        ]);
    });

    it('7. says when the catalogue was read, as an ISO 8601 UTC timestamp', async () => {
      const { readAt } = await subject.make().fetchOrbits();

      expect(isIsoUtc(readAt)).toBe(true);
    });

    it('8. throws when the upstream fails', async () => {
      await expect(subject.makeFailing().fetchOrbits()).rejects.toThrow();
    });
  });
};
