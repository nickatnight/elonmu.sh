import { expect, it } from 'bun:test';

it('passes before its callback runs', () => {
  setImmediate(() => {
    fetch('https://api.coingecko.com/api/v3/ping').catch(() => undefined);
  });
  expect(true).toBe(true);
});
