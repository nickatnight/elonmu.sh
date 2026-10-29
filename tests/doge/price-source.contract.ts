import { describe, expect, it } from 'bun:test';
import type { PriceSource } from '../../src/doge/ports';

export type ContractSubject = {
  make: () => PriceSource;
  makeFailing: () => PriceSource;
};

export const describePriceSource = (
  name: string,
  subject: ContractSubject
): void => {
  describe(`${name} meets the PriceSource contract`, () => {
    it('1. returns a finite US dollar price above zero', async () => {
      const { usd } = await subject.make().fetchPrice();
      expect(Number.isFinite(usd)).toBe(true);
      expect(usd).toBeGreaterThan(0);
    });

    it('2. returns the time of the price as an ISO 8601 UTC timestamp', async () => {
      const { at } = await subject.make().fetchPrice();
      expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(at).toISOString()).toBe(at);
    });

    it('3. carries only the price and its time', async () => {
      expect(Object.keys(await subject.make().fetchPrice()).sort()).toEqual([
        'at',
        'usd'
      ]);
    });

    it('4. throws when the upstream fails', async () => {
      await expect(subject.makeFailing().fetchPrice()).rejects.toThrow();
    });
  });
};
