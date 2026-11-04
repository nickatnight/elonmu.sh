import { afterAll, expect, it } from 'bun:test';

afterAll(async () => {
  await fetch('https://api.coingecko.com/api/v3/ping').catch(() => undefined);
});

it('passes on its own', () => {
  expect(true).toBe(true);
});
