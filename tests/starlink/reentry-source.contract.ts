import { describe, expect, it } from 'bun:test';
import type { ReentrySource } from '../../src/starlink/ports';

export type ReentryContractSubject = {
  make: () => ReentrySource;
  makeFailing: () => ReentrySource;
};

const isIsoUtc = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  new Date(value).toISOString() === value;

const isCalendarDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

export const describeReentrySource = (
  name: string,
  subject: ReentryContractSubject
): void => {
  describe(`${name} meets the ReentrySource contract`, () => {
    it('1. returns at least one re-entry', async () => {
      const { reentries } = await subject.make().fetchReentries();
      expect(reentries.length).toBeGreaterThan(0);
    });

    it('2. gives each re-entry a unique positive integer id', async () => {
      const { reentries } = await subject.make().fetchReentries();
      const ids = reentries.map((r) => r.id);
      for (const id of ids)
        expect(Number.isSafeInteger(id) && id > 0).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('3. names every satellite', async () => {
      const { reentries } = await subject.make().fetchReentries();
      for (const { name } of reentries) expect(name.trim()).not.toBe('');
    });

    it('4. dates the launch and the re-entry as YYYY-MM-DD, in that order', async () => {
      const { reentries } = await subject.make().fetchReentries();
      for (const r of reentries) {
        expect({
          id: r.id,
          launched: isCalendarDate(r.launched),
          reentered: isCalendarDate(r.reentered),
          inOrder: r.launched <= r.reentered
        }).toEqual({
          id: r.id,
          launched: true,
          reentered: true,
          inOrder: true
        });
      }
    });

    it('5. carries only the domain fields', async () => {
      const log = await subject.make().fetchReentries();
      expect(Object.keys(log).sort()).toEqual(['readAt', 'reentries']);
      for (const r of log.reentries)
        expect(Object.keys(r).sort()).toEqual([
          'id',
          'launched',
          'name',
          'reentered'
        ]);
    });

    it('6. says when the catalogue was read, as an ISO 8601 UTC timestamp', async () => {
      const { readAt } = await subject.make().fetchReentries();
      expect(isIsoUtc(readAt)).toBe(true);
    });

    it('7. throws when the upstream fails', async () => {
      await expect(subject.makeFailing().fetchReentries()).rejects.toThrow();
    });
  });
};
