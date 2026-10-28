import { describe, expect, it } from 'bun:test';
import type { DayViews, IsoDate } from '../../src/hype/domain';
import type { PageviewSource } from '../../src/hype/ports';

export type ContractSubject = {
  make: () => PageviewSource;
  makeFailing: () => PageviewSource;
  from: Date;
  to: Date;
  missing: IsoDate;
};

const day = (at: Date): IsoDate => at.toISOString().slice(0, 10);

export const assertDayShape = (days: DayViews[]): void => {
  for (const { date, views } of days) {
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(day(new Date(`${date}T00:00:00.000Z`))).toBe(date);
    expect(Number.isInteger(views)).toBe(true);
    expect(views).toBeGreaterThanOrEqual(0);
  }
};

export const describePageviewSource = (
  name: string,
  subject: ContractSubject
): void => {
  describe(`${name} meets the PageviewSource contract`, () => {
    it('1. returns only days in [from, to], ascending, each date once', async () => {
      const { from, to } = subject;
      const days = await subject.make().fetchDays(from, to);
      expect(days.length).toBeGreaterThan(0);
      const dates = days.map((d) => d.date);
      expect(dates[0] >= day(from)).toBe(true);
      expect((dates.at(-1) as string) <= day(to)).toBe(true);
      for (let i = 1; i < dates.length; i++)
        expect(dates[i] > dates[i - 1]).toBe(true);
    });

    it('2. returns YYYY-MM-DD dates and non-negative integer views', async () => {
      assertDayShape(await subject.make().fetchDays(subject.from, subject.to));
    });

    it('3. leaves a day the upstream omitted missing, never zero-filled', async () => {
      const days = await subject.make().fetchDays(subject.from, subject.to);
      expect(days.find((d) => d.date === subject.missing)).toBeUndefined();
    });

    it('4. throws when the upstream fails', async () => {
      await expect(
        subject.makeFailing().fetchDays(subject.from, subject.to)
      ).rejects.toThrow();
    });
  });
};
