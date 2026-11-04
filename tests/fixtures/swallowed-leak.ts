import { expect, it } from 'bun:test';

const price = () =>
  fetch('https://api.coingecko.com/api/v3/ping').then(
    () => 'live',
    () => 'unavailable'
  );

it('answers "unavailable" when CoinGecko cannot be reached', async () => {
  expect(await price()).toBe('unavailable');
});
